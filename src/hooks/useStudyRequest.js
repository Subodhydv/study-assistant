import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, requestStudySet } from '../api/client.js';

const IDLE = { status: 'idle', error: null, mode: null, startedAt: null };

/**
 * Owns the lifecycle of "ask the model for a study set".
 *
 * Race protection, two layers:
 *  1. Starting a request aborts the one in flight (saves tokens, frees the server).
 *  2. Each request gets an id; a response is applied only if its id is still
 *     the latest. Even if an abort loses a race, a stale answer can never
 *     overwrite a newer one.
 *
 * onSuccess(result, payload) is called only for the latest request.
 */
export function useStudyRequest({ onSuccess, request = requestStudySet } = {}) {
  const [state, setState] = useState(IDLE);
  const latestId = useRef(0);
  const controllerRef = useRef(null);
  const lastPayload = useRef(null);
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  // Abort anything in flight when the component unmounts.
  useEffect(() => () => controllerRef.current?.abort(), []);

  const run = useCallback(
    async (payload) => {
      controllerRef.current?.abort();
      const id = ++latestId.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      lastPayload.current = payload;
      setState({ status: 'loading', error: null, mode: payload.mode, startedAt: Date.now() });

      try {
        const result = await request(payload, { signal: controller.signal });
        if (id !== latestId.current) return; // superseded
        setState({ ...IDLE, status: 'success', mode: payload.mode });
        onSuccessRef.current?.(result, payload);
      } catch (err) {
        if (id !== latestId.current || err?.name === 'AbortError') return;
        const error =
          err instanceof ApiError ? err : new ApiError('UNKNOWN', err?.message || 'Unexpected error.');
        setState({ status: 'error', error, mode: payload.mode, startedAt: null });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [request],
  );

  const cancel = useCallback(() => {
    latestId.current += 1; // anything still in flight is now stale
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState(IDLE);
  }, []);

  const retry = useCallback(() => {
    if (lastPayload.current) run(lastPayload.current);
  }, [run]);

  const dismiss = useCallback(() => setState(IDLE), []);

  return { ...state, isLoading: state.status === 'loading', run, cancel, retry, dismiss };
}
