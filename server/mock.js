/**
 * Offline stand-in for a real model. Same signature as callChatModel, so the
 * whole pipeline (parsing, validation, repair, errors) runs exactly as it would
 * against a real provider.
 *
 * It also lets you trigger each failure mode on purpose by putting a tag in
 * your notes (or in a refine request), e.g. "#malformed". See README.
 */
import { PROVIDER_ERROR, ProviderError } from './llm.js';

export const MOCK_SCENARIOS = {
  '#slow': 'Answers correctly after 8 seconds',
  '#malformed': 'Broken JSON twice, so the repair step also fails',
  '#malformed-once': 'Broken JSON, then a valid repair',
  '#wrongshape': 'Valid JSON in the wrong structure',
  '#partial': 'Some items are incomplete and get dropped',
  '#empty': 'An empty reply',
  '#decline': 'The model says it cannot use the input',
  '#timeout': 'The model never answers in time',
  '#ratelimit': 'HTTP 429 from the provider',
  '#fail': 'HTTP 500 from the provider',
};

export async function callMockModel(config, messages, { signal } = {}) {
  const firstUser = messages.find((m) => m.role === 'user')?.content ?? '';
  const isRepair = messages.length > 2;
  const isRefine = firstUser.includes('Edit it according to this request');
  const material = (firstUser.match(/<material>\n?([\s\S]*?)\n?<\/material>/) || [])[1] ?? '';
  const instruction = (firstUser.match(/request: "([\s\S]*?)"\n/) || [])[1] ?? '';
  const scenario = findScenario(isRefine ? instruction : material);

  await sleep(scenario === '#slow' ? 8000 : 700 + Math.random() * 600, signal);

  switch (scenario) {
    case '#timeout':
      await sleep(4000, signal);
      throw new ProviderError(PROVIDER_ERROR.TIMEOUT, 'The AI model took too long to answer (simulated).');
    case '#ratelimit':
      throw new ProviderError(PROVIDER_ERROR.RATE_LIMITED, 'The AI provider is rate-limiting requests (simulated).', { status: 429, retryAfter: 20 });
    case '#fail':
      throw new ProviderError(PROVIDER_ERROR.UPSTREAM, 'The AI provider returned an error (HTTP 500, simulated).', { status: 500 });
    case '#empty':
      return reply('');
    case '#decline':
      return reply(JSON.stringify({ error: "This text doesn't contain anything to study." }));
    case '#malformed':
      return reply('Sure! Here are your flashcards:\n{"title": "Oops", "flashcards": [{"front": "What is', 'length');
    case '#malformed-once':
      if (!isRepair) return reply('{"title": "Almost", "flashcards": [{"front": "Unclosed", "back": "string}]');
      break;
    case '#wrongshape':
      return reply(JSON.stringify({ result: 'ok', items: ['photosynthesis', 'chlorophyll'] }));
    default:
      break;
  }

  const set = isRefine ? refineSet(material, instruction) : buildSet(material);
  if (scenario === '#partial') {
    set.flashcards.push({ front: 'A card with no back' }, { front: '', back: 'No front' });
    set.quiz.push(
      { question: 'Question with an impossible answer', options: ['A', 'B'], answerIndex: 7 },
      { question: 'Question with one option', options: ['Only one'], answerIndex: 0 },
    );
  }
  // Wrap in a code fence half the time: real models do this even when told not to.
  const json = JSON.stringify(set, null, 2);
  return reply(Math.random() < 0.5 ? `\`\`\`json\n${json}\n\`\`\`` : json);
}

/* ------------------------------------------------------------------ */

function reply(content, finishReason = 'stop') {
  return { content, finishReason };
}

function findScenario(text) {
  const tags = Object.keys(MOCK_SCENARIOS).sort((a, b) => b.length - a.length);
  return tags.find((t) => text.toLowerCase().includes(t)) ?? null;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new ProviderError(PROVIDER_ERROR.ABORTED, 'Request cancelled.'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new ProviderError(PROVIDER_ERROR.ABORTED, 'Request cancelled.'));
      },
      { once: true },
    );
  });
}

const STOP = new Set(
  'about above after again also although among another because been before being below between both cannot could does doing during each from further have having here into itself just more most much must only other over same should since some such than that their them then there these they this those through under until very were what when where which while will with within would your'.split(' '),
);

