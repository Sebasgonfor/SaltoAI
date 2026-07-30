## Context

The ICS (Índice de Compatibilidad Salto) scoring engine produces empirically-capped scores of ~44% even for perfectly matched candidate-need pairs. The root cause spans three layers:

1. **Scoring layer** (`heuristicScore()` in `lib/ics.ts`): `contextFit` is binary (65 or 45), `learningSignal` is binary (70 or 40), and neither adapts to `jobNature`. The heuristic also ignores the need's context text entirely — it only checks whether ANY trait matched.

2. **Formula layer** (`computeICS()` in `lib/ics.ts`): Penalties subtract directly from the weighted sum (0-100 range) without any damping factor. A single "clearly violated" hard constraint can deduct 30+ points.

3. **Extraction layer** (`lib/skill-classification.ts`, `lib/cv-evidence.ts`, `app/api/perfil/route.ts`): `filterRealSkills()` removes legitimate skills matching job title prefixes (e.g., pattern `asistente de` nukes any skill containing those words). `sanitizeEvidenceForCv()` rejects evidence that starts with Spanish reporting verbs via `META_EVIDENCE` regex. The extraction floor produces profiles with only 2 generic skills when the LLM fails.

The system is a Next.js app with Firebase/Firestore persistence. The ICS pipeline: shortlist by cosine similarity → LLM batch ranking (Gemini) or heuristic fallback → weighted formula → feedback delta. The heuristic path is the critical fallback — it activates when Gemini is unavailable, rate-limited, or times out.

## Goals / Non-Goals

**Goals:**
- Make `heuristicScore()` produce dynamic sub-scores that reflect actual match quality instead of binary floors
- Make `heuristicScore()` adapt `learningSignal` and `contextFit` based on `jobNature` (cuantitativa/cualitativa/mixta)
- Weight penalties in `computeICS()` with a damping factor (0.4) so a 30-point penalty deducts 12 points instead of 30
- Ensure profiles extracted from interviews always have ≥3 skills and ≥2 evidence items before scoring
- Relax `filterRealSkills()` to stop removing skills that partially match job title prefixes
- Update smoke test to pass `ownerUid` and validate ICS ≥ 80

**Non-Goals:**
- Changing the LLM batch ranking prompt or Gemini integration
- Modifying the ICS weights (`ICS_WEIGHTS_BY_NATURE`) — weights are calibrated separately
- Adding new dimensions to the ICS breakdown (the 4D model stays)
- Modifying the feedback delta system
- Changing the cosine similarity shortlisting algorithm

## Decisions

### Decision 1: `contextFit` becomes a real function instead of binary floor

**Chosen approach:** Compute `contextFit` from the semantic overlap between the need's `context` field text and the profile's `summary` + `traits`. Use keyword density scoring: count context-relevant keywords (caos, multitarea, rápido, protocolos, orden, finanzas, etc.) and check how many align with profile traits.

**Score range:** 20-100 (was 45-65). Floor of 20 for no matches, ceiling of 100 for strong alignment.

**Rationale:** The `context` field is the most underused signal in the heuristic. It contains operational descriptors that should inform how well a candidate fits the work environment. Currently it's entirely ignored — only trait count matters.

**Alternative considered:** Scoring via cosine similarity between context text and summary text. Rejected: adds latency, requires embedding call, defeats purpose of heuristic (fast fallback).

### Decision 2: `learningSignal` becomes a gradient instead of binary

**Chosen approach:** Replace the single regex check with a scoring function that evaluates:
- Presence of learning-related terms (autodidacta, aprendió, tutorial, YouTube, por su cuenta) → +25 points each, capped
- Presence of tool names in evidence (Excel, Canva, Power BI) → bonus for demonstrable technical learning
- Job nature adaptation: cuantitativa roles weigh initiative/scrappiness (~25-90 range), cualitativa roles weigh consistency/execution quality (~40-85 range)

**Score range:** 25-95 (was 40-70).

**Rationale:** The current binary regex doesn't capture the quality of learning evidence. Someone who "aprendió Excel con YouTube para armar un sistema de pedidos" should score MUCH higher than someone who says "aprendí" once without context.

**Alternative considered:** LLM-based learning signal scoring. Rejected: heuristic must work without LLM.

### Decision 3: Penalties weighted with damping factor

**Chosen approach:** `penalties` multiplied by `0.4` in `computeICS()`. A `penalties=30` becomes an effective deduction of 12 points instead of 30.

**Rationale:** The current formula `sum - penalties` treats penalties as a 1:1 deduction on a 0-100 scale. This means a single hard constraint violation can obliterate the score. The damping factor preserves the signal value of penalties while preventing them from dominating the final ICS.

**Alternative considered:** Adding a 5th weight `wPenalty` to `ICS_WEIGHTS_BY_NATURE`. Rejected: adds complexity without clear benefit — a single damping factor is simpler and serves the same purpose.

### Decision 4: Extraction floor via guard in `heuristicExtraction()`

**Chosen approach:** Modify `heuristicExtraction()` to guarantee ≥3 skills and ≥2 evidence items even when no signals match. If the regex-based signal detection produces <3 skills, generate additional generic-but-useful skills from the transcript text (e.g., extract key nouns/verbs and map to common labor market skills). The per-profile route already has a final fallback — enhance it to log a warning when profiles hit the floor.

**Rationale:** A profile with 2 skills and 1 evidence item mathematically cannot reach ICS > 44% regardless of scoring quality. Ensuring a minimum content threshold at extraction time is the cheapest fix with highest ROI.

### Decision 5: `filterRealSkills()` prefix matching refined

**Chosen approach:** Change `isJobTitle()` from prefix matching to exact phrase matching. "Atención al Cliente" is a skill, not a job title. Only remove strings that EXACTLY match or START WITH a job title prefix AND contain no additional competency words.

**New rule:** `startsWith(prefix + " ")` but also require the remainder to NOT contain skill-indicating terms (gestión, manejo, atención, ventas, diseño, etc.).

**Rationale:** The current `n.startsWith(t + " ")` is too aggressive. "Asistente de marketing digital que gestionaba campañas" gets nuked because it starts with "asistente de". The refined check preserves skills that are described as job functions rather than formal titles.

## Risks / Trade-offs

- **[Risk] Heuristic `contextFit` keyword scoring is language-dependent** → Mitigation: keywords are Spanish-only (the app is LATAM-focused). Document the keyword list in the code for future localization.
- **[Risk] Relaxed `filterRealSkills()` might let some job titles through** → Mitigation: the "real" matching is done by the LLM path. The heuristic is a floor. A few false-positive skills in the heuristic path won't break the demo.
- **[Risk] Extraction floor may produce duplicate/redundant skills** → Mitigation: `heuristicExtraction()` already deduplicates via `new Set()`. The 3-skill guarantee uses the last-resort fallback, which runs AFTER deduplication.
- **[Risk] Penalty damping might hide real dealbreaker mismatches** → Trade-off accepted: the ICS is a prioritization signal, not a hiring decision. Red flags are shown separately in the UI. A dampened penalty preserves the ranking without masking the flag.
