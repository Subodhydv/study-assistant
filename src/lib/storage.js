import { normalizeStudySet } from '../../shared/studySet.js';

const SESSIONS_KEY = 'cue-cards:sessions:v1';
const CURRENT_KEY = 'cue-cards:current:v1';
const THEME_KEY = 'cue-cards:theme';
const MAX_SESSIONS = 20;

/**
 * localStorage can be full, disabled (private mode), or hold data from an
 * older version or a manual edit. Every read is validated; anything that
 * doesn't pass is dropped instead of crashing the app.
 */
export function loadSessions() {
  const raw = safeGet(SESSIONS_KEY);
  if (!raw) return [];
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.map(reviveSession).filter(Boolean);
}

export function saveSessions(sessions) {
  const trimmed = [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS)
    .map(({ id, createdAt, updatedAt, input, options, studySet }) => ({
      id,
      createdAt,
      updatedAt,
      input,
      options,
      studySet,
    }));
  return safeSet(SESSIONS_KEY, JSON.stringify(trimmed));
}

export const loadCurrentId = () => safeGet(CURRENT_KEY);
export const saveCurrentId = (id) => (id ? safeSet(CURRENT_KEY, id) : safeRemove(CURRENT_KEY));
export const loadTheme = () => safeGet(THEME_KEY);
export const saveTheme = (theme) => safeSet(THEME_KEY, theme);

function reviveSession(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string') return null;
  try {
    const { studySet } = normalizeStudySet(s.studySet);
    return {
      id: s.id,
      createdAt: Number(s.createdAt) || Date.now(),
      updatedAt: Number(s.updatedAt) || Date.now(),
      input: typeof s.input === 'string' ? s.input : '',
      options: s.options && typeof s.options === 'object' ? s.options : {},
      studySet,
      warnings: [],
      history: [],
    };
  } catch {
    return null;
  }
}

function safeGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false; // quota exceeded or storage disabled; the app keeps working in memory
  }
}

function safeRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
