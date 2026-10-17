"""JalRakshak sensor simulator: posts readings for Node A and Node B to the API, like a village gateway.

Usage (from the repository root, any Python 3.10+; no packages needed):
    python simulator/sim.py                      # normal operation, every 5 s
    python simulator/sim.py --scenario leak      # leak on P-21
    python simulator/sim.py --scenario pump-off
    python simulator/sim.py --scenario node-offline
    python simulator/sim.py --count 3 --interval 1

If the API cannot be reached, batches are kept and replayed with their original timestamps once it is
back (store-and-forward), the same way the real Raspberry Pi gateway is meant to behave.
Stop with Ctrl+C.
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from scenarios import SCENARIOS, batches_for  # noqa: E402

IST = timezone(timedelta(hours=5, minutes=30))
DEFAULT_KEYS = "node-a:dev-key-node-a,node-b:dev-key-node-b"  # local development only


def device_keys() -> dict[str, str]:
    raw = os.environ.get("JALRAKSHAK_DEVICE_KEYS", DEFAULT_KEYS)
    return dict(pair.split(":", 1) for pair in raw.split(",") if ":" in pair)


def post(url: str, body: dict, key: str, timeout: float = 5.0) -> dict:
    req = urllib.request.Request(
        f"{url}/api/v1/ingest/readings",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "X-Device-Key": key},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--scenario", default="normal", choices=list(SCENARIOS))
    parser.add_argument("--url", default=os.environ.get("JALRAKSHAK_API", "http://127.0.0.1:8000"))
    parser.add_argument("--interval", type=float, default=5.0, help="seconds between readings (default 5)")
    parser.add_argument("--count", type=int, default=0, help="stop after this many ticks (default: run until Ctrl+C)")
    parser.add_argument("--seed", type=int, default=42, help="random seed, for repeatable runs")
    args = parser.parse_args()

    keys = device_keys()
    rng = random.Random(args.seed)
    buffer: deque[dict] = deque(maxlen=2000)  # oldest dropped first if the outage is very long
    print(f"Simulating '{args.scenario}' -> {args.url} every {args.interval:g}s (simulated data). Ctrl+C to stop.")

    tick = 0
    try:
        while args.count == 0 or tick < args.count:
            stamp = datetime.now(IST).isoformat(timespec="seconds")
            for body in batches_for(args.scenario, tick, rng):
                buffer.append({**body, "ts": stamp})
            sent = 0
            while buffer:
                body = buffer[0]
                try:
                    post(args.url, body, keys[body["node_id"]])
                except urllib.error.HTTPError as err:
                    detail = err.read().decode(errors="replace")[:200]
                    print(f"  rejected {body['node_id']} ({err.code}): {detail}")
                    buffer.popleft()  # a rejected batch will not succeed on retry
                    continue
                except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
                    print(f"  API unreachable ({getattr(err, 'reason', err)}); buffering {len(buffer)} batch(es)")
                    break
                buffer.popleft()
                sent += 1
            nodes = ", ".join(b["node_id"] for b in batches_for(args.scenario, tick, random.Random(0)))
            print(f"tick {tick:>4}  {stamp}  sent {sent} batch(es)  reporting: {nodes or 'none'}")
            tick += 1
            if args.count == 0 or tick < args.count:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
