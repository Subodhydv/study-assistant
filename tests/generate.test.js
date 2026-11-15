// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { generateStudySet, parseRequest } from '../server/generate.js';
import { PROVIDER_ERROR, ProviderError } from '../server/llm.js';

const config = { provider: 'test', model: 'test-model', timeoutMs: 1000 };
const validJson = JSON.stringify({
  title: 'T',
  flashcards: [{ front: 'a', back: 'b' }],
  quiz: [{ question: 'q', options: ['x', 'y'], answerIndex: 0 }],
});
const reply = (content, finishReason = 'stop') => ({ content, finishReason });

describe('parseRequest', () => {
  it('validates create requests and fills defaults', () => {
    expect(parseRequest({ input: '  photosynthesis  ' })).toEqual({
      mode: 'create',
      input: 'photosynthesis',
      count: 10,
      difficulty: 'medium',
    });
    expect(parseRequest({ input: 'abc', count: 15, difficulty: 'hard' })).toMatchObject({ count: 15, difficulty: 'hard' });
    expect(parseRequest({ input: 'abc', count: 999, difficulty: 'impossible' })).toMatchObject({ count: 10, difficulty: 'medium' });
  });

  it('rejects empty, too long, and malformed requests', () => {
    expect(() => parseRequest(null)).toThrow(/JSON/);
    expect(() => parseRequest({ input: ' ' })).toThrow(/Add some notes/);
    expect(() => parseRequest({ input: 'x'.repeat(12001) })).toThrow(/too long/);
  });

  it('validates refine requests, including the set being edited', () => {
    expect(() => parseRequest({ mode: 'refine', instruction: '', current: {} })).toThrow(/Describe/);
    expect(() => parseRequest({ mode: 'refine', instruction: 'harder', current: { nope: 1 } })).toThrow(/damaged/);
    const ok = parseRequest({ mode: 'refine', instruction: 'harder', current: JSON.parse(validJson) });
    expect(ok.current.flashcards).toHaveLength(1);
  });
});

describe('generateStudySet', () => {
  const request = { mode: 'create', input: 'notes', count: 5, difficulty: 'easy' };

  it('returns a validated set on the first try', async () => {
    const callModel = vi.fn().mockResolvedValue(reply(validJson));
    const result = await generateStudySet(request, { config, callModel });
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(result.studySet.title).toBe('T');
    expect(result.meta).toMatchObject({ attempts: 1, provider: 'test', model: 'test-model' });
  });

  it('asks the model to repair unusable output once, and tells it what was wrong', async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(reply('{"title": "broken', 'length'))
      .mockResolvedValueOnce(reply(validJson));
    const result = await generateStudySet(request, { config, callModel });
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(result.meta.attempts).toBe(2);
    const repairMessages = callModel.mock.calls[1][1];
    const last = repairMessages[repairMessages.length - 1].content;
    expect(last).toMatch(/wasn't valid JSON/);
    expect(last).toMatch(/cut off/);
  });

  it('gives up after one failed repair', async () => {
    const callModel = vi.fn().mockResolvedValue(reply('{"items": []}'));
    await expect(generateStudySet(request, { config, callModel })).rejects.toMatchObject({ code: 'WRONG_SHAPE' });
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the model declines the input', async () => {
    const callModel = vi.fn().mockResolvedValue(reply('{"error": "Nothing to study."}'));
    await expect(generateStudySet(request, { config, callModel })).rejects.toMatchObject({ code: 'MODEL_DECLINED' });
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it('does not retry transport errors', async () => {
    const callModel = vi.fn().mockRejectedValue(new ProviderError(PROVIDER_ERROR.RATE_LIMITED, 'slow down'));
    await expect(generateStudySet(request, { config, callModel })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it('sends the current set and instruction when refining', async () => {
    const callModel = vi.fn().mockResolvedValue(reply(validJson));
    const current = parseRequest({ mode: 'refine', instruction: 'add dates', current: JSON.parse(validJson) });
    await generateStudySet(current, { config, callModel });
    const userMessage = callModel.mock.calls[0][1][1].content;
    expect(userMessage).toMatch(/add dates/);
    expect(userMessage).toMatch(/"front":"a"/);
  });
});
