import { useCallback, useEffect, useRef, useState } from 'react';
import Composer from './components/Composer.jsx';
import DemoBanner from './components/DemoBanner.jsx';
import EmptyState from './components/EmptyState.jsx';
import ErrorState from './components/ErrorState.jsx';
import Header from './components/Header.jsx';
import LoadingState from './components/LoadingState.jsx';
import SessionsDrawer from './components/SessionsDrawer.jsx';
import StudyView from './components/StudyView.jsx';
import { useHealth } from './hooks/useHealth.js';
import { newSessionId, useSessions } from './hooks/useSessions.js';
import { useStudyRequest } from './hooks/useStudyRequest.js';
import { useTheme } from './hooks/useTheme.js';

const EMPTY_DRAFT = { input: '', count: 10, difficulty: 'medium' };

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const health = useHealth();
  const { sessions, current, upsert, open, remove, storageOk } = useSessions();

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [composing, setComposing] = useState(() => !current);
  const [notice, setNotice] = useState({ warnings: [], meta: null });
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Latest sessions without re-creating callbacks on every change.
  const sessionsRef = useRef(sessions);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const handleSuccess = useCallback(
    (result, payload) => {
      if (payload.mode === 'refine') {
        const base = sessionsRef.current.find((s) => s.id === payload.sessionId);
        if (!base) return; // the set was deleted while the request ran
        upsert({
          ...base,
          studySet: result.studySet,
          history: [...(base.history ?? []), base.studySet].slice(-10),
        });
      } else {
        upsert({
          id: newSessionId(),
          createdAt: Date.now(),
          input: payload.input,
          options: { count: payload.count, difficulty: payload.difficulty },
          studySet: result.studySet,
          history: [],
        });
      }
      setNotice({ warnings: result.warnings, meta: result.meta });
      setComposing(false);
    },
    [upsert],
  );

  const request = useStudyRequest({ onSuccess: handleSuccess });

  const generate = () => {
    request.run({
      mode: 'create',
      input: draft.input.trim(),
      count: draft.count,
      difficulty: draft.difficulty,
    });
  };

  const refine = (instruction) => {
    if (!current) return;
    request.run({ mode: 'refine', instruction, current: current.studySet, sessionId: current.id });
  };

  const undo = () => {
    if (!current?.history?.length) return;
    const history = [...current.history];
    const previous = history.pop();
    upsert({ ...current, studySet: previous, history });
    setNotice({ warnings: [], meta: null });
  };

  const startNew = () => {
    request.cancel();
    setDraft(EMPTY_DRAFT);
    setNotice({ warnings: [], meta: null });
    setComposing(true);
  };

  const editNotes = () => {
    if (current) {
      setDraft({
        input: current.input,
        count: current.options?.count ?? 10,
        difficulty: current.options?.difficulty ?? 'medium',
      });
    }
    request.cancel();
    setComposing(true);
  };

  const openSession = (id) => {
    request.cancel();
    open(id);
    setNotice({ warnings: [], meta: null });
    setComposing(false);
    setDrawerOpen(false);
  };

  const deleteSession = (id) => {
    if (current?.id === id) {
      request.cancel();
      setComposing(true);
    }
    remove(id);
  };

  const showComposer = composing || !current;
  const creating = request.mode === 'create';

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        savedCount={sessions.length}
        onOpenSaved={() => setDrawerOpen(true)}
        onHome={current && !showComposer ? startNew : undefined}
      />

      <main id="main" className="main">
        <DemoBanner health={health} />
        {!storageOk && (
          <p className="inline-note" role="status">
            Your browser isn&apos;t letting this page save, so sets will be lost when you close the tab.
          </p>
        )}

        {showComposer ? (
          <>
            <Composer
              draft={draft}
              onChange={setDraft}
              onSubmit={generate}
              busy={request.isLoading && creating}
              backTo={current && !request.isLoading ? { title: current.studySet.title, onClick: () => setComposing(false) } : null}
            />
            <div className="below-composer" aria-live="polite">
              {request.isLoading && creating && (
                <LoadingState startedAt={request.startedAt} onCancel={request.cancel} />
              )}
              {request.status === 'error' && creating && (
                <ErrorState error={request.error} onRetry={request.retry} onDismiss={request.dismiss} />
              )}
              {!request.isLoading && request.status !== 'error' && !current && (
                <EmptyState
                  onPick={(input) => setDraft((d) => ({ ...d, input }))}
                  scenarios={health.demo ? health.scenarios : null}
                />
              )}
            </div>
          </>
        ) : (
          <StudyView
            key={`${current.id}:${current.updatedAt}`}
            session={current}
            warnings={notice.warnings}
            meta={notice.meta}
            onDismissWarnings={() => setNotice((n) => ({ ...n, warnings: [] }))}
            onNew={startNew}
            onEditNotes={editNotes}
            onUndo={current.history?.length ? undo : null}
            refine={{
              onSubmit: refine,
              loading: request.isLoading && request.mode === 'refine',
              startedAt: request.startedAt,
              error: request.status === 'error' && request.mode === 'refine' ? request.error : null,
              onCancel: request.cancel,
              onRetry: request.retry,
              onDismiss: request.dismiss,
            }}
          />
        )}
      </main>

      <SessionsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sessions={sessions}
        currentId={current?.id}
        onOpen={openSession}
        onDelete={deleteSession}
      />
    </div>
  );
}
