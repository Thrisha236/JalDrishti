"""JalRakshak node on Wokwi: pressure + chlorine loops and acoustic level from potentiometers. Prints the LoRa line."""
import json
import time

from machine import ADC, Pin

NODE_ID = "node-b"
DEVICE_KEY = "dev-key-node-b"
SAMPLE_EVERY_S = 3


class cfg:  # same fields as hardware/firmware/config.py, with the native ADC
    NODE_ID = NODE_ID
    SHUNT_OHMS = 150.0
    FAULT_MA_LOW, FAULT_MA_HIGH = 3.6, 21.0
    ACOUSTIC_SAMPLES = 40
    BATTERY_DIVIDER = 2.0
    BUFFER_MAX = 50
    SENSORS = {
        "node-b": {
            "sen-tail-pressure": {"how": "loop", "ads": 0, "lo": 0.0, "hi": 10.0},  # 4-20 mA = 0-10 bar
            "sen-tail-chlorine": {"how": "loop", "ads": 1, "lo": 0.0, "hi": 5.0},  # 4-20 mA = 0-5 mg/L
            "sen-tail-acoustic": {"how": "acoustic_level"},  # envelope level, mV
        }
    }

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

def mv(adc):
    try:
        return adc.read_uv() / 1000.0
    except AttributeError:
        return adc.read_u16() * 3300 / 65535


class WokwiBoard:
    def __init__(self):
        self.pressure = ADC(Pin(33)); self.chlorine = ADC(Pin(39)); self.acoustic = ADC(Pin(35)); self.battery = ADC(Pin(32))
        for a in (self.pressure, self.chlorine, self.acoustic, self.battery):
            a.atten(ADC.ATTN_11DB)

    def loop_volts(self, ch):
        return mv(self.pressure if ch == 0 else self.chlorine) / 1000.0

    def acoustic_samples(self, n):
        out = []
        for _ in range(n):
            out.append(mv(self.acoustic))
            time.sleep_ms(2)
        return out

    def ct_samples(self, n): return []
    def pulse_count_and_reset(self): return 0, 1.0
    def distance_m(self): return None
    def battery_volts(self): return mv(self.battery) / 1000.0
    def now_iso(self): return None


node = Node(cfg, WokwiBoard())
print("JalRakshak node", NODE_ID, "- turn the potentiometers; below 0.6 V a loop reads as a wire break")
while True:
    batch = node.sample()
    print(json.dumps({"key": DEVICE_KEY, "batch": batch}), "| faults:", node.faults or "none")
    time.sleep(SAMPLE_EVERY_S)
