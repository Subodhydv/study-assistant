import { useId } from 'react';
import { COUNTS, DIFFICULTIES, LIMITS } from '../../shared/studySet.js';
import Segmented from './Segmented.jsx';

export default function Composer({ draft, onChange, onSubmit, busy, backTo }) {
  const id = useId();
  const length = draft.input.trim().length;
  const tooLong = draft.input.length > LIMITS.inputMax;
  const tooShort = length < LIMITS.inputMin;
  const canSubmit = !tooShort && !tooLong;

  const set = (patch) => onChange({ ...draft, ...patch });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSubmit) onSubmit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e);
  };

  return (
    <form className="composer" onSubmit={handleSubmit} aria-busy={busy}>
      {backTo && (
        <button type="button" className="link-button back-link" onClick={backTo.onClick}>
          Back to “{backTo.title}”
        </button>
      )}
      <h1 className="composer-title">
        <label htmlFor={`${id}-input`}>What are you studying?</label>
      </h1>
      <p className="composer-sub" id={`${id}-help`}>
        Paste your notes, or just name a topic. You&apos;ll get flashcards and a quiz to test yourself.
      </p>

      <div className="notepad">
        <textarea
          id={`${id}-input`}
          className="notepad-input"
          value={draft.input}
          onChange={(e) => set({ input: e.target.value })}
          onKeyDown={handleKeyDown}
          placeholder="e.g. The causes of the First World War"
          aria-describedby={`${id}-help ${id}-count`}
          aria-invalid={tooLong || undefined}
          rows={8}
          spellCheck
        />
      </div>

      <div className="composer-row">
        <p id={`${id}-count`} className={`char-count${tooLong ? ' is-over' : ''}`}>
          {tooLong
            ? `${(draft.input.length - LIMITS.inputMax).toLocaleString()} characters over the ${LIMITS.inputMax.toLocaleString()} limit`
            : `${draft.input.length.toLocaleString()} / ${LIMITS.inputMax.toLocaleString()}`}
        </p>
      </div>

      <div className="composer-options">
        <Segmented
          label="Cards and questions"
          name={`${id}-count`}
          value={draft.count}
          options={COUNTS.map((n) => ({ value: n, label: String(n) }))}
          onChange={(count) => set({ count })}
        />
        <Segmented
          label="Difficulty"
          name={`${id}-difficulty`}
          value={draft.difficulty}
          options={DIFFICULTIES.map((d) => ({ value: d, label: d[0].toUpperCase() + d.slice(1) }))}
          onChange={(difficulty) => set({ difficulty })}
        />
      </div>

      <div className="composer-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={!canSubmit}>
          Make cards
        </button>
        <span className="kbd-hint">
          <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
        </span>
      </div>
    </form>
  );
}
