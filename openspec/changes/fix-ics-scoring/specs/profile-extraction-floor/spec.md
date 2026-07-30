## ADDED Requirements

### Requirement: Minimum profile content for scoring
The profile extraction pipeline SHALL guarantee that every profile used for ICS matching has at least 3 skills and 2 evidence items.

#### Scenario: LLM extraction produces rich profile
- **WHEN** the LLM extracts ≥3 skills and ≥2 evidence items from the interview transcript
- **THEN** the profile passes the floor check AND no fallback intervention occurs

#### Scenario: LLM extraction produces thin profile
- **WHEN** the LLM extracts <3 skills or <2 evidence items
- **THEN** the pipeline SHALL merge the LLM output with `heuristicExtraction()` results to reach the minimum threshold

#### Scenario: Heuristic extraction floor
- **WHEN** `heuristicExtraction()` regex signal detection produces <3 skills or <2 evidence items
- **THEN** the function SHALL generate additional generic-but-useful skills from the transcript text content until the minimum threshold is met

### Requirement: Pre-scoring validation warning
Before a profile is scored in the ICS pipeline, the system SHALL check that the profile meets the minimum content threshold and log a warning if it does not.

#### Scenario: Profile below threshold reaches scorer
- **WHEN** a profile with <3 skills or <2 evidence items is submitted to `scoreCandidates()`
- **THEN** the system SHALL still score it (graceful degradation) but SHALL log a `warn`-level message with the profile ID and the deficiency

#### Scenario: Profile meets threshold
- **WHEN** a profile with ≥3 skills and ≥2 evidence items is submitted to `scoreCandidates()`
- **THEN** no warning SHALL be logged regarding content threshold
