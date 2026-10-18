// Live telemetry via polling (simple and robust on weak rural connections; WebSockets only if ever needed).
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import { dataSource } from './seed';

export const POLL_MS = 5000;
export const CHART_SENSORS = ['sen-tail-pressure', 'sen-tail-flow', 'sen-head-pressure', 'sen-head-flow', 'sen-pump-current', 'sen-tank-level'];

/** Calls load() now and every `ms`, pausing while the tab is hidden. Returns { data, error, updatedAt }. */
export function usePolling(load, ms = POLL_MS, enabled = true, refreshKey = 0) {
  const [state, setState] = useState({ data: null, error: null, updatedAt: null });
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer = null;
    const tick = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const data = await loadRef.current();
          if (!cancelled) setState({ data, error: null, updatedAt: new Date() });
        } catch (err) {
          if (!cancelled) setState((s) => ({ ...s, error: err.message }));
        }
      }
      if (!cancelled) timer = setTimeout(tick, ms);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ms, enabled, refreshKey]);

  return state;
}

/** Node health plus latest values, and the last `minutes` of readings for the chart sensors. */
export function useLiveTelemetry({ role = 'gp', minutes = 10, withSeries = true } = {}) {
  return usePolling(
    async () => {
      const [live, alerts] = await Promise.all([apiFetch('/telemetry/live', { role }), apiFetch('/alerts/active', { role })]);
      if (!withSeries) return { live, alerts, series: {} };
      const lists = await Promise.all(
        CHART_SENSORS.map((id) => apiFetch(`/readings?sensor_id=${id}&minutes=${minutes}`, { role })),
      );
      return { live, alerts, series: Object.fromEntries(CHART_SENSORS.map((id, i) => [id, lists[i]])) };
    },
    POLL_MS,
    dataSource === 'api',
  );
}
