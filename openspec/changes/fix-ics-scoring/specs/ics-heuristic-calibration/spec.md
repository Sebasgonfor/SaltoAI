## ADDED Requirements

### Requirement: Dynamic contextFit scoring
The heuristic scorer SHALL compute `contextFit` as a value in range [20, 100] based on semantic overlap between the need's `context` field and the profile's `summary` and `traits`, rather than returning a binary 65 or 45.

#### Scenario: Strong context alignment
- **WHEN** a need's context is "equipo de 3 personas, ritmo rápido, multitarea, sin protocolos" AND the profile has traits ["Tolerancia al caos", "Proactividad"] AND summary mentions "maneja caos de local pequeño"
- **THEN** `contextFit` SHALL be ≥ 80

#### Scenario: Weak context alignment
- **WHEN** a need's context is "MIPYME tranquila, finanzas que ordenar, trabajo metódico" AND the profile has traits ["Tolerancia al caos", "Creatividad"] with no mention of order or detail
- **THEN** `contextFit` SHALL be ≤ 40

#### Scenario: No context information
- **WHEN** the need has an empty `context` field
- **THEN** `contextFit` SHALL default to 50 (neutral)

### Requirement: Gradient learningSignal scoring
The heuristic scorer SHALL compute `learningSignal` as a value in range [25, 95] based on the presence and quality of learning-related evidence, rather than returning a binary 70 or 40 from a single regex.

#### Scenario: Strong learning evidence in cuantitativa role
- **WHEN** `jobNature` is "cuantitativa" AND profile evidence contains phrases like "aprendió Excel por YouTube", "desarrolló landing pages por su cuenta"
- **THEN** `learningSignal` SHALL be ≥ 80

#### Scenario: Strong execution evidence in cualitativa role
- **WHEN** `jobNature` is "cualitativa" AND profile evidence contains phrases like "cuadró caja todos los días sin faltantes", "mantuvo inventario organizado por 8 meses"
- **THEN** `learningSignal` SHALL be ≥ 70

#### Scenario: No learning evidence
- **WHEN** profile evidence contains no learning-related terms AND no tool/technology mentions
- **THEN** `learningSignal` SHALL default to 30

### Requirement: Job nature awareness in heuristic
The heuristic scorer SHALL adapt its sub-score evaluation strategy based on `need.jobNature`: cuantitativa roles SHALL prioritize measurable results and scrappy initiative; cualitativa roles SHALL prioritize consistency, reliability, and careful execution.

#### Scenario: Cuantitativa role prioritizes metrics
- **WHEN** `jobNature` is "cuantitativa" AND profile evidence contains concrete metrics (percentages, counts, growth)
- **THEN** `skillsFit` and `learningSignal` SHALL receive a bonus multiplier of 1.1

#### Scenario: Cualitativa role does not penalize lack of metrics
- **WHEN** `jobNature` is "cualitativa" AND profile evidence contains qualitative consistency statements but no metrics
- **THEN** `learningSignal` SHALL NOT be penalized for absence of numerical evidence

### Requirement: Context keyword analysis
The heuristic scorer SHALL use a predefined set of Spanish operational-context keywords to evaluate how well a profile's traits and summary align with the need's work environment description.

#### Scenario: Keyword detection in context
- **WHEN** the need's `context` contains "caos", "multitarea", or "ritmo rápido"
- **THEN** the scorer SHALL award `contextFit` points for profiles with traits like "Tolerancia al caos" or "Adaptabilidad"

#### Scenario: Keyword detection for cualitativa context
- **WHEN** the need's `context` contains "orden", "finanzas", "metódico", or "detalle"
- **THEN** the scorer SHALL award `contextFit` points for profiles with traits like "Detallista", "Meticulosidad", or "Organización"
