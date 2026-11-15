/**
 * Plain-language copy for every error code the server or client can produce.
 * The technical message is still shown underneath as detail.
 */
const COPY = {
  TIMEOUT: {
    title: 'The model took too long to answer',
    hint: 'Try again. Shorter notes or fewer cards also make it faster.',
  },
  RATE_LIMITED: {
    title: 'Too many requests right now',
    hint: 'The AI provider asked us to slow down. Wait a moment, then try again.',
  },
  MALFORMED_JSON: {
    title: "The model's answer couldn't be read",
    hint: 'It replied in a broken format, and its second attempt was broken too. Trying again usually works.',
  },
  WRONG_SHAPE: {
    title: "The model's answer wasn't usable",
    hint: "It replied, but not with flashcards and questions, even after we asked it to fix that. Trying again usually works.",
  },
  EMPTY_OUTPUT: {
    title: 'The model sent back nothing',
    hint: 'Try again. If it keeps happening, rephrase your notes or pick a different topic.',
  },
  MODEL_DECLINED: {
    title: "There's nothing to study in that text",
    hint: 'Paste some notes or name a topic, then make cards again.',
  },
  AUTH_FAILED: {
    title: "The server's AI key was rejected",
    hint: 'Check LLM_API_KEY in the .env file, then restart the server.',
  },
  MODEL_NOT_FOUND: {
    title: "The server's AI model wasn't found",
    hint: 'Check LLM_MODEL in the .env file, then restart the server.',
  },
  NETWORK_ERROR: {
    title: "Couldn't connect",
    hint: 'Check your internet connection and that the app server is running, then try again.',
  },
  SERVER_UNREACHABLE: {
    title: "The app server isn't responding",
    hint: 'Make sure `npm start` is running in your terminal, then try again.',
  },
  PROVIDER_ERROR: {
    title: 'The AI provider had a problem',
    hint: 'This is usually temporary. Try again in a moment.',
  },
  INVALID_REQUEST: {
    title: "That request couldn't be sent",
    hint: '',
  },
};

export function describeError(error) {
  const copy = COPY[error?.code] ?? {
    title: 'Something went wrong',
    hint: 'Try again.',
  };
  let hint = copy.hint;
  if (error?.code === 'RATE_LIMITED' && error.retryAfter) {
    hint = `The AI provider asked us to wait ${error.retryAfter} seconds before trying again.`;
  }
  return {
    title: copy.title,
    hint,
    detail: error?.message ?? '',
    retryable: error?.retryable !== false,
  };
}
