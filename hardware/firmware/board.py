"""ESP32 (MicroPython) hardware layer: ADS1115, native ADC, pulse counter, ultrasonic, battery.

Everything that touches a pin lives here. node.py never imports machine, so it can be tested on a PC.
Not run by the host tests: it needs the board (or the Wokwi ESP32 simulator, with ADC_MODE = "native")."""

import time

from machine import ADC, I2C, Pin, time_pulse_us

import config

ADS_ADDR = 0x48


class ADS1115:
    """Minimal single-shot driver: +/-4.096 V range, 128 samples per second, one channel at a time."""

    def __init__(self, i2c, addr=ADS_ADDR):
        self.i2c, self.addr = i2c, addr

    def volts(self, channel):
        # config register: OS=1 start, MUX=100+channel (single-ended), PGA=001 (+/-4.096 V), MODE=1 (single-shot), DR=100 (128 SPS), comparator off
        msb = 0x80 | ((4 + channel) << 4) | (0b001 << 1) | 0x01
        self.i2c.writeto_mem(self.addr, 0x01, bytes([msb, 0x83]))
        time.sleep_ms(9)  # one conversion at 128 SPS is about 8 ms
        raw = int.from_bytes(self.i2c.readfrom_mem(self.addr, 0x00, 2), "big")
        if raw & 0x8000:
            raw -= 1 << 16
        return raw * 4.096 / 32768


class Board:
    def __init__(self):
        p = config.PINS
        self.ads = None
        if config.ADC_MODE == "ads1115":
            self.ads = ADS1115(I2C(0, sda=Pin(p["i2c_sda"]), scl=Pin(p["i2c_scl"]), freq=400000))
        else:  # native: the ESP32's own ADC, 0-3.3 V. Fine for a bench or the Wokwi simulator.
            self.native = [ADC(Pin(p["adc0"])) if "adc0" in p else None, ADC(Pin(p["adc1"])) if "adc1" in p else None]
            for a in self.native:
                if a:
                    a.atten(ADC.ATTN_11DB)
        self.acoustic = ADC(Pin(p["acoustic"]))
        self.acoustic.atten(ADC.ATTN_11DB)
        self.ct = ADC(Pin(p["ct_clamp"])) if "ct_clamp" in p else None
        if self.ct:
            self.ct.atten(ADC.ATTN_11DB)
        self.battery = ADC(Pin(p["battery"]))
        self.battery.atten(ADC.ATTN_11DB)
        self.pulses = 0
        self.last = time.ticks_ms()
        Pin(p["flow_pulse"], Pin.IN).irq(trigger=Pin.IRQ_FALLING, handler=self._pulse)
        self.trig = Pin(p["us_trig"], Pin.OUT)
        self.echo = Pin(p["us_echo"], Pin.IN)

    def _pulse(self, _pin):
        self.pulses += 1

    # ---- the io interface node.py expects ----
    def loop_volts(self, ads_channel):
        if self.ads:
            return self.ads.volts(ads_channel)
        return self.native[ads_channel].read_uv() / 1e6

    def _samples(self, adc, n):
        out = []
        for _ in range(n):
            out.append(adc.read_uv() / 1000.0)  # millivolts
            time.sleep_us(200)  # about 4 kHz
        return out

    def acoustic_samples(self, n):
        return self._samples(self.acoustic, n)

    def ct_samples(self, n):
        return self._samples(self.ct, n) if self.ct else []

    def pulse_count_and_reset(self):
        now = time.ticks_ms()
        seconds = time.ticks_diff(now, self.last) / 1000.0
        count, self.pulses, self.last = self.pulses, 0, now
        return count, seconds

    def distance_m(self):
        self.trig.off(); time.sleep_us(2)
        self.trig.on(); time.sleep_us(12)
        self.trig.off()
        us = time_pulse_us(self.echo, 1, 30000)
        return None if us < 0 else us / 1e6 * 343.0 / 2  # speed of sound 343 m/s, there and back

    def battery_volts(self):
        return self.battery.read_uv() / 1e6

    def now_iso(self):
        return None  # no RTC on the bench node: the API stamps the arrival time
