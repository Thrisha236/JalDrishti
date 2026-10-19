"""How a batch leaves the node: straight to the API over WiFi/4G, or as one JSON line over LoRa to the village gateway.

send(batch) returns True (accepted), False (link down: keep the batch), or raises ValueError (rejected: drop it)."""

import json

import config


def http_sender():
    import urequests  # MicroPython; on a PC use requests-compatible shims in the tests

    url = config.API_URL + "/api/v1/ingest/readings"
    headers = {"Content-Type": "application/json", "X-Device-Key": config.DEVICE_KEY}

    def send(batch):
        try:
            res = urequests.post(url, data=json.dumps(batch), headers=headers)
        except OSError:
            return False  # no network
        try:
            if res.status_code == 201:
                return True
            if 400 <= res.status_code < 500:
                raise ValueError(f"rejected ({res.status_code}): {res.text[:120]}")
            return False  # server error: try again later
        finally:
            res.close()

    return send


def lora_sender(uart):
    """The SX1276 module is driven by a LoRa UART firmware or library; here each batch is one compact JSON line with
    the device key, which the Raspberry Pi gateway (gateway/bridge.py) checks and forwards to the API."""

    def send(batch):
        line = json.dumps({"key": config.DEVICE_KEY, "batch": batch}, separators=(",", ":")) + "\n"
        uart.write(line.encode())
        return True  # LoRa here is fire-and-forget; the gateway buffers

    return send
