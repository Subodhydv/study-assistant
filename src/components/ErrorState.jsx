import { useEffect, useRef } from 'react';
import { describeError } from '../lib/errors.js';
import { IconWarning } from './Icons.jsx';

export default function ErrorState({ error, onRetry, onDismiss, compact = false }) {
  const { title, hint, detail, retryable } = describeError(error);
  const ref = useRef(null);

  // Move focus here so keyboard and screen-reader users know what happened.
  useEffect(() => {
    ref.current?.focus();
  }, [error]);

  return (
    <section ref={ref} tabIndex={-1} className={`error-box${compact ? ' is-compact' : ''}`} role="alert">
      <div className="error-icon">
        <IconWarning />
      </div>
      <div className="error-body">
        <h2 className="error-title">{title}</h2>
        {hint && <p className="error-hint">{hint}</p>}
        {detail && detail !== title && <p className="error-detail">{detail}</p>}
        <div className="error-actions">
          {retryable && onRetry && (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Try again
            </button>
          )}
          {onDismiss && (
            <button type="button" className="btn btn-ghost" onClick={onDismiss}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
