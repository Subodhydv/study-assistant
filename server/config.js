import 'dotenv/config';

/**
 * Every supported provider speaks the OpenAI "chat completions" format,
 * so one small client (server/llm.js) covers all of them. Only the base URL,
 * default model and whether a key is required differ.
 *
 * Model IDs change often — override with LLM_MODEL if a default is retired.
 */
export const PROVIDERS = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.8-flash',
    needsKey: true,
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-20b',
    needsKey: true,
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-oss-20b:free',
    needsKey: true,
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.4-nano',
    needsKey: true,
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.2',
    needsKey: false,
  },
};

export function loadConfig(env = process.env) {
  const requested = (env.LLM_PROVIDER || '').trim().toLowerCase();
  const apiKey = (env.LLM_API_KEY || '').trim();
  const timeoutMs = clampInt(env.LLM_TIMEOUT_MS, 30000, 5000, 120000);
  const port = clampInt(env.PORT, 8787, 1, 65535);

  const preset = PROVIDERS[requested];
  const canUseReal = preset && (!preset.needsKey || apiKey);

  if (!canUseReal) {
    // No provider or no key: fall back to the built-in mock so the app always runs.
    let reason = null;
    if (requested && requested !== 'mock') {
      reason = preset
        ? `LLM_API_KEY is not set for "${requested}".`
        : `Unknown LLM_PROVIDER "${requested}".`;
    } else if (!requested) {
      reason = 'No LLM_PROVIDER configured.';
    }
    return { provider: 'mock', label: 'Demo model (offline)', model: 'mock', timeoutMs, port, mockReason: reason };
  }

  return {
    provider: requested,
    label: preset.label,
    baseUrl: (env.LLM_BASE_URL || preset.baseUrl).replace(/\/+$/, ''),
    model: (env.LLM_MODEL || preset.model).trim(),
    apiKey,
    timeoutMs,
    port,
  };
}

function clampInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
