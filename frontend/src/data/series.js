// Deterministic simulated tail-pressure series for the story. Replaced by the sensor simulator in Stage 6.
import { sensors, story } from './seed';

const tail = () => sensors['sen-tail-pressure'];
const wobble = (i, amp) => Math.sin(i * 1.7) * amp + Math.sin(i * 0.6) * amp * 0.5;

/** 06:00–08:00 on the complaint day, one point per 5 minutes; drops at 07:05 (alert AL-77). */
export function complaintDaySeries() {
  const { observed_bar } = story.alerts[1].details;
  return Array.from({ length: 25 }, (_, i) => {
    const minutes = i * 5; // from 06:00
    const v = minutes >= 65 ? observed_bar : tail().baseline;
    return Number((v + wobble(i, 0.02)).toFixed(3));
  });
}

/** Readings in each post-repair verification window, centred on the recorded window mean. */
export function verificationSeries() {
  return story.verification.windows.map((w, k) => {
    const n = k === 0 ? 13 : 25;
    return Array.from({ length: n }, (_, i) => Number((w.tail_pressure_mean_bar + wobble(i + k * 7, 0.025)).toFixed(3)));
  });
}

export const tailBand = () => tail().normal_band;
