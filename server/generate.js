import {
  COUNTS,
  DIFFICULTIES,
  LIMITS,
  OUTPUT_ERROR,
  OutputError,
  normalizeStudySet,
  parseStudySet,
} from '../shared/studySet.js';
import { buildCreateMessages, buildRefineMessages, buildRepairMessage } from './prompts.js';

export class RequestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RequestError';
    this.code = 'INVALID_REQUEST';
  }
}

/** Validate the browser's request body. Never trust the client either. */
export function parseRequest(body) {
  if (!body || typeof body !== 'object') throw new RequestError('Request body must be JSON.');
  const mode = body.mode === 'refine' ? 'refine' : 'create';

  if (mode === 'create') {
    const input = typeof body.input === 'string' ? body.input.trim() : '';
    if (input.length < LIMITS.inputMin) {
      throw new RequestError('Add some notes or a topic first.');
    }
    if (input.length > LIMITS.inputMax) {
      throw new RequestError(`Notes are too long (${input.length.toLocaleString()} characters). The limit is ${LIMITS.inputMax.toLocaleString()}.`);
    }
    const count = COUNTS.includes(Number(body.count)) ? Number(body.count) : 10;
    const difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'medium';
    return { mode, input, count, difficulty };
  }

  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (!instruction) throw new RequestError('Describe how you want the set changed.');
  if (instruction.length > LIMITS.instructionMax) {
    throw new RequestError(`Keep the change request under ${LIMITS.instructionMax} characters.`);
  }
  let current;
  try {
    current = normalizeStudySet(body.current).studySet;
  } catch {
    throw new RequestError('The set to edit is missing or damaged.');
  }
  return { mode, instruction, current };
}

/**
 * Ask the model, validate, and — if the reply is unusable — ask it ONCE to
 * fix its own output. Transport errors (timeouts, 429s, etc.) are not retried
 * here; the user gets a clear error and a Retry button instead.
 */
export async function generateStudySet(request, { config, callModel, signal }) {
  const started = Date.now();
  const messages =
    request.mode === 'refine' ? buildRefineMessages(request) : buildCreateMessages(request);

  let reply = await callModel(config, messages, { signal });
  let attempts = 1;
  let result;

  try {
    result = parseStudySet(reply.content);
  } catch (firstError) {
    if (!(firstError instanceof OutputError) || firstError.code === OUTPUT_ERROR.DECLINED) {
      throw firstError;
    }
    console.warn(`[generate] attempt 1 unusable (${firstError.code}); asking the model to repair it`);

    const repairMessages = [
      ...messages,
      { role: 'assistant', content: (reply.content || '(empty reply)').slice(0, 6000) },
      buildRepairMessage(firstError, reply.finishReason),
    ];
    reply = await callModel(config, repairMessages, { signal });
    attempts = 2;
    result = parseStudySet(reply.content); // throws OutputError if still bad
  }

  return {
    studySet: result.studySet,
    warnings: result.warnings,
    meta: {
      mode: request.mode,
      provider: config.provider,
      model: config.model,
      attempts,
      durationMs: Date.now() - started,
    },
  };
}
