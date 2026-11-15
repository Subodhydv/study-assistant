import { useEffect, useRef } from 'react';
import { IconClose, IconTrash } from './Icons.jsx';

const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Saved sets, in a native <dialog> (focus trap and Esc come for free). */
export default function SessionsDrawer({ open, onClose, sessions, currentId, onOpen, onDelete }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      <div className="drawer-inner">
        <div className="drawer-head">
          <h2 id="drawer-title" className="drawer-title">Saved sets</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close saved sets">
            <IconClose />
          </button>
        </div>
        <p className="drawer-note">Sets are saved in this browser automatically.</p>

        {sessions.length === 0 ? (
          <p className="drawer-empty">Nothing saved yet. Sets you make will show up here.</p>
        ) : (
          <ul className="session-list">
            {sessions.map((s) => (
              <li key={s.id} className={`session-item${s.id === currentId ? ' is-current' : ''}`}>
                <button type="button" className="session-open" onClick={() => onOpen(s.id)}>
                  <span className="session-title">{s.studySet.title}</span>
                  <span className="session-meta">
                    {s.studySet.flashcards.length} cards, {s.studySet.quiz.length} questions. {dateFormat.format(s.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={() => onDelete(s.id)}
                  aria-label={`Delete “${s.studySet.title}”`}
                  title="Delete"
                >
                  <IconTrash />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
