# Cue Cards: a study assistant

Paste your notes, or just name a topic. An LLM turns it into **flashcards** and a **multiple-choice quiz**, and the app lets you study them: flip through cards, mark what you know, take the quiz, and retest only the questions you got wrong.

The model never talks to the user directly. It returns JSON, which is parsed, validated and normalised before anything is rendered. Most of the work in this project went into what happens when that JSON is wrong.

> **Screen recording:** [Watch demo on Google Drive](https://drive.google.com/file/d/1LPmQw14Wackbs-rRxr9Ll1ycou2dk_Qs/view?usp=sharing)

---

## Run it

Requires **Node 22.12 or newer**.

```bash
npm install && npm start
```

Open http://localhost:5173.

`npm start` runs two processes:

| Process | Port | What it does |
|---|---|---|
| `api` (Express) | 8787 | Holds the API key and calls the model |
| `web` (Vite + React) | 5173 | The app. Requests to `/api` are proxied to the API server |

### Works without an API key

With no `.env`, the server starts in **demo mode**, using an offline stand-in model (`server/mock.js`). The whole pipeline still runs (parsing, validation, the repair retry, error mapping), so you can try the app and every failure path straight after `npm install`. A banner in the app says when demo mode is on.

### Use a real model

```bash
cp .env.example .env
```

Then set one provider:

```ini
LLM_PROVIDER=gemini        # gemini | groq | openrouter | openai | ollama
LLM_API_KEY=your-key-here  # not needed for ollama
# LLM_MODEL=...            # optional override
```

| Provider | Default model | Free tier | Key from |
|---|---|---|---|
| `gemini` | `gemini-3.8-flash` | Yes | https://aistudio.google.com/apikey |
| `groq` | `openai/gpt-oss-20b` | Yes | https://console.groq.com/keys |
| `openrouter` | `openai/gpt-oss-20b:free` | Yes | https://openrouter.ai/keys |
| `openai` | `gpt-5.4-nano` | No | https://platform.openai.com/api-keys |
| `ollama` | `llama3.2` | Local | Run `ollama pull llama3.2` first |

All five expose an OpenAI-compatible `/chat/completions` endpoint, so one small client (`server/llm.js`) covers them all. Model names change often; if a default has been retired, set `LLM_MODEL`.

Restart `npm start` after editing `.env`.

### Other scripts

```bash
npm test            # 60 tests: parser, repair loop, provider errors, API, race handling, UI
npm run build       # production build into dist/
npm run server:prod # serves dist/ and the API from one port (8787)
```

---

## Using the app

1. **Write or paste** notes, or a topic. Pick how many cards and the difficulty. Press **Make cards** (or Ctrl/Cmd + Enter).
2. **Flashcards:** tap the card (or press Space) to flip. Mark each card **Still learning** (1) or **Got it** (2). Arrow keys or swipe to move. At the end you can review only the cards you're still learning.
3. **Quiz:** answer with a click, 1–4 or A–D. You see right or wrong and why straight away. Results list every question; **Retest the N you missed** starts a round with only those, shuffled.
4. **Change this set:** type a follow-up like "add questions about dates" or pick a suggestion. The model edits the existing set instead of starting again. **Undo change** reverts it.
5. **Saved sets:** every set is saved in the browser automatically. Reloading the page reopens the last one.
6. **Dark mode:** the moon/sun button. It follows your system setting until you choose.

---

## How bad AI output is handled

The model's reply goes through four layers. Each one either fixes the problem or turns it into a clear message for the user.

```
model reply ──► extractJson ──► normalizeStudySet ──► (repair once) ──► client re-validates ──► UI
                 (text→JSON)      (JSON→trusted set)     server            browser
```

**1. Asking for the right thing** (`server/prompts.js`). The system prompt gives the exact JSON shape and rules, and JSON mode (`response_format: json_object`) is turned on. If a provider rejects JSON mode, the request is retried once without it. The notes are wrapped in `<material>` tags, and the model is told to treat them as content, not instructions. If there's nothing to study, it may reply `{"error": "..."}` instead of inventing content.

**2. Parsing** (`shared/studySet.js → extractJson`). This copes with what models actually send: code fences, chatter before or after the JSON, `<think>` blocks from reasoning models, trailing commas and smart quotes. Empty and unparseable replies get different error codes.

**3. Validating and normalising** (`normalizeStudySet`). Forgiving about naming, strict about meaning:
- Accepts aliases (`cards`/`flashcards`, `choices`/`options`, `term`/`definition`) and wrappers (`{ "data": {...} }`, bare arrays).
- Finds the correct answer whether it's given as an index, a letter (`"C"`, `"b)"`), the option text, or a lettered object (`{"A": ..., "B": ...}`). If `"answer": 4` matches an option's text, it's treated as text, not an index.
- Works out the answer before removing duplicate options, so removing a duplicate can't move the answer to the wrong option.
- Drops anything it can't trust: a missing answer, an answer index out of range, fewer than 2 or more than 6 options, empty fields, or a duplicate. It never guesses a correct answer.
- Caps counts and text length. Returns **warnings** (shown in the UI) about what was dropped, so a partly-bad reply still gives a usable set.
- If nothing usable is left, it throws `EMPTY_OUTPUT`, `WRONG_SHAPE` or `MODEL_DECLINED`.

**4. One repair attempt** (`server/generate.js`). If the reply is unusable, the server sends it back to the model with the specific problem ("wasn't valid JSON", "was cut off, use fewer items") and asks again, **once**. If that fails too, the user gets a clear error with a **Try again** button. Transport errors (timeout, 429, 500) are not retried automatically: the user decides.

The **browser validates again** with the same shared code (`src/api/client.js`), so a buggy or replaced server can't crash the UI. Sets loaded from `localStorage` are re-validated too; corrupted storage is skipped, not fatal.

### Slow, failed and stale requests

| Situation | What happens |
|---|---|
| Slow | Skeleton cards, a live seconds counter, a "taking longer than usual" note after 12 s, and a **Cancel** button |
| Too slow | Server times out each model call (30 s, configurable); browser gives up after 75 s. Both report `TIMEOUT` |
| User submits again while waiting | Previous request is **aborted**. The server notices the browser disconnected and aborts its call to the model too |
| Old response arrives late anyway | Ignored. Every request has an id, and only the latest id may update state (`src/hooks/useStudyRequest.js`) |
| Refine fails | The current set stays exactly as it was, with an inline error and **Try again** |
| 429 rate limit | Message includes the provider's `Retry-After` time |
| Bad key / unknown model | Says which `.env` setting to fix; no retry button, because retrying won't help |
| Server not running | "Make sure `npm start` is running" |
| Unexpected server error | Generic message; internal details stay in the server log |

### Try each failure on purpose

In demo mode, add a tag to your notes (or to a "Change this set" request). The app's empty screen also lists them under "Test how the app handles a bad answer from the model".

| Tag | Stand-in model does |
|---|---|
| `#malformed` | Broken JSON twice, so the repair step also fails |
| `#malformed-once` | Broken JSON, then a valid repair |
| `#wrongshape` | Valid JSON in the wrong structure |
| `#partial` | Some items incomplete; they're dropped with a warning |
| `#empty` | Empty reply |
| `#decline` | `{"error": ...}`: nothing to study |
| `#slow` | Correct answer after 8 s. Submit again meanwhile to see the stale response ignored |
| `#timeout` | Never answers in time |
| `#ratelimit` | HTTP 429 with Retry-After |
| `#fail` | HTTP 500 |

---

## Project structure

```
shared/studySet.js        Parse + validate model output. Used by server AND browser
server/
  index.js                Starts the API
  app.js                  Express routes, error → HTTP status mapping, serves dist/ in production
  config.js               Provider presets, reads .env, falls back to demo mode
  llm.js                  fetch-based OpenAI-compatible client: timeout, abort, error codes
  prompts.js              System prompt, create/refine/repair messages
  generate.js             Request validation + "call, validate, repair once" pipeline
  mock.js                 Offline stand-in model with failure scenarios
src/
  App.jsx                 Top-level state: current set, composing vs studying, refine/undo
  api/client.js           POST /api/generate with timeout, cancellation, re-validation
  hooks/useStudyRequest.js  Request lifecycle and stale-response protection
  hooks/useSessions.js    Saved sets in localStorage
  hooks/useTheme.js, useHealth.js
  lib/errors.js           Error code → plain-language title and hint
  lib/storage.js          Safe localStorage access with validation
  components/             Composer, Flashcards, Quiz, StudyView, RefineBar, LoadingState,
                          ErrorState, EmptyState, SessionsDrawer, ...
tests/                    Vitest + Testing Library + supertest
```

### Decisions worth explaining

- **No AI SDK.** The model call is about 100 lines of `fetch`, so every failure mode is visible and testable. JSON mode is the only "structured output" feature used, and it's optional, because the validator is the real safety net.
- **The API key never reaches the browser.** The browser only calls `/api/*`. `/api/health` reports the provider and model, never the key (there's a test for this).
- **One validator, two places.** `shared/studySet.js` runs on the server, so it can ask the model for a repair, and in the browser, so it never renders unchecked data.
- **Stale-response protection has two layers.** Aborting is a courtesy that saves tokens; the request-id check is the guarantee.
- **The quiz never guesses.** A question with an unclear answer is dropped and reported. A wrong "correct answer" would be worse than a missing question.
- **Refine sends the whole current set and asks for the whole updated set back.** It's simple and robust, and the result goes through the same validation as a new set.
- **State.** Request lifecycle lives in a hook. Saved sets live in `useSessions`. Study progress (marks, quiz round) is local to the `Flashcards` and `Quiz` components, which are keyed by set version, so a refine or undo resets progress cleanly.

### Accessibility and mobile

Single-column layout from 320 px up, touch-sized controls, and swipe on cards. Keyboard support covers the whole flow, with visible focus rings. Tabs use the ARIA tab pattern with arrow keys. Errors take focus and use `role="alert"`. Flipped cards announce their answer. `prefers-reduced-motion` is respected, and the colour palette works in light and dark themes.

---

## Known limitations

- **No streaming.** The whole set arrives at once. Streaming partial JSON would mean validating incomplete data; I chose a reliable all-at-once flow with a clear loading state.
- **Refining resets study progress** for that set (card marks and quiz rounds), because items may have changed.
- **Progress isn't saved.** Sets are saved; card marks and quiz scores are not.
- **Storage is local to one browser.** No accounts or sync. Up to 20 sets are kept.
- **No rate limiting on the API server.** It's fine locally; a public deployment would need it.
- **Quiz is multiple choice only.** No free-text answers or other block types.
- **Model quality varies.** Validation catches broken structure, but it can't check whether a fact is true. A confident wrong "correct answer" from the model will be shown.
- **The demo model is crude.** It makes fill-in-the-blank cards from your sentences. It exists to show the pipeline and failure handling, not to teach.
- **Default model names will age.** Override with `LLM_MODEL`.

### What I'd do next

Stream the result as it generates (streaming JSON with partial validation), save study progress with each set, add spaced-repetition scheduling for "still learning" cards, let users edit a card by hand, and deploy with a small per-IP rate limit.

---

## AI usage

I used **Claude (Anthropic)** to generate most of this project from the assignment brief: the initial code, tests, styles and this README. That includes the parsing and validation approach, the repair-once pipeline, the stale-request hook and the mock failure scenarios. The commit history includes `Co-Authored-By: Claude` lines for that reason.

I then ran the app end-to-end with a real Gemini provider, tested all flows in the browser (flashcards, quiz, retest, refinement, session saving), and verified it on mobile. I debugged and resolved a 503 error caused by `gemini-3.8-flash` being under high demand, and a 429 quota exhaustion on `gemini-2.5-flash`, ultimately switching to `gemini-3.5-flash-lite` as the working model. I also reviewed every source file to understand the architecture before the interview.

## Time spent

~5 hours total: reviewing the codebase and architecture (~1.5 h), running and testing the app with a real provider and on mobile (~2 h), debugging the API provider issues (~1 h), and final review of README and submission prep (~0.5 h).
