"""Simulated readings for the two demo nodes. Pure functions, no I/O, so they are easy to test.

Node A (pump house and tank) carries pump current, tank level, and head flow/pressure.
Node B (tail of pipeline P-21, solar powered) carries tail flow/pressure.
Values are illustrative, chosen to match the seed's baselines; they are not field measurements."""

import math
import random

NODE_SENSORS = {
    "node-a": ["sen-pump-current", "sen-tank-level", "sen-head-flow", "sen-head-pressure", "sen-head-acoustic", "sen-head-chlorine"],
    "node-b": ["sen-tail-flow", "sen-tail-pressure", "sen-tail-acoustic", "sen-tail-chlorine"],
}

BASELINE = {
    "sen-pump-current": 4.2,  # A
    "sen-tank-level": 3.7,  # m
    "sen-head-flow": 48.0,  # L/min
    "sen-head-pressure": 1.8,  # bar
    "sen-tail-flow": 45.0,  # L/min
    "sen-tail-pressure": 1.22,  # bar
    "sen-head-acoustic": 40.0,  # mV after the pre-amp: normal pipe-flow noise
    "sen-tail-acoustic": 38.0,  # mV
    "sen-head-chlorine": 0.80,  # mg/L free residual chlorine leaving the tank
    "sen-tail-chlorine": 0.45,  # mg/L at the tail end
}

# Relative noise per sensor (standard deviation as a fraction of the value).
NOISE = {"sen-pump-current": 0.02, "sen-tank-level": 0.003, "sen-head-flow": 0.02, "sen-head-pressure": 0.01, "sen-tail-flow": 0.02, "sen-tail-pressure": 0.015, "sen-head-acoustic": 0.03, "sen-tail-acoustic": 0.03, "sen-head-chlorine": 0.02, "sen-tail-chlorine": 0.03}

# What each fault does to the network (applied on top of the baseline).
SCENARIOS = {
    "normal": {},
    # A leak on P-21 downstream of the head: more water leaves the tank, less reaches the tail.
    "leak": {"sen-head-flow": 54.0, "sen-head-pressure": 1.70, "sen-tail-flow": 30.0, "sen-tail-pressure": 0.72, "sen-head-acoustic": 78.0, "sen-tail-acoustic": 96.0},
    # The pump stops: no current, no flow, pressure collapses, the tank slowly empties.
    "pump-off": {"sen-pump-current": 0.0, "sen-head-flow": 0.0, "sen-head-pressure": 0.05, "sen-tail-flow": 0.0, "sen-tail-pressure": 0.02, "sen-head-acoustic": 6.0, "sen-tail-acoustic": 5.0, "sen-tail-chlorine": 0.12},
    # Node B stops reporting (flat battery, antenna fault). The water may be fine: this is an equipment problem.
    "node-offline": {},
    # A leak that is only starting: tail pressure and flow slide slowly (no alert yet). The early-warning models
    # should notice the drift and predict the breach before the rules engine raises an alert.
    "degrading": {},
    # Supply that stops and starts (a valve being rotated, a pump cycling): ten ticks of water, ten ticks dry, repeating.
    "intermittent": {},
    # The dosing pump runs dry: chlorine leaving the tank and reaching the tail collapses while hydraulics stay normal.
    "chlorine-drop": {"sen-head-chlorine": 0.10, "sen-tail-chlorine": 0.04},
}

# Scenarios that repeat a dry spell: after `on_ticks` of normal readings the `off` values apply until the period ends.
CYCLES = {
    "intermittent": {"period": 20, "on_ticks": 10, "off": {"sen-head-flow": 4.0, "sen-tail-flow": 0.0, "sen-tail-pressure": 0.15, "sen-head-pressure": 1.75, "sen-head-acoustic": 8.0, "sen-tail-acoustic": 7.0}},
}

# Scenarios whose values move gradually: sensor -> (start value, end value, ticks to get there).
RAMPS = {
    "degrading": {
        "sen-tail-pressure": (1.22, 0.78, 90),
        "sen-tail-flow": (45.0, 33.0, 90),
        "sen-head-flow": (48.0, 52.0, 90),
        "sen-head-pressure": (1.80, 1.72, 90),
        "sen-tail-acoustic": (38.0, 84.0, 90),  # the hiss of a growing leak shows up before the flow gap does
        "sen-tail-chlorine": (0.45, 0.30, 90),
    },
}

SILENT_NODES = {"node-offline": {"node-b"}}
TANK_DRAIN_M_PER_TICK = {"leak": 0.004, "pump-off": 0.01}


def values_for(scenario: str, tick: int, rng: random.Random) -> dict[str, float]:
    if scenario not in SCENARIOS:
        raise ValueError(f"Unknown scenario {scenario!r}; choose from {', '.join(SCENARIOS)}")
    target = {**BASELINE, **SCENARIOS[scenario]}
    for sensor, (start, end, ticks) in RAMPS.get(scenario, {}).items():
        target[sensor] = start + (end - start) * min(1.0, tick / ticks)
    cycle = CYCLES.get(scenario)
    if cycle and tick % cycle["period"] >= cycle["on_ticks"]:
        target.update(cycle["off"])
    out = {}
    for sensor, value in target.items():
        if sensor == "sen-tank-level":
            value = value + 0.05 * math.sin(tick / 20) - TANK_DRAIN_M_PER_TICK.get(scenario, 0) * tick
            value = max(value, 0.2)
        noisy = value + rng.gauss(0, abs(value) * NOISE[sensor]) if value else 0.0
        out[sensor] = round(max(noisy, 0.0), 3)
    return out


def batches_for(scenario: str, tick: int, rng: random.Random) -> list[dict]:
    """One request body per reporting node for this tick."""
    values = values_for(scenario, tick, rng)
    silent = SILENT_NODES.get(scenario, set())
    batches = []
    for node, sensors in NODE_SENSORS.items():
        if node in silent:
            continue
        body = {"node_id": node, "readings": [{"sensor_id": s, "value": values[s]} for s in sensors]}
        if node == "node-b":
            body["battery_v"] = round(3.95 - 0.0005 * tick, 3)  # solar node battery, slowly discharging
        batches.append(body)
    return batches
