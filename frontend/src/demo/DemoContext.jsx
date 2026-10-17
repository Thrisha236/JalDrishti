import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { STEPS } from './steps';

const KEY = 'jalrakshak-demo';
const DemoContext = createContext(null);

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? {};
  } catch {
    return {};
  }
}

export function DemoProvider({ children }) {
  const saved = load();
  const [role, setRole] = useState(saved.role ?? null);
  const [step, setStep] = useState(saved.step ?? 0);
  const [report, setReport] = useState(saved.report ?? null);
  // The photo preview lives only in memory: it is never stored or uploaded in Stage 3.
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ role, step, report }));
    } catch {
      /* storage unavailable: the demo still works for this session */
    }
  }, [role, step, report]);

  const advanceTo = useCallback((target) => setStep((s) => Math.max(s, target)), []);
  const next = useCallback(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), []);
  const reset = useCallback(() => {
    setStep(0);
    setReport(null);
    setPhotoUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
  }, []);

  const value = useMemo(
    () => ({ role, setRole, step, advanceTo, next, reset, report, setReport, photoUrl, setPhotoUrl }),
    [role, step, advanceTo, next, reset, report, photoUrl],
  );
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo must be used inside DemoProvider');
  return ctx;
}
