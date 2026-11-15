/**
 * Turning untrusted model output into a study set we can safely render.
 *
 * This file is used by BOTH the server (to validate and, if needed, ask the
 * model to repair its answer) and the browser (so the UI never trusts the
 * network blindly, and so sessions loaded from localStorage are re-checked).
 *
 * Two steps:
 *   1. extractJson(raw)       raw text  -> plain JS value   (or OutputError)
 *   2. normalizeStudySet(val) JS value  -> { studySet, warnings } (or OutputError)
 *
 * The normaliser is deliberately forgiving about *spelling* (e.g. "cards" vs
 * "flashcards", "answer": "B" vs "answerIndex": 1) and strict about *meaning*
 * (a quiz question without a resolvable correct answer is dropped, never guessed).
 */

export const LIMITS = Object.freeze({
  inputMin: 3,
  inputMax: 12000,
  instructionMax: 500,
  maxCards: 30,
  maxQuestions: 30,
  minOptions: 2,
  maxOptions: 6,
  textMax: 800,
  titleMax: 120,
});

export const COUNTS = Object.freeze([5, 10, 15]);
export const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard']);

/** Error codes the UI knows how to explain. */
export const OUTPUT_ERROR = Object.freeze({
  EMPTY: 'EMPTY_OUTPUT',
  MALFORMED: 'MALFORMED_JSON',
  SHAPE: 'WRONG_SHAPE',
  DECLINED: 'MODEL_DECLINED',
});

export class OutputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OutputError';
    this.code = code;
  }
}

/* ------------------------------------------------------------------ */
/* Step 1: raw text -> JSON value                                      */
/* ------------------------------------------------------------------ */

export function extractJson(raw) {
  if (raw !== null && typeof raw === 'object') return raw; // already parsed
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new OutputError(OUTPUT_ERROR.EMPTY, 'The model returned an empty response.');
  }

  let text = raw.trim();

  // Some reasoning models (e.g. via Ollama) prepend <think>...</think>.
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // Markdown code fences: ```json ... ```
  const fence = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  const direct = tryParse(text);
  if (direct.ok) return direct.value;

  // Prose around the JSON ("Sure! Here is your quiz: {...} Hope it helps").
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    const sliced = tryParse(candidate);
    if (sliced.ok) return sliced.value;

    // Last resort: the two most common small-model slips —
    // trailing commas and "smart" quotes used as JSON quotes.
    const repaired = candidate
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/[“”]/g, '"');
    const fixed = tryParse(repaired);
    if (fixed.ok) return fixed.value;
  }

  if (text === '') {
    throw new OutputError(OUTPUT_ERROR.EMPTY, 'The model returned an empty response.');
  }
  throw new OutputError(OUTPUT_ERROR.MALFORMED, "The model's response wasn't valid JSON.");
}

function tryParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/* ------------------------------------------------------------------ */
/* Step 2: JSON value -> validated study set                           */
/* ------------------------------------------------------------------ */

const CARD_KEYS = ['flashcards', 'cards', 'flashCards', 'flash_cards'];
const QUIZ_KEYS = ['quiz', 'questions', 'quizQuestions', 'quiz_questions'];

export function normalizeStudySet(value) {
  const root = unwrap(value);
  if (!root) {
    throw new OutputError(
      OUTPUT_ERROR.SHAPE,
      'The model returned data in an unexpected format (expected flashcards and a quiz).',
    );
  }

  const warnings = [];
  const rawCards = pickArray(root, CARD_KEYS);
  const rawQuiz = pickArray(root, QUIZ_KEYS);

  // The prompt allows the model to say "I can't make study material from this"
  // as { "error": "reason" } instead of inventing content.
  if (rawCards === null && rawQuiz === null && typeof root.error === 'string' && root.error.trim()) {
    throw new OutputError(OUTPUT_ERROR.DECLINED, clampText(toText(root.error), 300));
  }

  if (rawCards === null && rawQuiz === null) {
    throw new OutputError(
      OUTPUT_ERROR.SHAPE,
      'The model returned data in an unexpected format (no flashcards or quiz found).',
    );
  }

  const flashcards = normalizeList(rawCards ?? [], normalizeCard, (c) => c.front, LIMITS.maxCards);
  const quiz = normalizeList(rawQuiz ?? [], normalizeQuestion, (q) => q.question, LIMITS.maxQuestions);

  const totalRaw = (rawCards?.length ?? 0) + (rawQuiz?.length ?? 0);
  if (flashcards.items.length === 0 && quiz.items.length === 0) {
    if (totalRaw === 0) {
      throw new OutputError(OUTPUT_ERROR.EMPTY, 'The model returned no flashcards or questions.');
    }
    throw new OutputError(
      OUTPUT_ERROR.SHAPE,
      `None of the ${totalRaw} items the model returned were complete enough to use.`,
    );
  }

  if (flashcards.dropped) {
    warnings.push(`${plural(flashcards.dropped, 'flashcard')} skipped because ${flashcards.dropped === 1 ? 'it was' : 'they were'} incomplete or repeated.`);
  }
  if (quiz.dropped) {
    warnings.push(`${plural(quiz.dropped, 'question')} skipped because ${quiz.dropped === 1 ? 'it had' : 'they had'} no clear correct answer, too few options, or repeated another.`);
  }
  if (flashcards.truncated) warnings.push(`Only the first ${LIMITS.maxCards} flashcards were kept.`);
  if (quiz.truncated) warnings.push(`Only the first ${LIMITS.maxQuestions} questions were kept.`);
  if (flashcards.items.length === 0) warnings.push('No usable flashcards came back — the quiz is still available.');
  if (quiz.items.length === 0) warnings.push('No usable quiz questions came back — the flashcards are still available.');

  const title = clampText(toText(root.title ?? root.topic ?? root.name), LIMITS.titleMax) || 'Untitled set';

  return {
    studySet: {
      title,
      flashcards: flashcards.items.map((c, i) => ({ id: `c${i + 1}`, ...c })),
      quiz: quiz.items.map((q, i) => ({ id: `q${i + 1}`, ...q })),
    },
    warnings,
  };
}

