// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callChatModel } from '../server/llm.js';

const config = { provider: 'groq', label: 'Groq', baseUrl: 'https://example.test/v1', model: 'm', apiKey: 'k', timeoutMs: 1000 };
const json = (status, body, headers = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe('callChatModel', () => {
  it('sends an OpenAI-style request with JSON mode and the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await callChatModel(config, [{ role: 'user', content: 'hi' }]);
    expect(out).toEqual({ content: '{}', finishReason: 'stop' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'm', response_format: { type: 'json_object' } });
  });

  it('retries without JSON mode when the provider rejects it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(400, { error: { message: "response_format 'json_object' is not supported" } }))
      .mockResolvedValueOnce(json(200, { choices: [{ message: { content: 'ok' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await callChatModel(config, []);
    expect(out.content).toBe('ok');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined();
  });

  it('maps HTTP errors to clear codes', async () => {
    const cases = [
      [json(401, {}), 'AUTH_FAILED'],
      [json(404, {}), 'MODEL_NOT_FOUND'],
      [json(429, {}, { 'Retry-After': '7' }), 'RATE_LIMITED'],
      [json(503, 'down'), 'PROVIDER_ERROR'],
      [json(200, { choices: [] }), 'PROVIDER_ERROR'],
      [json(200, 'not json'), 'PROVIDER_ERROR'],
    ];
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [response, code] of cases) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(callChatModel(config, [])).rejects.toMatchObject({ code });
    }
  });

  it('includes Retry-After on rate limits', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(429, {}, { 'Retry-After': '7' })));
    await expect(callChatModel(config, [])).rejects.toMatchObject({ retryAfter: 7 });
  });

  it('times out slow providers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))),
    );
    await expect(callChatModel({ ...config, timeoutMs: 50 }, [])).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(callChatModel(config, [])).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('joins content returned as an array of parts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(200, { choices: [{ message: { content: [{ text: '{"a"' }, { text: ':1}' }] } }] })));
    expect((await callChatModel(config, [])).content).toBe('{"a":1}');
  });
});
