"""Node entry point (MicroPython on the ESP32). Sample, queue, send, sleep, repeat.

Flash with:  mpremote connect COM5 cp config.py node.py board.py transport.py main.py :   then reset the board."""

import time

import config
import transport
from board import Board
from node import Node

board = Board()
node = Node(config, board)
send = transport.http_sender() if config.TRANSPORT == "http" else transport.lora_sender(__import__("machine").UART(1, baudrate=9600))

print("JalRakshak node", config.NODE_ID, "sensors:", ", ".join(node.sensors))
while True:
    batch = node.sample()
    node.queue(batch)
    sent = node.flush(send)
    print("sent", sent, "batch(es); queued", len(node.buffer), "faults:", node.faults or "none", "values:", {r["sensor_id"]: r["value"] for r in batch["readings"]})
    time.sleep(config.SAMPLE_EVERY_S)