/**
 * Very rough offline "generator": turns each sentence of the notes into a
 * fill-in-the-blank card by hiding its most distinctive word.
 */
function buildSet(material) {
  const text = material.replace(/#[\w-]+/g, '').trim();
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 5);

  if (sentences.length < 2) return sampleSet(text || 'your topic');

  const picks = sentences.slice(0, 10).map((s) => {
    const words = s.match(/[A-Za-z][A-Za-z-]{3,}/g) ?? [];
    const key = words
      .filter((w) => !STOP.has(w.toLowerCase()))
      .sort((a, b) => b.length - a.length)[0];
    return key ? { sentence: s, key } : null;
  }).filter(Boolean);

  if (picks.length < 2) return sampleSet(text);

  const blank = (p) => p.sentence.replace(new RegExp(`\\b${escapeRe(p.key)}\\b`), '_____');
  const keys = [...new Set(picks.map((p) => p.key))];

  return {
    title: `Demo set: ${text.split(/\s+/).slice(0, 6).join(' ')}`,
    flashcards: picks.map((p) => ({ front: blank(p), back: p.key })),
    quiz: picks.map((p, i) => {
      const distractors = keys.filter((k) => k !== p.key);
      const fillers = ['None of these', 'All of these', 'Not stated'];
      const wrong = [...rotate(distractors, i), ...fillers].slice(0, 3);
      const options = [...wrong];
      const answerIndex = i % 4;
      options.splice(answerIndex, 0, p.key);
      return {
        question: `Which word completes this? "${blank(p)}"`,
        options,
        answerIndex,
        explanation: `The original sentence: "${p.sentence}"`,
      };
    }),
  };
}

function sampleSet(topic) {
  const t = topic.slice(0, 60);
  return {
    title: `Demo set: ${t}`,
    flashcards: [
      { front: `Demo mode: why are these cards generic?`, back: `No API key is configured, so an offline mock model answered instead of a real one. Add a key in .env to get real cards about "${t}".` },
      { front: 'What does active recall mean?', back: 'Testing yourself by retrieving an answer from memory, rather than re-reading notes.' },
      { front: 'What is spaced repetition?', back: 'Reviewing material at increasing intervals so it moves into long-term memory.' },
      { front: 'What is the testing effect?', back: 'Taking practice tests improves later recall more than the same time spent re-studying.' },
      { front: 'What is interleaving?', back: 'Mixing different topics or problem types in one study session instead of blocking them.' },
    ],
    quiz: [
      { question: 'Which technique involves reviewing material at increasing intervals?', options: ['Highlighting', 'Spaced repetition', 'Re-reading', 'Cramming'], answerIndex: 1, explanation: 'Spaced repetition spreads reviews out over growing gaps.' },
      { question: 'Retrieving an answer from memory without looking is called…', options: ['Active recall', 'Passive review', 'Skimming', 'Summarising'], answerIndex: 0, explanation: 'Active recall means pulling information out of memory.' },
      { question: 'Mixing different problem types in one session is called…', options: ['Blocking', 'Chunking', 'Elaboration', 'Interleaving'], answerIndex: 3, explanation: 'Interleaving alternates topics instead of grouping them.' },
      { question: 'Why are these demo questions not about your topic?', options: ['The topic was too short', 'No API key is set, so a mock model is answering', 'The quiz is random', 'The model is broken'], answerIndex: 1, explanation: 'Set LLM_PROVIDER and LLM_API_KEY in .env to use a real model.' },
    ],
  };
}

function refineSet(material, instruction) {
  let current;
  try {
    current = JSON.parse(material);
  } catch {
    current = sampleSet('refined');
  }
  const clean = instruction.replace(/#[\w-]+/g, '').trim();
  return {
    ...current,
    title: current.title?.startsWith('Demo set') ? current.title : `Demo set: ${current.title}`,
    flashcards: [
      { front: `Demo refinement: "${clean.slice(0, 80)}"`, back: 'The mock model can only add this note. A real model would rewrite the set to match your request.' },
      ...(current.flashcards ?? []),
    ],
    quiz: current.quiz ?? [],
  };
}

function rotate(arr, n) {
  if (!arr.length) return arr;
  const k = n % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
