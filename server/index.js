import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config);

app.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
  if (config.provider === 'mock') {
    console.log(`[api] DEMO MODE: using the offline mock model. ${config.mockReason ?? ''}`);
    console.log('[api] Add LLM_PROVIDER and LLM_API_KEY to .env to use a real model (see .env.example).');
  } else {
    console.log(`[api] provider: ${config.label} · model: ${config.model}`);
  }
});
