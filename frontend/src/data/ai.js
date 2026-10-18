// Polling hooks for the AI early-warning, tap-connection and integration APIs (API mode only).
import { useState } from 'react';
import { apiFetch } from './api';
import { dataSource } from './seed';
import { usePolling } from './telemetry';

const POLL = 4000;

/** Anomaly detection, forecasts, water-quality outlook and failure outlook. */
export function usePredictions(role = 'gp') {
  return usePolling(() => apiFetch('/predictions', { role }), POLL, dataSource === 'api');
}

/** Estimated functionality of every household tap connection. */
export function useFhtc(role = 'gp') {
  return usePolling(() => apiFetch('/fhtc', { role }), POLL, dataSource === 'api');
}

/** Connector status, the ID crosswalk and the latest messages of the (mock) integration hub. */
export function useIntegrations(role = 'gp') {
  const [refreshKey, setRefreshKey] = useState(0);
  const state = usePolling(
    async () => {
      const [overview, crosswalk, events] = await Promise.all([
        apiFetch('/integrations', { role }),
        apiFetch('/integrations/crosswalk', { role }),
        apiFetch('/integrations/events?limit=30', { role }),
      ]);
      return { overview, crosswalk, events };
    },
    POLL,
    dataSource === 'api',
    refreshKey,
  );
  return { ...state, reload: () => setRefreshKey((k) => k + 1) };
}

/** Just the connector summary (for the dashboard's "connected platforms" strip). */
export function useConnectors(role = 'gp') {
  return usePolling(() => apiFetch('/integrations', { role }), 8000, dataSource === 'api');
}

export const syncNow = (role = 'gp') => apiFetch('/integrations/sync', { role, method: 'POST' });

/** Plain wording for the status words the API sends. */
export const LEVEL_LABEL = { OK: 'Fine', WATCH: 'Watch', AT_RISK: 'At risk' };
export const LEVEL_TONE = { OK: 'normal', WATCH: 'warning', AT_RISK: 'problem' };
export const PRIORITY_TONE = { HIGH: 'problem', MEDIUM: 'warning', LOW: 'normal' };

/** "about 40 s" below a minute, otherwise "about 12 min". */
export function fmtEta(minutes) {
  if (minutes == null) return null;
  return minutes < 1 ? `about ${Math.max(5, Math.round(minutes * 60))} s` : `about ${Math.round(minutes)} min`;
}
