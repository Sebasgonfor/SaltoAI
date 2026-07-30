## Why

The ICS (Índice de Compatibilidad Salto) scoring engine produces scores that empirically cap at ~44% even for perfectly matched candidate-need pairs. This is caused by three compounding issues: the heuristic fallback scorer uses binary floors for `contextFit` (max 65) and `learningSignal` (70 or 40), penalties subtract directly without weighting, and `heuristicScore()` entirely ignores the job nature classification (cuantitativa/cualitativa/mixta). The pipeline upstream — `sanitizeEvidenceForCv()` and `filterRealSkills()` — can also mutilate extracted profiles before they reach the scorer, producing profiles with only 2 generic skills. The result is a scoring system that cannot distinguish a perfect match from a mediocre one, making the core demo feature (the matching engine) unreliable for the pitch.

## What Changes

- Fix `heuristicScore()` in `lib/ics.ts` to produce dynamic sub-scores that respect job nature instead of binary floors
- Make penalties weighted in `computeICS()` — a 30-point penalty should not deduct 30 raw points from the final ICS
- Fix the heuristic fallback to adapt `learningSignal` and `contextFit` based on actual match quality and job nature
- Add a pre-scoring validation that warns or prevents scoring when profiles have fewer than 3 skills or 2 evidence items
- Relax `filterRealSkills()` to stop removing legitimate skills that happen to match job title prefixes (e.g., "Atención al Cliente" is both a skill and could be a role prefix but shouldn't be filtered)
- Update `sanitizeEvidenceForCv()` to not reject evidence that starts with common Spanish reporting verbs when they're describing competencies (e.g., "Gestionó mensajes de clientes" should pass, "Contó que gestionaba" should still be rejected)
- Update the smoke test to pass required `ownerUid` parameter and validate ICS >= 80 consistently

## Capabilities

### New Capabilities

- `ics-heuristic-calibration`: Heuristic ICS scoring that produces dynamic, job-nature-aware sub-scores instead of binary floors
- `ics-weighted-penalties`: Penalties in the ICS formula are multiplied by a configurable factor instead of subtracting directly
- `profile-extraction-floor`: Profile extraction guarantees a minimum of 3 skills and 2 evidence items before allowing scoring
- `skill-filter-precision`: `filterRealSkills()` correctly distinguishes job titles from legitimate skill names

### Modified Capabilities

_None — all specs are new for this change._

## Impact

- `lib/ics.ts` — `heuristicScore()` and `computeICS()` functions
- `lib/skill-classification.ts` — `filterRealSkills()` and `isJobTitle()` 
- `lib/cv-evidence.ts` — `sanitizeEvidenceForCv()` and `polishExperienceQuote()`
- `app/api/perfil/route.ts` — extraction pipeline, profile floor enforcement
- `scripts/smoke.sh` — smoke test fixes (ownerUid, ICS threshold validation)
- `lib/types.ts` — ICS_WEIGHTS_BY_NATURE (may need weight adjustments as part of calibration)
