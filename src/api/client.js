import { OutputError, normalizeStudySet } from '../../shared/studySet.js';

/** Upper bound for one generate call, including the server's repair attempt. */
export const CLIENT_TIMEOUT_MS = 75_000;

export class ApiError extends Error {
  constructor(code, message, { retryable = true, retryAfter, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.status = status;
  }
}

/** Thrown when the caller cancelled. The UI ignores these. */
export class AbortedError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'AbortError';
  }
}

/**
 * POST /api/generate with a timeout and cancellation.
 * The response is validated again here: the browser never renders data
 * it hasn't checked itself.
 */
export async function requestStudySet(payload, { signal, timeoutMs = CLIENT_TIMEOUT_MS, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  const failure = (err) => {
    if (signal?.aborted) return new AbortedError();
    if (timedOut) {
      return new ApiError('TIMEOUT', `No answer after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    if (err instanceof ApiError) return err;
    return new ApiError('NETWORK_ERROR', "Couldn't reach the app server.");
  };

  try {
    let res;
    let body;
    try {
      res = await fetchImpl('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      body = await res.json().catch((err) => {
        if (controller.signal.aborted) throw err;
        return null;
      });
    } catch (err) {
      throw failure(err);
    }

    if (!res.ok) {
      const e = body?.error;
      if (!e) {
        throw new ApiError(
          'SERVER_UNREACHABLE',
          `The app server didn't respond properly (HTTP ${res.status}). Is \`npm start\` still running?`,
          { status: res.status },
        );
      }
      throw new ApiError(e.code ?? `HTTP_${res.status}`, e.message ?? `Request failed (HTTP ${res.status}).`, {
        retryable: e.retryable ?? res.status >= 500,
        retryAfter: e.retryAfter,
        status: res.status,
      });
    }

    if (!body || typeof body !== 'object') {
      throw new ApiError('MALFORMED_JSON', 'The server sent a response the app could not read.');
    }

    try {
      const { studySet, warnings } = normalizeStudySet(body.studySet);
      const allWarnings = [...new Set([...(Array.isArray(body.warnings) ? body.warnings : []), ...warnings])];
      return { studySet, warnings: allWarnings, meta: body.meta ?? {} };
    } catch (err) {
      if (err instanceof OutputError) throw new ApiError(err.code, err.message);
      throw err;
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

export async function fetchHealth({ signal } = {}) {
  const res = await fetch('/api/health', { signal });
  if (!res.ok) throw new Error(`Health check failed (HTTP ${res.status})`);
  return res.json();
}
