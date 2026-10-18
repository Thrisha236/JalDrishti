// The villager's complaints, each with its track ID and its own timeline.
// API mode: the server's records and real progress events. Offline demo: complaints kept in the
// browser; the first one follows the scripted story, later ones show as received.
import { useEffect, useMemo } from 'react';
import { useDemo } from '../demo/DemoContext';
import { citizenTimeline, S, storyCode } from '../demo/steps';
import { apiFetch } from './api';
import { dataSource, story } from './seed';
import { usePolling } from './telemetry';

const LIVE_KEYS = [
  ['received', 'timeline.received'],
  ['checking', 'timeline.checking'],
  ['repair_started', 'timeline.repairStarted'],
];

/** Timeline steps from the server's progress events. */
function liveEvents(progress = []) {
  const at = Object.fromEntries(progress.map((e) => [e.key, e.at]));
  const closedAt = at.restored ?? at.resolved_unverified;
  return [
    ...LIVE_KEYS.map(([k, key]) => ({ key, at: at[k] ?? null, done: Boolean(at[k]) })),
    { key: at.resolved_unverified ? 'timeline.resolvedUnverified' : 'timeline.restored', at: closedAt ?? null, done: Boolean(closedAt) },
  ];
}

function shape(c, events) {
  const last = [...events].reverse().find((e) => e.done);
  return {
    code: c.public_code,
    category: c.category,
    area: c.service_area_id ?? c.area,
    createdAt: c.created_at ?? c.createdAt ?? null,
    channel: c.channel ?? 'APP',
    analysis: c.image_analysis?.[0] ?? null,
    events,
    statusKey: last?.key ?? 'timeline.received',
    closed: events.at(-1).done,
  };
}

/** Offline codes: the story keeps #2048; later complaints skip numbers the fixtures use. */
export function nextOfflineCode(reports) {
  const used = new Set([...story.complaints.map((c) => c.public_code), ...reports.map((r) => r.public_code)]);
  if (!reports.length) return storyCode(null);
  let n = 2049;
  while (used.has(String(n))) n++;
  return String(n);
}

export function useMyComplaints() {
  const { step, report, reports, advanceTo } = useDemo();
  const api = dataSource === 'api';
  const { data, error } = usePolling(() => apiFetch('/complaints/mine', { role: 'citizen' }), 10000, api);
  const storyId = storyCode(report);

  const list = useMemo(() => {
    if (api) return (data ?? []).map((c) => shape(c, liveEvents(c.progress)));
    // A story complaint filed before complaints were listed is still shown.
    const offline = reports.length || step < S.REPORTED ? reports : [{ public_code: storyId, category: report?.category ?? 'LOW_WATER', area: report?.area, channel: report?.channel }];
    return offline.map((r) => {
      const events =
        r.public_code === storyId
          ? citizenTimeline(step, storyId).map((e) => (e.key === 'timeline.received' ? { ...e, at: r.createdAt ?? e.at } : e))
          : [{ key: 'timeline.received', at: r.createdAt, done: true }, ...citizenTimeline(-1).slice(1)];
      return shape(r, events);
    });
  }, [api, data, reports, report, step, storyId]);

  // When the story complaint is closed on the server, move the shared demo story to its last step.
  const storyClosed = api && list.find((c) => c.code === storyId)?.closed;
  useEffect(() => {
    if (storyClosed) advanceTo(S.VERIFIED);
  }, [storyClosed, advanceTo]);

  return { list, loading: api && !data && !error, error };
}
