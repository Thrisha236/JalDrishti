// The demo story as an ordered set of steps. Every screen derives what it shows from the current step,
// so the Citizen, Gram Panchayat and Officer views always tell the same story.
import { story, CITIZEN_AREA } from '../data/seed';

export const STEPS = [
  { key: 'WARNING', label: 'Early warning on P-21' },
  { key: 'REPORTED', label: 'Citizen reports low water (#2048)' },
  { key: 'INCIDENT', label: 'GP reviews evidence (INC-0311)' },
  { key: 'ASSIGNED', label: 'Maintenance task T-118 assigned' },
  { key: 'REPAIRED', label: 'Repair done, verifying' },
  { key: 'VERIFIED', label: 'Verified Restored, citizen informed' },
];

export const S = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));

/** Citizen-facing status of a service area. level drives the colour and icon; key is an i18n key. */
export function areaStatus(step, areaId) {
  if (areaId !== CITIZEN_AREA) return { level: 'normal', key: 'status.available' };
  if (step === S.WARNING) return { level: 'warning', key: 'status.attention' };
  if (step < S.ASSIGNED) return { level: 'problem', key: 'status.lowSupply' };
  if (step < S.VERIFIED) return { level: 'problem', key: 'status.repairing' };
  return { level: 'normal', key: 'status.restored' };
}

export const visibleComplaints = (step) => (step >= S.REPORTED ? story.complaints : []);

export function complaintStatus(step) {
  if (step < S.REPORTED) return null;
  if (step === S.REPORTED) return 'SUBMITTED';
  if (step === S.INCIDENT) return 'LINKED';
  if (step < S.VERIFIED) return 'REPAIR_IN_PROGRESS';
  return 'RESOLVED_VERIFIED';
}

/** The citizen's story complaint: the code the server returned, or the seed's #2048 offline. */
export const storyCode = (report) => report?.public_code ?? '2048';

/** Citizen timeline for the story complaint. Later steps use the scripted story times until Stage 9 makes them live. */
export function citizenTimeline(step, code = '2048') {
  const c = story.complaints.find((x) => x.public_code === code);
  const n = story.notifications;
  return [
    { key: 'timeline.received', at: c?.created_at ?? null, done: step >= S.REPORTED },
    { key: 'timeline.checking', at: n[0].at, done: step >= S.INCIDENT },
    { key: 'timeline.repairStarted', at: n[1].at, done: step >= S.ASSIGNED },
    { key: 'timeline.restored', at: n[2].at, done: step >= S.VERIFIED },
  ];
}

export function incidentStatus(step) {
  if (step < S.INCIDENT) return null;
  return ['TRIAGED', 'TASK_ASSIGNED', 'VERIFYING', 'VERIFIED_RESTORED'][step - S.INCIDENT];
}

export const openIncidentCount = (step) => (step >= S.INCIDENT && step < S.VERIFIED ? 1 : 0);

export function activeAlerts(step) {
  const [early, tail] = story.alerts;
  if (step >= S.VERIFIED) return [];
  return step >= S.REPORTED ? [tail, early] : [early];
}
