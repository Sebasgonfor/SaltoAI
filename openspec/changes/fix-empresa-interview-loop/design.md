## Context

The empresa interview agent (`/api/entrevista-empresa`) shares architecture with the joven interview (`/api/entrevista`) but diverges in two critical ways that cause an infinite fallback loop. Commit `9f93216` fixed the joven interview by removing `thinkingBudget: 0`, but the empresa route was not updated.

Current failure cascade:
1. `thinkingBudget: 0` disables Gemini 2.5 Flash's reasoning, preventing it from processing the 170-line Spanish system prompt with slot-coverage, anti-redundancy, and ordering rules
2. The model returns JSON with an empty or missing `nextQuestion` field
3. Unlike the joven route (which throws `"empty_next_question"` → routed to deterministic slot-aware fallback), the empresa route silently falls back to a generic string: `"Cuéntame un poco más..."` (line 408)
4. This generic string is appended to the conversation history. On the next turn, the LLM sees an incoherent history where the agent asked a vague non-slot-targeted question, and is even more likely to fail again
5. If an exception occurs, the catch-all at line 442 returns another generic string `"Cuéntame más sobre eso..."` with empty `slotsCovered: []`, further degrading context for the next turn

## Goals / Non-Goals

**Goals:**
- Make the empresa interview Gemini call use default thinking budget (no override), matching the joven route
- Ensure every fallback path produces a slot-targeted question via `fallbackResponse()` or `pickFallbackQuestion()`
- Eliminate all hardcoded generic fallback strings that contaminate conversation history

**Non-Goals:**
- Changing the slot coverage logic, system prompt, or question bank
- Modifying the joven interview route (already fixed)
- Adding new telemetry or monitoring (out of scope for this fix)
- Changing the Gemini model selection (`GEMINI_LITE_MODEL`)

## Decisions

### 1. Remove `thinkingBudget: 0` from the Gemini config

**Rationale**: The joven interview fix in `9f93216` already established that `gemini-2.5-flash` with `thinkingBudget: 0` cannot process the complex slot-coverage prompt. The commit message states: "Without thinking budget, Gemini operates in autocomplete mode and cannot process the complex 170-line Spanish prompt." The empresa interview uses the same model and same complexity of prompt — the same fix applies.

**Alternative considered**: Increasing `thinkingBudget` to a small non-zero value. Rejected because the default (no override) is simpler, consistent with the joven fix, and there's no evidence a custom budget value is needed.

### 2. Throw on empty `nextQuestion` instead of silently falling back

**Rationale**: The joven route pattern (`empty_next_question` thrown at line 136) works well: it propagates to the retry logic, which on second failure routes to the deterministic `pickFallbackQuestion()` that targets a specific pending slot. Copying this pattern to the empresa route ensures the fallback always advances the interview.

**Alternative considered**: Inline fallback to `pickFallbackQuestion()` inside the success path. Rejected because it duplicates the retry/fallback logic already present in the catch blocks.

### 3. Replace catch-all exception handler with `fallbackResponse(messages)`

**Rationale**: The current handler at line 442 returns a hardcoded string with `slotsCovered: []` — losing all slot detection context. Using `fallbackResponse()` preserves the deterministic slot-tracking state and produces a meaningful next question.

## Risks / Trade-offs

- **[Risk] Default thinking budget increases latency** → Mitigation: The joven interview already runs with default thinking and has shown acceptable latency. The `GEMINI_TIMEOUT_MS = 10_000` is unchanged.
- **[Risk] Default thinking budget increases token consumption** → Mitigation: The interview is capped at 6 turns per founder (short-lived session). Token cost increase is negligible.
- **[Trade-off] `empty_next_question` throw prevents graceful degradation to partial LLM output** → Acceptable: an empty `nextQuestion` is useless — better to fall back to deterministic logic that produces a valid slot-targeted question.
