# JalRakshak sensor node: hardware, firmware and gateway

The field side of JalRakshak: a solar-powered ESP32 node that reads pressure, flow, **acoustic (leak noise)** and **residual chlorine** (plus tank level and pump current on the pump-house node), and a Raspberry Pi gateway that forwards the readings over 4G to the platform.

Circuit diagram: [`docs/submission/architecture/circuit.png`](../docs/submission/architecture/circuit.png) · Architecture: [`docs/submission/architecture/`](../docs/submission/architecture/)

```
sensors ──► ESP32 node ──LoRa──► Raspberry Pi gateway ──4G / MQTT / HTTPS──► JalRakshak API ──► rules + AI/ML ──► alerts
(4-20 mA, pulse,        (firmware/)        (gateway/bridge.py)                   /api/v1/ingest/readings
 piezo, ultrasonic)
```

## Parts per node

| Part | Used for | Connects by |
|---|---|---|
| ESP32 DevKit | Reads sensors, deep-sleeps between samples | – |
| ADS1115 16-bit ADC | Accurate reading of the 4-20 mA loops | I2C: SDA 21, SCL 22, address 0x48 |
| Pressure transmitter, 4-20 mA, 0-10 bar | Head / tail pressure | 24 V loop, 150 Ω shunt, ADS1115 A0 |
| Residual chlorine probe with 4-20 mA transmitter, in a flow cell | Measured free chlorine at the tail end | 24 V loop, 150 Ω shunt, ADS1115 A1 |
| Piezo contact sensor + LM358 pre-amp and 100 Hz-2 kHz band-pass | Leak noise on the pipe | ESP32 ADC pin 35 |
| Hall flow meter | Head / tail flow | Pulse to pin 34 with a 10 kΩ pull-up to 3V3 |
| JSN-SR04T ultrasonic (pump-house node) | Tank level | TRIG 25, ECHO 27 through a 1 kΩ / 2 kΩ divider |
| SCT-013-030 CT clamp (pump-house node) | Pump current | ESP32 ADC pin 36, biased to mid-rail |
| SX1276 / RFM95W LoRa module | Link to the gateway | SPI: SCK 18, MISO 19, MOSI 23, NSS 5, RST 14, DIO0 26 |
| 12 V 10 W solar panel, charge controller, 12 V 7 Ah battery, buck 12→5 V, boost 12→24 V, IP65 box | Off-grid power | See the circuit diagram |

## What is in this folder

| Path | What it is |
|---|---|
| `firmware/node.py` | The node logic: signal to value, batch building, store-and-forward. No board imports. |
| `firmware/board.py` | The ESP32 layer: ADS1115 driver, ADC sampling, pulse counter, ultrasonic, battery. |
| `firmware/config.py` | Node id, device key, pins, and how each sensor is scaled. |
| `firmware/transport.py`, `firmware/main.py` | Send over WiFi/4G or LoRa; the main loop. |
| `gateway/bridge.py` | Raspberry Pi bridge: checks the device key, forwards with a buffer when 4G drops. |
| `wokwi/` | A runnable ESP32 simulation (potentiometers stand in for the sensors). |

## Try it without hardware (Wokwi)

1. Run `python hardware/wokwi/build.py` (it writes `wokwi/main.py` from the real `node.py`).
2. On wokwi.com start a new **MicroPython on ESP32** project. Replace `main.py` and `diagram.json` with the two files from `hardware/wokwi/`. If Wokwi rejects a pin name in `diagram.json`, fix it in the diagram editor: the wiring is pressure pot to pin 33, chlorine pot to VN (GPIO39), acoustic pot to pin 35, battery pot to pin 32.
3. Press **Start**. The serial monitor prints, every 3 seconds, the exact JSON line the node would send over LoRa. Turn a potentiometer: pressure and chlorine values follow it, and below 0.6 V the loop reads as a **wire break** and the sensor is left out of the batch.
4. To see it reach the platform, paste a printed line into the gateway: `python hardware/gateway/bridge.py --url http://127.0.0.1:8000`.

## Real hardware

```bash
pip install mpremote
cd hardware/firmware
# edit config.py: NODE_ID, DEVICE_KEY, API_URL (or TRANSPORT = "lora")
mpremote connect COM5 cp config.py node.py board.py transport.py main.py :
mpremote connect COM5 reset
```

On the Raspberry Pi: `JALRAKSHAK_DEVICE_KEYS="node-a:KEY,node-b:KEY" python gateway/bridge.py --url https://your-api < /dev/ttyUSB0`. Use per-device keys; the `dev-key-...` values are for local development only.

## What is tested, and what is not

- **Tested (`pytest backend/tests/test_firmware_node.py`):** the firmware logic against the real API. A fake board produces the electrical signals (loop voltages, pulse trains, acoustic waveforms, echo times) for the same scenarios as the simulator; the firmware must recover the true values, pass the API's own validation, buffer while the link is down, and a leak or a chlorine failure must raise the right alerts end to end.
- **Not yet run on a real board:** `board.py` (pin handling, the ADS1115 register writes) and the analog front end. They need the parts, and a bench calibration (pressure against a gauge, chlorine against a DPD test kit, acoustic baseline per pipe).
