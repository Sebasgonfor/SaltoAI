## ADDED Requirements

### Requirement: Exact phrase matching for job titles
The `isJobTitle()` function in `lib/skill-classification.ts` SHALL use exact phrase matching for job title prefixes rather than `startsWith`, so that skills like "Atención al Cliente" or "Gestión de Ventas" are not incorrectly classified as job titles.

#### Scenario: Legitimate skill not misidentified as job title
- **WHEN** a skill string is "Atención al Cliente"
- **THEN** `isJobTitle()` SHALL return `false` (it is a skill, not a job title)

#### Scenario: Actual job title correctly identified
- **WHEN** a skill string is "Asistente Administrativo"
- **THEN** `isJobTitle()` SHALL return `true` (it is a job title, not a skill)

#### Scenario: Skill containing job title prefix
- **WHEN** a skill string is "Gestión de Redes Sociales"
- **THEN** `isJobTitle()` SHALL return `false` (the word "Gestión" is not a job title prefix)

### Requirement: Context-aware job title filtering
When a string matches a job title prefix, the filter SHALL additionally check whether the remainder of the string contains skill-indicating competency terms. If it does, the string SHALL NOT be classified as a job title.

#### Scenario: Compound string with job prefix and skill content
- **WHEN** a skill string starts with "Asistente de" AND the remainder contains competency terms like "gestión", "campañas", or "clientes"
- **THEN** `isJobTitle()` SHALL return `false` (the string describes a competency, not a purely administrative role)

#### Scenario: Pure job title without skill content
- **WHEN** a skill string is "Coordinador de Proyectos"
- **THEN** `isJobTitle()` SHALL return `true` (it is a role title without specific skill description)

### Requirement: Competency term list
The filter SHALL maintain a `COMPETENCY_TERMS` constant containing Spanish terms that indicate a string describes a skill rather than a job title, including: gestión, manejo, atención, ventas, diseño, desarrollo, contenido, marketing, campañas, clientes, logística, operaciones.

#### Scenario: Competency terms prevent false filtering
- **WHEN** `isJobTitle()` checks a string that starts with a job title prefix BUT contains any term from `COMPETENCY_TERMS`
- **THEN** the filter SHALL classify it as a skill (NOT a job title)
