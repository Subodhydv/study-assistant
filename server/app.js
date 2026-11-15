import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTPUT_ERROR, OutputError } from '../shared/studySet.js';
import { RequestError, generateStudySet, parseRequest } from './generate.js';
import { PROVIDER_ERROR, ProviderError, callChatModel } from './llm.js';
import { MOCK_SCENARIOS, callMockModel } from './mock.js';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

/** How each failure is reported to the browser. */
const HTTP_STATUS = {
  INVALID_REQUEST: 400,
  [OUTPUT_ERROR.DECLINED]: 422,
  [OUTPUT_ERROR.EMPTY]: 502,
  [OUTPUT_ERROR.MALFORMED]: 502,
  [OUTPUT_ERROR.SHAPE]: 502,
  [PROVIDER_ERROR.RATE_LIMITED]: 429,
  [PROVIDER_ERROR.TIMEOUT]: 504,
  [PROVIDER_ERROR.AUTH]: 502,
  [PROVIDER_ERROR.MODEL_NOT_FOUND]: 502,
  [PROVIDER_ERROR.NETWORK]: 502,
  [PROVIDER_ERROR.UPSTREAM]: 502,
};

/** Errors where trying the same request again won't help. */
const NOT_RETRYABLE = new Set([
  'INVALID_REQUEST',
  OUTPUT_ERROR.DECLINED,
  PROVIDER_ERROR.AUTH,
  PROVIDER_ERROR.MODEL_NOT_FOUND,
]);

export function createApp(config, { callModel } = {}) {
  const app = express();
  const model = callModel ?? (config.provider === 'mock' ? callMockModel : callChatModel);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      provider: config.provider,
      label: config.label,
      model: config.model,
      demo: config.provider === 'mock',
      demoReason: config.mockReason ?? null,
      scenarios: config.provider === 'mock' ? MOCK_SCENARIOS : undefined,
    });
  });

  app.post('/api/generate', async (req, res) => {
    // If the browser cancels (new request, Cancel button, tab closed),
    // stop waiting on the model too so we don't burn tokens for nothing.
    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    try {
      const request = parseRequest(req.body);
      const result = await generateStudySet(request, {
        config,
        callModel: model,
        signal: controller.signal,
      });
      res.json(result);
    } catch (err) {
      if (controller.signal.aborted) return; // nobody is listening any more
      sendError(res, err);
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
  });

  // Production: serve the built React app from the same server.
  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  }

  // Malformed JSON bodies and anything unexpected.
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') {
      return sendError(res, new RequestError('Request body is not valid JSON.'));
    }
    if (err?.type === 'entity.too.large') {
      return sendError(res, new RequestError('Request is too large.'));
    }
    return sendError(res, err);
  });

  return app;
}

function sendError(res, err) {
  const known =
    err instanceof RequestError || err instanceof OutputError || err instanceof ProviderError;
  const code = known ? err.code : 'INTERNAL_ERROR';
  const status = HTTP_STATUS[code] ?? 500;
  if (!known) console.error('[api] unexpected error', err);

  const body = {
    error: {
      code,
      message: known ? err.message : 'Something went wrong on the server.',
      retryable: !NOT_RETRYABLE.has(code),
    },
  };
  if (err?.retryAfter) {
    body.error.retryAfter = err.retryAfter;
    res.set('Retry-After', String(err.retryAfter));
  }
  res.status(status).json(body);
}
