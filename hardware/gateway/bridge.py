"""Village gateway bridge (Raspberry Pi, standard library only).

Reads one JSON line per batch from the LoRa receiver ({"key": "...", "batch": {...}}), checks the node's key, and
forwards the batch to the API. If the 4G link is down, batches are kept (oldest dropped first past the limit) and
replayed in order, each with its original timestamp, when the link returns.

Run:   python bridge.py --url https://api.example.in < /dev/ttyUSB0        (or pipe the output of your LoRa receiver)
Keys:  JALRAKSHAK_DEVICE_KEYS="node-a:key-a,node-b:key-b"  (the same list the API uses)"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
MAX_QUEUE = 2000


def device_keys():
    raw = os.environ.get("JALRAKSHAK_DEVICE_KEYS", "node-a:dev-key-node-a,node-b:dev-key-node-b")
    return dict(pair.split(":", 1) for pair in raw.split(",") if ":" in pair)


def http_post(url, batch, key, timeout=8):
    """Returns True accepted, False link down / server error (keep and retry), raises ValueError if rejected for good."""
    req = urllib.request.Request(
        url + "/api/v1/ingest/readings", data=json.dumps(batch).encode(), method="POST",
        headers={"Content-Type": "application/json", "X-Device-Key": key},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout):
            return True
    except urllib.error.HTTPError as err:
        if 400 <= err.code < 500:
            raise ValueError(f"rejected ({err.code}): {err.read().decode(errors='replace')[:120]}")
        return False
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
        return False


class Bridge:
    def __init__(self, keys, post):
        self.keys, self.post = keys, post
        self.queue = deque(maxlen=MAX_QUEUE)  # (key, batch)

    def accept(self, line):
        """Handle one received line. Returns 'queued' or an error word; call flush() to forward."""
        try:
            msg = json.loads(line)
            batch, key = msg["batch"], msg["key"]
            node = batch["node_id"]
        except (ValueError, KeyError, TypeError):
            return "bad_line"
        if self.keys.get(node) != key:
            return "bad_key"  # not one of our nodes; never forwarded
        # Stamp batches that arrive without a time with the gateway's clock, so a replay keeps the right moment.
        batch.setdefault("ts", datetime.now(IST).isoformat(timespec="seconds"))
        self.queue.append((key, batch))
        return "queued"

    def flush(self):
        sent = 0
        while self.queue:
            key, batch = self.queue[0]
            try:
                ok = self.post(batch, key)
            except ValueError:
                self.queue.popleft()
                continue
            if not ok:
                break
            self.queue.popleft()
            sent += 1
        return sent


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=os.environ.get("JALRAKSHAK_API", "http://127.0.0.1:8000"))
    args = parser.parse_args()
    bridge = Bridge(device_keys(), lambda batch, key: http_post(args.url, batch, key))
    for line in sys.stdin:
        status = bridge.accept(line)
        sent = bridge.flush()
        print(f"{time.strftime('%H:%M:%S')} {status}; forwarded {sent}; waiting {len(bridge.queue)}", flush=True)


if __name__ == "__main__":
    main()
