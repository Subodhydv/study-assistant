import { useId, useState } from 'react';
import { LIMITS } from '../../shared/studySet.js';
import ErrorState from './ErrorState.jsx';
import { useElapsedSeconds } from './LoadingState.jsx';

const SUGGESTIONS = ['Make the questions harder', 'Add 5 more flashcards', 'Use simpler wording', 'Focus on key definitions'];

/** Follow-up prompts that edit the current set instead of starting over. */
export default function RefineBar({ onSubmit, loading, startedAt, error, onCancel, onRetry, onDismiss }) {
  const [text, setText] = useState('');
  const id = useId();
  const seconds = useElapsedSeconds(loading ? startedAt : null);
  const trimmed = text.trim();
  const tooLong = text.length > LIMITS.instructionMax;

  const submit = (instruction) => {
    if (!instruction || loading) return;
    onSubmit(instruction);
  };

  return (
    <section className="refine" aria-labelledby={`${id}-label`}>
      <form
        className="refine-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!tooLong) submit(trimmed);
        }}
      >
        <label id={`${id}-label`} htmlFor={`${id}-input`} className="refine-label">
          Change this set
        </label>
        <div className="refine-row">
          <input
            id={`${id}-input`}
            className="input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. add questions about dates"
            maxLength={LIMITS.instructionMax + 50}
            aria-invalid={tooLong || undefined}
            disabled={loading}
          />
          {loading ? (
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <button type="submit" className="btn btn-primary" disabled={!trimmed || tooLong}>
              Apply
            </button>
          )}
        </div>
        {tooLong && <p className="field-error">Keep it under {LIMITS.instructionMax} characters.</p>}
      </form>

      {loading ? (
        <p className="refine-status" role="status">
          Updating the set… {seconds}s
          {seconds >= 12 && ' — taking longer than usual'}
        </p>
      ) : (
        <div className="chip-row">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => submit(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="refine-error">
          <ErrorState error={error} onRetry={onRetry} onDismiss={onDismiss} compact />
          <p className="refine-kept">Your current set hasn&apos;t changed.</p>
        </div>
      )}
    </section>
  );
}
