import { useId, useState } from 'react';
import Flashcards from './Flashcards.jsx';
import { IconUndo, IconWarning } from './Icons.jsx';
import Quiz from './Quiz.jsx';
import RefineBar from './RefineBar.jsx';

export default function StudyView({ session, warnings, meta, onDismissWarnings, onNew, onEditNotes, onUndo, refine }) {
  const { studySet } = session;
  const hasCards = studySet.flashcards.length > 0;
  const hasQuiz = studySet.quiz.length > 0;
  const [tab, setTab] = useState(hasCards ? 'cards' : 'quiz');
  const id = useId();

  const tabs = [
    { key: 'cards', label: 'Flashcards', count: studySet.flashcards.length, enabled: hasCards },
    { key: 'quiz', label: 'Quiz', count: studySet.quiz.length, enabled: hasQuiz },
  ];

  const onTabKeyDown = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const enabled = tabs.filter((t) => t.enabled);
    const i = enabled.findIndex((t) => t.key === tab);
    const next = enabled[(i + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    setTab(next.key);
    document.getElementById(`${id}-tab-${next.key}`)?.focus();
  };

  return (
    <div className="study">
      <div className="study-head">
        <div className="study-titles">
          <h1 className="study-title">{studySet.title}</h1>
          <p className="study-meta">
            {studySet.flashcards.length} cards, {studySet.quiz.length} questions
            {meta?.attempts > 1 && <span> (the model fixed its first answer)</span>}
          </p>
        </div>
        <div className="study-actions">
          {onUndo && (
            <button type="button" className="btn btn-ghost" onClick={onUndo} disabled={refine.loading}>
              <IconUndo /> Undo change
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onEditNotes}>
            Edit notes
          </button>
          <button type="button" className="btn btn-secondary" onClick={onNew}>
            New set
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="warning-box" role="status">
          <IconWarning />
          <div>
            <p className="warning-title">Some of the model&apos;s answer couldn&apos;t be used</p>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
          <button type="button" className="link-button" onClick={onDismissWarnings}>
            Dismiss
          </button>
        </div>
      )}

      <div className={`study-body${refine.loading ? ' is-updating' : ''}`} inert={refine.loading || undefined}>
        <div className="tabs" role="tablist" aria-label="Study mode" onKeyDown={onTabKeyDown}>
          {tabs.map((t) => (
            <button
              key={t.key}
              id={`${id}-tab-${t.key}`}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === t.key}
              aria-controls={`${id}-panel-${t.key}`}
              tabIndex={tab === t.key ? 0 : -1}
              disabled={!t.enabled}
              onClick={() => setTab(t.key)}
            >
              {t.label} <span className="tab-count">{t.count}</span>
            </button>
          ))}
        </div>

        <div id={`${id}-panel-${tab}`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className="tab-panel">
          {tab === 'cards' ? (
            <Flashcards cards={studySet.flashcards} active={!refine.loading} />
          ) : (
            <Quiz questions={studySet.quiz} active={!refine.loading} />
          )}
        </div>
      </div>

      <RefineBar {...refine} />
    </div>
  );
}