/** Convenience: raw text -> { studySet, warnings }. */
export function parseStudySet(raw) {
  return normalizeStudySet(extractJson(raw));
}

/* ---------------------------- helpers ----------------------------- */

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Accept a few common wrappers:
 *   { studySet: {...} }, { data: {...} }, or a bare array of cards/questions.
 */
function unwrap(value) {
  if (Array.isArray(value)) {
    const looksLikeQuiz = value.some((v) => isPlainObject(v) && (v.options || v.choices));
    return looksLikeQuiz ? { quiz: value } : { flashcards: value };
  }
  if (!isPlainObject(value)) return null;
  if (pickArray(value, CARD_KEYS) || pickArray(value, QUIZ_KEYS)) return value;
  for (const key of ['studySet', 'study_set', 'result', 'data', 'output']) {
    if (isPlainObject(value[key])) return value[key];
  }
  return value;
}

function pickArray(obj, keys) {
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key];
  }
  return null;
}

function normalizeList(list, normalizeItem, keyOf, max) {
  const items = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of list) {
    const item = normalizeItem(raw);
    const key = item ? keyOf(item).toLowerCase() : null;
    if (!item || seen.has(key)) {
      dropped += 1;
      continue;
    }
    seen.add(key);
    items.push(item);
  }
  const truncated = items.length > max;
  return { items: items.slice(0, max), dropped, truncated };
}

function normalizeCard(raw) {
  if (!isPlainObject(raw)) return null;
  const front = clampText(toText(raw.front ?? raw.term ?? raw.question ?? raw.q ?? raw.prompt));
  const back = clampText(toText(raw.back ?? raw.definition ?? raw.answer ?? raw.a));
  if (!front || !back) return null;
  return { front, back };
}

function normalizeQuestion(raw) {
  if (!isPlainObject(raw)) return null;
  const question = clampText(toText(raw.question ?? raw.prompt ?? raw.q ?? raw.text));
  if (!question) return null;

  let options = raw.options ?? raw.choices;
  let letterKeys = null;
  if (isPlainObject(options)) {
    // { "A": "Paris", "B": "Rome" }
    letterKeys = Object.keys(options).map((k) => k.trim().toUpperCase());
    options = Object.values(options);
  }
  if (!Array.isArray(options)) return null;

  const original = options.map((o) =>
    clampText(toText(isPlainObject(o) ? o.text ?? o.label ?? o.value : o)),
  );

  // Work out the correct answer against the ORIGINAL list first,
  // so de-duplicating options can't silently shift the index.
  const answerText = resolveAnswer(raw, original, letterKeys);
  if (!answerText) return null;

  const cleaned = [];
  const seen = new Set();
  for (const opt of original) {
    if (!opt) continue;
    const key = opt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(opt);
  }

  if (cleaned.length < LIMITS.minOptions || cleaned.length > LIMITS.maxOptions) return null;
  const answerIndex = cleaned.findIndex((o) => o.toLowerCase() === answerText.toLowerCase());
  if (answerIndex === -1) return null;

  const explanation = clampText(toText(raw.explanation ?? raw.rationale ?? raw.why));
  return { question, options: cleaned, answerIndex, explanation };
}

/** Returns the TEXT of the correct option, or null if it can't be determined. */
function resolveAnswer(raw, options, letterKeys) {
  // [value, isExplicitIndexField]
  const candidates = [
    [raw.answerIndex, true],
    [raw.answer_index, true],
    [raw.correctIndex, true],
    [raw.correct_index, true],
    [raw.correctAnswer, false],
    [raw.correct_answer, false],
    [raw.answer, false],
    [raw.correct, false],
  ];

  for (const [c, isIndexField] of candidates) {
    if (c === undefined || c === null || c === '') continue;

    if (typeof c === 'number') {
      // "answer": 4 with options ["2","3","4","5"] means the option "4", not index 4.
      if (!isIndexField) {
        const asText = options.find((o) => o === String(c));
        if (asText) return asText;
      }
      if (Number.isInteger(c) && c >= 0 && c < options.length && options[c]) return options[c];
      continue; // out of range: don't guess (could be 1-based or nonsense)
    }

    if (typeof c === 'string') {
      const s = c.trim();
      // Exact option text
      const exact = options.find((o) => o && o.toLowerCase() === s.toLowerCase());
      if (exact) return exact;
      // Letter: "B", "b", "B)", "(B)", "B. Paris"
      const letter = s.match(/^\(?([A-Fa-f])(?:[).:\s]|$)/);
      if (letter) {
        const L = letter[1].toUpperCase();
        const idx = letterKeys ? letterKeys.indexOf(L) : L.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length && options[idx]) return options[idx];
      }
      // Numeric string: "2"
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        if (n >= 0 && n < options.length && options[n]) return options[n];
      }
    }
  }
  return null;
}

function toText(v) {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

function clampText(s, max = LIMITS.textMax) {
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? ' was' : 's were'}`;
}
