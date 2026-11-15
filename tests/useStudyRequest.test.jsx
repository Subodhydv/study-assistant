import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client.js';
import { useStudyRequest } from '../src/hooks/useStudyRequest.js';

/** A request whose resolution we control from the test. */
function deferredRequest() {
  const calls = [];
  const request = vi.fn((payload, { signal }) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ payload, signal, resolve, reject });
    return promise;
  });
  return { request, calls };
}

describe('useStudyRequest', () => {
  it('ignores a slow older response that arrives after a newer one', async () => {
    const { request, calls } = deferredRequest();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useStudyRequest({ onSuccess, request }));

    act(() => {
      result.current.run({ mode: 'create', input: 'first' });
    });
    act(() => {
      result.current.run({ mode: 'create', input: 'second' });
    });

    expect(calls[0].signal.aborted).toBe(true); // the first request was cancelled

    await act(async () => {
      calls[1].resolve({ studySet: { title: 'second' } });
    });
    await act(async () => {
      calls[0].resolve({ studySet: { title: 'first (stale)' } }); // arrives late anyway
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0][0].studySet.title).toBe('second');
    expect(result.current.status).toBe('success');
  });

  it('ignores a stale error too', async () => {
    const { request, calls } = deferredRequest();
    const { result } = renderHook(() => useStudyRequest({ request }));
    act(() => {
      result.current.run({ mode: 'create', input: 'a' });
    });
    act(() => {
      result.current.run({ mode: 'create', input: 'b' });
    });
    await act(async () => {
      calls[0].reject(new ApiError('TIMEOUT', 'old'));
    });
    expect(result.current.status).toBe('loading');
  });

  it('exposes errors and retries the same payload', async () => {
    const { request, calls } = deferredRequest();
    const { result } = renderHook(() => useStudyRequest({ request }));
    act(() => {
      result.current.run({ mode: 'create', input: 'x' });
    });
    await act(async () => {
      calls[0].reject(new ApiError('MALFORMED_JSON', 'bad'));
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error.code).toBe('MALFORMED_JSON');

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe('loading');
    expect(calls[1].payload).toEqual({ mode: 'create', input: 'x' });
  });

  it('cancel aborts and returns to idle', async () => {
    const { request, calls } = deferredRequest();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useStudyRequest({ onSuccess, request }));
    act(() => {
      result.current.run({ mode: 'create', input: 'x' });
    });
    act(() => {
      result.current.cancel();
    });
    expect(calls[0].signal.aborted).toBe(true);
    await act(async () => {
      calls[0].resolve({ studySet: {} });
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});
