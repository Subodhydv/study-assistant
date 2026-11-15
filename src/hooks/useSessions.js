import { useCallback, useEffect, useState } from 'react';
import { loadCurrentId, loadSessions, saveCurrentId, saveSessions } from '../lib/storage.js';

/** Saved study sets in localStorage, plus which one is open. */
export function useSessions() {
  const [sessions, setSessions] = useState(() => loadSessions());
  const [currentId, setCurrentId] = useState(() => {
    const id = loadCurrentId();
    return id && loadSessions().some((s) => s.id === id) ? id : null;
  });
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => {
    setStorageOk(saveSessions(sessions));
  }, [sessions]);

  useEffect(() => {
    saveCurrentId(currentId);
  }, [currentId]);

  const current = sessions.find((s) => s.id === currentId) ?? null;

  /** Insert or update a session (matched by id) and make it current. */
  const upsert = useCallback((session) => {
    setSessions((list) => {
      const rest = list.filter((s) => s.id !== session.id);
      return [{ ...session, updatedAt: Date.now() }, ...rest];
    });
    setCurrentId(session.id);
  }, []);

  const open = useCallback((id) => setCurrentId(id), []);
  const close = useCallback(() => setCurrentId(null), []);
  const remove = useCallback((id) => {
    setSessions((list) => list.filter((s) => s.id !== id));
    setCurrentId((cur) => (cur === id ? null : cur));
  }, []);

  return { sessions, current, upsert, open, close, remove, storageOk };
}

export function newSessionId() {
  return globalThis.crypto?.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
