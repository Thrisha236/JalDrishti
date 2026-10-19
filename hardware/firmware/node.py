"""Node logic: turn electrical signals into sensor values and build the batch the API expects.

Pure Python with no board imports, so the same code runs on the ESP32 (MicroPython) and in the host tests.
The board-specific part lives in board.py and is passed in as `io`.

io must provide:
    loop_volts(ads_channel) -> volts across the 150 ohm shunt of a 4-20 mA loop
    acoustic_samples(n) -> list of n ADC readings in millivolts (pre-amp output)
    ct_samples(n) -> list of n ADC readings in millivolts (CT clamp, biased at mid-rail)
    pulse_count_and_reset() -> (pulses, seconds since the last call)
    distance_m() -> echo distance in metres, or None if no echo
    battery_volts() -> battery voltage
    now_iso() -> timestamp string, or None to let the API stamp the arrival time
"""

import math


def ma_from_volts(volts, shunt_ohms):
    return volts / shunt_ohms * 1000.0


def scale_loop(ma, lo, hi):
    """4 mA -> lo, 20 mA -> hi (linear)."""
    return lo + (ma - 4.0) / 16.0 * (hi - lo)


def ac_rms_mv(samples_mv):
    """RMS of the AC part of a signal: remove the DC bias, then root-mean-square."""
    if not samples_mv:
        return 0.0
    mean = sum(samples_mv) / len(samples_mv)
    return math.sqrt(sum((x - mean) ** 2 for x in samples_mv) / len(samples_mv))


class Node:
    def __init__(self, cfg, io):
        self.cfg = cfg
        self.io = io
        self.sensors = cfg.SENSORS[cfg.NODE_ID]
        self.faults = {}  # sensor id -> reason, for the last sample
        self.buffer = []  # unsent batches, oldest first

    # ---- one measurement per sensor kind ----
    def read(self, sensor_id, spec):
        how = spec["how"]
        if how == "loop":
            ma = ma_from_volts(self.io.loop_volts(spec["ads"]), self.cfg.SHUNT_OHMS)
            if ma < self.cfg.FAULT_MA_LOW or ma > self.cfg.FAULT_MA_HIGH:
                self.faults[sensor_id] = f"4-20 mA loop at {ma:.1f} mA (wire break or short)"
                return None
            return scale_loop(ma, spec["lo"], spec["hi"])
        if how == "pulses":
            pulses, seconds = self.io.pulse_count_and_reset()
            if seconds <= 0:
                return None
            return pulses / seconds / spec["k"]
        if how == "acoustic":
            return ac_rms_mv(self.io.acoustic_samples(self.cfg.ACOUSTIC_SAMPLES))
        if how == "acoustic_level":
            # envelope-detector front end (diode + RC after the band-pass): the ADC sees the loudness as a slow DC level
            samples = self.io.acoustic_samples(self.cfg.ACOUSTIC_SAMPLES)
            return sum(samples) / len(samples) if samples else None
        if how == "ct":
            volts_rms = ac_rms_mv(self.io.ct_samples(self.cfg.ACOUSTIC_SAMPLES)) / 1000.0
            return volts_rms * spec["amps_per_volt"]
        if how == "ultrasonic":
            d = self.io.distance_m()
            if d is None:
                self.faults[sensor_id] = "no echo from the level sensor"
                return None
            return max(0.0, spec["tank_height_m"] - d)
        raise ValueError(f"unknown sensor type {how!r}")

    def sample(self):
        """Read every sensor once. A sensor that faults is left out of the batch (the API's own sensor-health
        rules then treat it as missing) and noted in self.faults."""
        self.faults = {}
        readings = []
        for sensor_id, spec in self.sensors.items():
            value = self.read(sensor_id, spec)
            if value is not None:
                readings.append({"sensor_id": sensor_id, "value": round(value, 3)})
        batch = {"node_id": self.cfg.NODE_ID, "readings": readings, "battery_v": round(self.io.battery_volts() * self.cfg.BATTERY_DIVIDER, 2)}
        ts = self.io.now_iso()
        if ts:
            batch["ts"] = ts
        return batch

    # ---- store and forward ----
    def queue(self, batch):
        self.buffer.append(batch)
        if len(self.buffer) > self.cfg.BUFFER_MAX:
            self.buffer.pop(0)  # the oldest is the least useful

    def flush(self, send):
        """Send queued batches oldest first. `send(batch)` returns True when the platform accepted it, False if
        the link is down (stop and keep the rest), and raises ValueError if the platform rejected the batch for good."""
        sent = 0
        while self.buffer:
            try:
                ok = send(self.buffer[0])
            except ValueError:
                self.buffer.pop(0)  # rejected: retrying will not help
                continue
            if not ok:
                break
            self.buffer.pop(0)
            sent += 1
        return sent
