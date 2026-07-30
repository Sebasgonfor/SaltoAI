## 1. Remove thinkingBudget override

- [x] 1.1 In `app/api/entrevista-empresa/route.ts`, remove `thinkingConfig: { thinkingBudget: 0 }` from the Gemini `config` object (lines 356-358). Keep `responseMimeType` and `responseSchema` unchanged. This lets `gemini-2.5-flash` use its default thinking budget, matching the joven interview fix from `9f93216`.

## 2. Throw on empty nextQuestion

- [x] 2.1 After `JSON.parse(response.text || "{}")` (line 393), add validation: if `parsed.nextQuestion` is not a non-empty string, throw `new Error("empty_next_question")`. Remove the `|| "Cuéntame un poco más..."` fallback at lines 406-414 and restructure the output object to assume valid `parsed.nextQuestion`.

- [x] 2.2 In the Gemini retry/catch block (lines 365-391), add `"empty_next_question"` to the transient error check so it triggers the retry path already present for timeouts. On the second failure, it falls through to the existing `fallbackResponse()` logic.

## 3. Fix exception catch-all

- [x] 3.1 Replace the hardcoded fallback at lines 439-446 with a call to `fallbackResponse(messages)`, which returns proper `slotsCovered`, `targetedSlot`, and a slot-aware question. Remove the generic string `"Cuéntame más sobre eso, ¿puedes darme un ejemplo concreto?"`.

## 4. Verify

- [x] 4.1 Run `npx tsc --noEmit` to confirm no TypeScript errors.

- [x] 4.2 Manually verify via Vercel deploy: start an empresa interview, respond to the opening question, and confirm the agent advances to the next slot (tareas_del_rol) instead of looping with a generic fallback phrase.
