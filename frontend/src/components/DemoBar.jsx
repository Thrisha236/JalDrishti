// Presenter controls for the demo story. Clearly labelled so nobody mistakes it for a product feature.
import { useState } from 'react';
import { useDemo } from '../demo/DemoContext';
import { STEPS } from '../demo/steps';
import { dataSource, reloadData } from '../data/seed';
import { apiFetch } from '../data/api';

export default function DemoBar() {
  const { step, next, reset, role } = useDemo();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const last = step === STEPS.length - 1;

  const resetStory = async () => {
    setBusy(true);
    try {
      if (dataSource === 'api') {
        // Server side: reload the seed and delete uploaded photos, so #2048 can be submitted again.
        await apiFetch('/demo/reset', { role, method: 'POST' });
        await reloadData();
      }
    } catch (err) {
      console.warn('Demo reset on the server failed:', err.message);
    } finally {
      reset();
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-16 right-3 z-40 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-card md:bottom-4"
      >
        Demo {step + 1}/{STEPS.length}
      </button>
    );
  }

  return (
    <div className="fixed inset-x-2 bottom-16 z-40 rounded-xl bg-slate-900 p-3 text-white shadow-card md:inset-x-auto md:bottom-4 md:right-4 md:w-96">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Prototype demo · simulated data</p>
          <p className="truncate text-sm font-semibold">
            Step {step + 1}/{STEPS.length}: {STEPS[step].label}
          </p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded px-1 text-slate-400 hover:text-white" aria-label="Hide demo controls">
          ✕
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={resetStory} disabled={busy} className="flex-1 rounded-lg bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600 disabled:opacity-50">
          {busy ? 'Resetting…' : 'Reset story'}
        </button>
        <button type="button" onClick={next} disabled={last} className="flex-1 rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold disabled:opacity-40">
          Skip to next step
        </button>
      </div>
    </div>
  );
}
