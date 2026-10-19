"""Builds hardware/wokwi/main.py: the real node.py logic plus a small board layer for the Wokwi ESP32 simulator.

Wokwi has no ADS1115, flow meter or 500 Hz signal source, so in the simulator:
  - potentiometers stand in for the two 4-20 mA loop voltages (pressure, chlorine) on the ESP32's own ADC pins
  - a third potentiometer stands in for the acoustic envelope level (envelope-detector front end)
  - the node prints exactly the JSON line it would send over LoRa to the gateway
Run:  python build.py     then paste main.py and diagram.json into a new Wokwi MicroPython ESP32 project."""

import re
from pathlib import Path

here = Path(__file__).resolve().parent
node_src = (here.parent / "firmware" / "node.py").read_text(encoding="utf-8")
node_src = re.sub(r'^""".*?"""\n', "", node_src, count=1, flags=re.S)  # drop the module docstring

head = '''"""JalRakshak node on Wokwi: pressure + chlorine loops and acoustic level from potentiometers. Prints the LoRa line."""
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

'''

board = '''

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
'''
(here / "main.py").write_text(head + node_src.strip() + board, encoding="utf-8")
print("wrote", here / "main.py")
