// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LIMITS, OutputError, extractJson, normalizeStudySet, parseStudySet } from '../shared/studySet.js';

const good = {
  title: 'Cells',
  flashcards: [{ front: 'What makes ATP?', back: 'Mitochondria' }],
  quiz: [{ question: 'Powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi'], answerIndex: 1, explanation: 'It makes ATP.' }],
};

const codeOf = (fn) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OutputError);
    return e.code;
  }
  throw new Error('expected an OutputError');
};

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson(JSON.stringify(good))).toEqual(good);
  });

  it('strips markdown code fences', () => {
    expect(extractJson('```json\n' + JSON.stringify(good) + '\n```')).toEqual(good);
  });

  it('finds JSON surrounded by chatter', () => {
    expect(extractJson(`Sure! Here you go:\n${JSON.stringify(good)}\nGood luck!`)).toEqual(good);
  });

  it('removes <think> blocks from reasoning models', () => {
    expect(extractJson(`<think>hmm {not json}</think>${JSON.stringify(good)}`)).toEqual(good);
  });

  it('repairs trailing commas', () => {
    expect(extractJson('{"title":"x","flashcards":[{"front":"a","back":"b",},],}')).toEqual({
      title: 'x',
      flashcards: [{ front: 'a', back: 'b' }],
    });
  });

  it('reports empty and malformed output with distinct codes', () => {
    expect(codeOf(() => extractJson(''))).toBe('EMPTY_OUTPUT');
    expect(codeOf(() => extractJson('   '))).toBe('EMPTY_OUTPUT');
    expect(codeOf(() => extractJson(null))).toBe('EMPTY_OUTPUT');
    expect(codeOf(() => extractJson('{"title": "cut off", "flashcards": [{"front": "Wha'))).toBe('MALFORMED_JSON');
    expect(codeOf(() => extractJson('I cannot help with that.'))).toBe('MALFORMED_JSON');
  });
});

describe('normalizeStudySet', () => {
  it('accepts a valid set and assigns ids', () => {
    const { studySet, warnings } = normalizeStudySet(good);
    expect(warnings).toEqual([]);
    expect(studySet.flashcards[0]).toEqual({ id: 'c1', front: 'What makes ATP?', back: 'Mitochondria' });
    expect(studySet.quiz[0].id).toBe('q1');
    expect(studySet.quiz[0].answerIndex).toBe(1);
  });

  it('is idempotent (client re-validates what the server already validated)', () => {
    const once = normalizeStudySet(good).studySet;
    expect(normalizeStudySet(once).studySet).toEqual(once);
  });

  it('accepts common key aliases and wrappers', () => {
    const { studySet } = normalizeStudySet({
      data: {
        topic: 'Alias test',
        cards: [{ term: 'H2O', definition: 'Water' }],
        questions: [{ prompt: '2+2?', choices: ['3', '4'], correct_answer: '4' }],
      },
    });
    expect(studySet.title).toBe('Alias test');
    expect(studySet.flashcards[0]).toMatchObject({ front: 'H2O', back: 'Water' });
    expect(studySet.quiz[0]).toMatchObject({ options: ['3', '4'], answerIndex: 1 });
  });

  it('resolves answers given as letters, text, or option objects', () => {
    const base = { question: 'Q?', options: ['Red', 'Green', 'Blue'] };
    const resolve = (extra) => normalizeStudySet({ quiz: [{ ...base, ...extra }] }).studySet.quiz[0].answerIndex;
    expect(resolve({ answer: 'C' })).toBe(2);
    expect(resolve({ answer: 'b)' })).toBe(1);
    expect(resolve({ answer: 'green' })).toBe(1);
    expect(resolve({ correctIndex: 0 })).toBe(0);
    const lettered = normalizeStudySet({
      quiz: [{ question: 'Q?', options: { A: 'Red', B: 'Green' }, answer: 'B' }],
    }).studySet.quiz[0];
    expect(lettered).toMatchObject({ options: ['Red', 'Green'], answerIndex: 1 });
  });

  it('treats a numeric "answer" as option text when it matches one', () => {
    const q = normalizeStudySet({ quiz: [{ question: '2+2?', options: ['2', '3', '4', '5'], answer: 4 }] }).studySet.quiz[0];
    expect(q.options[q.answerIndex]).toBe('4');
  });

  it('keeps the right answer when duplicate options are removed', () => {
    const q = normalizeStudySet({
      quiz: [{ question: 'Q?', options: ['Paris', 'paris', 'Rome', 'Berlin'], answerIndex: 2 }],
    }).studySet.quiz[0];
    expect(q.options).toEqual(['Paris', 'Rome', 'Berlin']);
    expect(q.options[q.answerIndex]).toBe('Rome');
  });

  it('drops questions it cannot trust, and says so', () => {
    const { studySet, warnings } = normalizeStudySet({
      flashcards: [{ front: 'ok', back: 'ok' }, { front: 'no back' }, { front: 'OK', back: 'dupe' }, 'not an object'],
      quiz: [
        { question: 'Out of range', options: ['a', 'b'], answerIndex: 2 },
        { question: 'One option', options: ['a'], answerIndex: 0 },
        { question: 'No answer', options: ['a', 'b'] },
        { question: 'Too many', options: ['1', '2', '3', '4', '5', '6', '7'], answerIndex: 0 },
        { question: 'Fine', options: ['a', 'b'], answerIndex: 0 },
      ],
    });
    expect(studySet.flashcards).toHaveLength(1);
    expect(studySet.quiz.map((q) => q.question)).toEqual(['Fine']);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/3 flashcards were skipped/);
    expect(warnings[1]).toMatch(/4 questions were skipped/);
  });

  it('warns when one half of the set is missing', () => {
    const { warnings } = normalizeStudySet({ flashcards: [{ front: 'a', back: 'b' }] });
    expect(warnings.join(' ')).toMatch(/No usable quiz questions/);
  });

  it('caps the number of items and long text', () => {
    const many = Array.from({ length: LIMITS.maxCards + 5 }, (_, i) => ({ front: `F${i}`, back: 'x'.repeat(2000) }));
    const { studySet, warnings } = normalizeStudySet({ flashcards: many });
    expect(studySet.flashcards).toHaveLength(LIMITS.maxCards);
    expect(studySet.flashcards[0].back.length).toBeLessThanOrEqual(LIMITS.textMax);
    expect(warnings.join(' ')).toMatch(/Only the first/);
  });

  it('rejects wrong shapes, empty sets and all-invalid sets', () => {
    expect(codeOf(() => normalizeStudySet('a string'))).toBe('WRONG_SHAPE');
    expect(codeOf(() => normalizeStudySet({ items: [1, 2] }))).toBe('WRONG_SHAPE');
    expect(codeOf(() => normalizeStudySet({ flashcards: [], quiz: [] }))).toBe('EMPTY_OUTPUT');
    expect(codeOf(() => normalizeStudySet({ flashcards: [{ front: 'x' }] }))).toBe('WRONG_SHAPE');
  });

  it('passes through a model refusal as MODEL_DECLINED', () => {
    expect(codeOf(() => normalizeStudySet({ error: 'That is gibberish.' }))).toBe('MODEL_DECLINED');
  });

  it('accepts a bare array of cards or questions', () => {
    expect(parseStudySet('[{"front":"a","back":"b"}]').studySet.flashcards).toHaveLength(1);
    expect(parseStudySet('[{"question":"q","options":["a","b"],"answerIndex":1}]').studySet.quiz).toHaveLength(1);
  });
});
