## Why

The empresa interview agent (`/api/entrevista-empresa`) enters an infinite fallback loop after the founder's first response: it repeatedly asks "Cuéntame más sobre eso, ¿puedes darme un ejemplo concreto?" instead of advancing through the 5-slot interview. The fix for the joven interview (`/api/entrevista`) in commit `9f93216` correctly identified `thinkingBudget: 0` as the root cause — without thinking, Gemini 2.5 Flash cannot process the complex slot-coverage prompt and returns empty or malformed JSON — but that fix only touched `app/api/entrevista/route.ts`, leaving `app/api/entrevista-empresa/route.ts` with the same bug plus a worse fallback mechanism.

## What Changes

- Remove `thinkingConfig: { thinkingBudget: 0 }` from the Gemini call in `/api/entrevista-empresa`, letting Gemini use its default thinking budget (same fix already applied to the joven interview)
- Align the empty `nextQuestion` handling with the joven interview pattern: throw `"empty_next_question"` so the retry/catch flow routes to the deterministic slot-aware fallback instead of injecting a generic string into conversation history
- Replace the catch-all exception handler's hardcoded fallback string with `fallbackResponse(messages)` so even unexpected errors produce a slot-targeted question

## Capabilities

### New Capabilities

- `empresa-interview-fallback`: The empresa interview API must never inject generic, non-slot-aware fallback messages into the conversation. All fallback paths (empty LLM response, exceptions) must route through the deterministic `fallbackResponse()` which picks a question for the next pending slot.
- `empresa-interview-thinking`: The empresa interview Gemini call must use the default thinking budget (no override), consistent with the joven interview fix in `9f93216`.

### Modified Capabilities

_None — existing spec-level behavior is unchanged. This is a bug fix._

## Impact

- `app/api/entrevista-empresa/route.ts` — Gemini config (remove `thinkingConfig`), `nextQuestion` validation (add empty check + throw), exception handler (use `fallbackResponse`)
