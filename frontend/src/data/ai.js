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

/** The Alert Center feed: every kind of alert, with counts. status is open, cleared or all. */
export function useAlertFeed(role = 'gp', { status = 'open', kind = null } = {}, ms = 6000) {
  const [refreshKey, setRefreshKey] = useState(0);
  const q = new URLSearchParams({ status, ...(kind ? { kind } : {}), limit: '150' });
  const state = usePolling(() => apiFetch(`/alerts/feed?${q}`, { role }), ms, dataSource === 'api', `${status}-${kind}-${refreshKey}`);
  return { ...state, reload: () => setRefreshKey((k) => k + 1) };
}

export const acknowledgeAlert = (id, role = 'gp') => apiFetch(`/alerts/${id}/acknowledge`, { role, method: 'POST' });

/** Counts only (for the navigation badge). */
export function useAlertCounts(role) {
  return usePolling(() => apiFetch('/alerts/feed?status=open&limit=1', { role }), 15000, dataSource === 'api' && (role === 'gp' || role === 'officer'));
}

export const SEVERITY_TONE = { CRITICAL: 'problem', HIGH: 'problem', MEDIUM: 'warning', LOW: 'neutral' };
export const KIND_ICON = { WATER_SERVICE: 'drop', EQUIPMENT_HEALTH: 'sensor', AI_PREDICTION: 'spark', WATER_QUALITY: 'flask', COMMUNITY: 'users' };
