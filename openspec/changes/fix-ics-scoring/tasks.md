## 1. Fix heuristicScore() — contextFit and learningSignal

- [x] 1.1 Replace binary `contextFit` (65|45) with keyword-based dynamic scoring in `lib/ics.ts` `heuristicScore()` using context-keyword matching against profile traits and summary
- [x] 1.2 Add `CONTEXT_KEYWORDS` constant: caos/multitarea/rápido → ["Tolerancia al caos", "Adaptabilidad"], orden/metódico → ["Detallista", "Meticulosidad", "Organización"], finanzas/reportes → ["Responsable", "Método"]
- [x] 1.3 Replace binary `learningSignal` (70|40) with multi-factor scoring: count learning terms (aprendió, autodidacta, tutorial, YouTube) + tool mentions (Excel, Canva, etc.) → score 25-95
- [x] 1.4 Adapt `learningSignal` scoring to `jobNature`: cuantitativa roles get higher range (25-95) for scrappy initiative; cualitativa roles get 30-85 for consistency/diligence
- [x] 1.5 Add jobNature awareness to `heuristicScore()`: cuantitativa applies 1.1x bonus to skillsFit/learningSignal when metrics present; cualitativa does NOT penalize lack of metrics

## 2. Fix computeICS() — weighted penalties

- [x] 2.1 Add `PENALTY_DAMPING_FACTOR = 0.4` constant to `lib/ics.ts` near the top with explanation comment
- [x] 2.2 Update `computeICS()` formula: `raw = sum - (penalties * PENALTY_DAMPING_FACTOR)` instead of `raw = sum - penalties`
- [x] 2.3 Verify `clamp()` still produces values in [0, 100] range with damped penalties

## 3. Fix skill classification — filterRealSkills and isJobTitle

- [x] 3.1 Add `COMPETENCY_TERMS` constant to `lib/skill-classification.ts`: gestión, manejo, atención, ventas, diseño, desarrollo, contenido, marketing, campañas, clientes, logística, operaciones
- [x] 3.2 Update `isJobTitle()` to check: if string starts with a job title prefix AND the remainder contains competency terms → return `false` (it's a skill, not a job title)
- [x] 3.3 Change `isJobTitle()` from `startsWith(prefix + " ")` to exact prefix matching with competency-term guard

## 4. Fix profile extraction floor

- [x] 4.1 Update `heuristicExtraction()` in `lib/heuristic-profile.ts` to guarantee ≥3 skills in output: if regex detection produces <3 skills, generate additional skills from transcript noun/verb extraction
- [x] 4.2 Ensure `heuristicExtraction()` guarantees ≥2 evidence items in output: if <2, add generic-but-transcript-anchored evidence
- [x] 4.3 Add warning log in perfil route when a profile hits the extraction floor (<3 skills or <2 evidence after all merge/fallback steps)

## 5. Fix smoke test

- [x] 5.1 Add `ownerUid` field to the smoke test's `NEED_BODY` JSON in `scripts/smoke.sh` (use a dummy uid like `"smoke_test_uid"`)
- [x] 5.2 Verify smoke test ICS assertion: confirm `MIN_ICS=80` threshold is achievable with the fixed scoring
- [x] 5.3 Run smoke test via standalone script — Camila ↔ Arepas ICS = 91%

## 6. Verify end-to-end

- [x] 6.1 Standalone test: Camila ↔ Arepas ICS 91% ≥ 80 ✓
- [x] 6.2 Test with heuristic-only path — standalone test runs without Gemini dependency ✓
- [ ] 6.3 Test with `hasGeminiKey() === true` (LLM path) to ensure the fix doesn't break batch ranking
- [x] 6.4 TypeScript compiles clean (no new errors)
