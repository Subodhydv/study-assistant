/**
 * Minimal client for any OpenAI-compatible /chat/completions endpoint
 * (Gemini, Groq, OpenRouter, OpenAI, Ollama). Plain fetch, no SDK, so every
 * failure path is visible and testable.
 *
 * It only knows about transport problems. Whether the *content* is usable
 * is decided later by shared/studySet.js.
 */

export const PROVIDER_ERROR = Object.freeze({
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  AUTH: 'AUTH_FAILED',
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  UPSTREAM: 'PROVIDER_ERROR',
  NETWORK: 'NETWORK_ERROR',
  ABORTED: 'ABORTED',
});

export class ProviderError extends Error {
  constructor(code, message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * @param {object} config   from loadConfig()
 * @param {Array}  messages chat messages
 * @param {object} opts     { signal } — aborted when the browser disconnects
 * @returns {Promise<{content: string, finishReason: string|null}>}
 */
export async function callChatModel(config, messages, { signal } = {}) {
  // JSON mode makes most providers return syntactically valid JSON.
  // A few models reject the parameter; if so, retry once without it and let
  // our own parser + repair step handle the output.
  try {
    return await requestOnce(config, messages, { signal, jsonMode: true });
  } catch (err) {
    if (err instanceof ProviderError && err.jsonModeRejected) {
      return requestOnce(config, messages, { signal, jsonMode: false });
    }
    throw err;
  }
}

async function requestOnce(config, messages, { signal, jsonMode }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  try {
    const body = { model: config.model, messages };
    if (jsonMode) body.response_format = { type: 'json_object' };

    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
    if (config.provider === 'openrouter') headers['X-Title'] = 'Cue Cards study assistant';

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw httpError(res, detail, jsonMode);
    }

    const data = await res.json().catch(() => null);
    const choice = data?.choices?.[0];
    if (!choice) {
      throw new ProviderError(PROVIDER_ERROR.UPSTREAM, 'The AI provider sent back a response with no answer in it.');
    }
    return {
      content: contentToText(choice.message?.content),
      finishReason: choice.finish_reason ?? null,
    };
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (timedOut) {
      throw new ProviderError(
        PROVIDER_ERROR.TIMEOUT,
        `The AI model took longer than ${Math.round(config.timeoutMs / 1000)} seconds to answer.`,
      );
    }
    if (signal?.aborted) throw new ProviderError(PROVIDER_ERROR.ABORTED, 'Request cancelled.');
    throw new ProviderError(
      PROVIDER_ERROR.NETWORK,
      `Couldn't reach ${config.label}. Check your connection${config.provider === 'ollama' ? ' and that Ollama is running' : ''}.`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

function httpError(res, detail, jsonMode) {
  const status = res.status;
  const snippet = detail.slice(0, 300);

  if (status === 400 && jsonMode && /response_format|json_object|json mode/i.test(detail)) {
    const e = new ProviderError(PROVIDER_ERROR.UPSTREAM, 'JSON mode not supported', { status });
    e.jsonModeRejected = true;
    return e;
  }
  if (status === 401 || status === 403) {
    return new ProviderError(PROVIDER_ERROR.AUTH, 'The AI provider rejected the API key. Check LLM_API_KEY in your .env file.', { status });
  }
  if (status === 404) {
    return new ProviderError(PROVIDER_ERROR.MODEL_NOT_FOUND, 'The configured model was not found. Check LLM_MODEL in your .env file.', { status });
  }
  if (status === 429) {
    const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '', 10);
    return new ProviderError(PROVIDER_ERROR.RATE_LIMITED, 'The AI provider is rate-limiting requests.', {
      status,
      retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
    });
  }
  console.warn(`[llm] HTTP ${status}: ${snippet}`);
  return new ProviderError(PROVIDER_ERROR.UPSTREAM, `The AI provider returned an error (HTTP ${status}).`, { status });
}

/** Some providers return content as an array of parts instead of a string. */
function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join('');
  }
  return '';
}
