import { useEffect, useState } from 'react';

/** Skeleton cards with an honest elapsed-time counter and a way out. */
export default function LoadingState({ startedAt, onCancel, label = 'Writing your cards' }) {
  const seconds = useElapsedSeconds(startedAt);
  const slow = seconds >= 12;

  return (
    <section className="loading" aria-label="Generating">
      <div className="loading-head">
        <p className="loading-label" role="status">
          {label}… <span className="loading-seconds">{seconds}s</span>
        </p>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
      {slow && (
        <p className="loading-slow">
          This is taking longer than usual. The model may be busy; you can keep waiting or cancel.
        </p>
      )}
      <div className="skeleton-stack" aria-hidden="true">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    </section>
  );
}

export function useElapsedSeconds(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
}
