// @vitest-environment node
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';
import { PROVIDER_ERROR, ProviderError } from '../server/llm.js';

const config = { provider: 'test', label: 'Test', model: 'm', timeoutMs: 1000 };
const valid = JSON.stringify({ title: 'T', flashcards: [{ front: 'a', back: 'b' }], quiz: [] });

describe('API', () => {
  it('reports the configured provider without exposing the key', async () => {
    const app = createApp({ ...config, apiKey: 'secret-key' });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, provider: 'test', demo: false });
    expect(JSON.stringify(res.body)).not.toContain('secret-key');
  });

  it('returns a validated set', async () => {
    const app = createApp(config, { callModel: vi.fn().mockResolvedValue({ content: valid }) });
    const res = await request(app).post('/api/generate').send({ input: 'notes here' });
    expect(res.status).toBe(200);
    expect(res.body.studySet.flashcards[0]).toMatchObject({ front: 'a', back: 'b' });
  });

  it.each([
    [{ content: 'nope' }, 502, 'MALFORMED_JSON', true],
    [{ content: '' }, 502, 'EMPTY_OUTPUT', true],
    [{ content: '{"error":"gibberish"}' }, 422, 'MODEL_DECLINED', false],
  ])('maps bad output %j to HTTP %i %s', async (reply, status, code, retryable) => {
    const app = createApp(config, { callModel: vi.fn().mockResolvedValue(reply) });
    const res = await request(app).post('/api/generate').send({ input: 'notes here' });
    expect(res.status).toBe(status);
    expect(res.body.error).toMatchObject({ code, retryable });
  });

  it('maps provider errors and passes Retry-After through', async () => {
    const err = new ProviderError(PROVIDER_ERROR.RATE_LIMITED, 'slow down', { retryAfter: 12 });
    const app = createApp(config, { callModel: vi.fn().mockRejectedValue(err) });
    const res = await request(app).post('/api/generate').send({ input: 'notes here' });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('12');
    expect(res.body.error).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 12 });
  });

  it('rejects invalid input and broken JSON bodies with 400', async () => {
    const app = createApp(config, { callModel: vi.fn() });
    expect((await request(app).post('/api/generate').send({ input: '' })).status).toBe(400);
    const broken = await request(app).post('/api/generate').set('Content-Type', 'application/json').send('{bad');
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe('INVALID_REQUEST');
  });

  it('hides unexpected server errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApp(config, { callModel: vi.fn().mockRejectedValue(new Error('db password is hunter2')) });
    const res = await request(app).post('/api/generate').send({ input: 'notes here' });
    expect(res.status).toBe(500);
    expect(res.body.error.message).not.toContain('hunter2');
  });

  it('runs the full pipeline against the offline mock model', async () => {
    const app = createApp(loadConfig({}));
    const res = await request(app).post('/api/generate').send({ input: 'Photosynthesis basics #malformed-once' });
    expect(res.status).toBe(200);
    expect(res.body.meta.attempts).toBe(2);
  });
});

describe('loadConfig', () => {
  it('falls back to the mock model without a key', () => {
    expect(loadConfig({ LLM_PROVIDER: 'groq' })).toMatchObject({ provider: 'mock', mockReason: expect.stringMatching(/LLM_API_KEY/) });
    expect(loadConfig({ LLM_PROVIDER: 'nonsense', LLM_API_KEY: 'k' }).provider).toBe('mock');
  });

  it('uses provider presets and overrides', () => {
    const c = loadConfig({ LLM_PROVIDER: 'gemini', LLM_API_KEY: 'k', LLM_MODEL: 'custom', LLM_TIMEOUT_MS: '999999' });
    expect(c).toMatchObject({ provider: 'gemini', model: 'custom', timeoutMs: 120000 });
    expect(c.baseUrl).toMatch(/generativelanguage/);
    expect(loadConfig({ LLM_PROVIDER: 'ollama' }).provider).toBe('ollama'); // no key needed
  });
});
