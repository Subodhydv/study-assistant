import { describe, expect, it, vi } from 'vitest';
import { requestStudySet } from '../src/api/client.js';

const respond = (status, body) =>
  vi.fn().mockResolvedValue(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

describe('requestStudySet', () => {
  it('re-validates the server response in the browser', async () => {
    const fetchImpl = respond(200, {
      studySet: { title: 'T', flashcards: [{ front: 'a', back: 'b' }, { front: 'broken' }] },
      warnings: [],
    });
    const out = await requestStudySet({ input: 'x' }, { fetchImpl });
    expect(out.studySet.flashcards).toHaveLength(1);
    expect(out.warnings.join(' ')).toMatch(/skipped/);
  });

  it('rejects a 200 response with an unusable body', async () => {
    await expect(requestStudySet({}, { fetchImpl: respond(200, { studySet: { nope: true } }) })).rejects.toMatchObject({ code: 'WRONG_SHAPE' });
    await expect(requestStudySet({}, { fetchImpl: respond(200, 'not json') })).rejects.toMatchObject({ code: 'MALFORMED_JSON' });
  });

  it('passes structured server errors through', async () => {
    const fetchImpl = respond(429, { error: { code: 'RATE_LIMITED', message: 'wait', retryable: true, retryAfter: 5 } });
    await expect(requestStudySet({}, { fetchImpl })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 5 });
  });

  it('explains a dead dev server (proxy error with no JSON body)', async () => {
    await expect(requestStudySet({}, { fetchImpl: respond(502, '') })).rejects.toMatchObject({ code: 'SERVER_UNREACHABLE' });
  });

  it('times out on the client side as well', async () => {
    const fetchImpl = vi.fn(
      (_u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))),
    );
    await expect(requestStudySet({}, { fetchImpl, timeoutMs: 30 })).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('reports caller cancellation as an AbortError, not a failure', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('a', 'AbortError')))),
    );
    const p = requestStudySet({}, { fetchImpl, signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
