## ADDED Requirements

### Requirement: Weighted penalty deduction
The `computeICS()` function SHALL multiply the `penalties` value by a damping factor of `0.4` before subtracting from the weighted sum, instead of subtracting it directly.

#### Scenario: Moderate penalty with damping
- **WHEN** breakdown has `penalties = 30` AND the weighted sub-score sum is 85
- **THEN** the effective deduction SHALL be `30 * 0.4 = 12` AND the final ICS SHALL be `85 - 12 = 73`

#### Scenario: Zero penalties unaffected
- **WHEN** breakdown has `penalties = 0`
- **THEN** the final ICS SHALL be identical to the weighted sub-score sum (no change from damping)

#### Scenario: Maximum penalty dampened
- **WHEN** breakdown has `penalties = 100` (blocking hard constraint)
- **THEN** the effective deduction SHALL be `100 * 0.4 = 40` AND the ICS SHALL reflect the penalty without being obliterated (still allows ranking)

### Requirement: Configurable penalty weight
The penalty damping factor SHALL be defined as a named constant `PENALTY_DAMPING_FACTOR = 0.4` in `lib/ics.ts` for visibility and future calibration.

#### Scenario: Constant is exported and documented
- **WHEN** a developer reads `lib/ics.ts`
- **THEN** `PENALTY_DAMPING_FACTOR` SHALL be visible near the top of the file with a comment explaining its purpose
