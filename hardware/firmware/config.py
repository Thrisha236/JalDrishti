"""Settings for one JalRakshak sensor node. Edit NODE_ID and the keys, flash, done.

The sensor ids below are the ids the platform already knows (seed/ramapuram.json). Each entry says how the
electrical signal is turned into a value. Change a number here, not in the code."""

NODE_ID = "node-b"  # "node-a" = pump house + tank, "node-b" = tail end of the pipeline
DEVICE_KEY = "dev-key-node-b"  # per-device secret; the API rejects a node without its key. Local development value.

# ---- how readings reach the platform ----
TRANSPORT = "http"  # "http": WiFi/4G straight to the API (bench, Wokwi) | "lora": JSON lines to the Raspberry Pi gateway
API_URL = "http://192.168.1.10:8000"  # the API (or the gateway's address)
SAMPLE_EVERY_S = 5  # seconds between batches; the node sleeps in between
BUFFER_MAX = 200  # unsent batches kept in RAM if the link is down (oldest dropped first)

# ---- analog front end ----
ADC_MODE = "ads1115"  # "ads1115": 16-bit external ADC over I2C (real node) | "native": ESP32 ADC pins (Wokwi / quick bench)
SHUNT_OHMS = 150.0  # 4-20 mA becomes 0.6-3.0 V across this resistor
FAULT_MA_LOW, FAULT_MA_HIGH = 3.6, 21.0  # outside this the loop is broken or shorted: report the fault, not a value

# ---- pins (ESP32 DevKit) ----
PINS = {
    "i2c_sda": 21, "i2c_scl": 22,
    "lora_sck": 18, "lora_miso": 19, "lora_mosi": 23, "lora_nss": 5, "lora_rst": 14, "lora_dio0": 26,
    "acoustic": 35,  # pre-amp + band-pass output
    "ct_clamp": 36,  # SCT-013 on the pump cable (node A)
    "flow_pulse": 34,  # pulse-output water meter, 10 k pull-up to 3V3
    "us_trig": 25, "us_echo": 27,  # JSN-SR04T (echo through a 1 k / 2 k divider)
    "battery": 32,  # battery through a 2:1 divider
    "adc0": 33, "adc1": 39,  # only used when ADC_MODE = "native" (Wokwi / quick bench): pressure and chlorine loop voltages
}

# ---- sensors per node: id -> how to read it ----
# "ads": ADS1115 channel carrying a 4-20 mA loop; lo/hi: the value at 4 mA and at 20 mA.
SENSORS = {
    "node-a": {
        "sen-head-pressure": {"how": "loop", "ads": 0, "lo": 0.0, "hi": 10.0},  # bar
        "sen-head-chlorine": {"how": "loop", "ads": 1, "lo": 0.0, "hi": 5.0},  # mg/L
        "sen-head-flow": {"how": "pulses", "k": 7.5},  # pulses per second per L/min (YF-S201 class meter)
        "sen-head-acoustic": {"how": "acoustic"},  # mV RMS after the pre-amp
        "sen-pump-current": {"how": "ct", "amps_per_volt": 30.0},  # SCT-013-030: 1 V = 30 A
        "sen-tank-level": {"how": "ultrasonic", "tank_height_m": 4.5},
    },
    "node-b": {
        "sen-tail-pressure": {"how": "loop", "ads": 0, "lo": 0.0, "hi": 10.0},
        "sen-tail-chlorine": {"how": "loop", "ads": 1, "lo": 0.0, "hi": 5.0},
        "sen-tail-flow": {"how": "pulses", "k": 7.5},
        "sen-tail-acoustic": {"how": "acoustic"},
    },
}

ACOUSTIC_SAMPLES = 800  # ADC samples per measurement (about 200 ms at 4 kHz)
BATTERY_DIVIDER = 2.0
