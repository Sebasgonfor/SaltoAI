## ADDED Requirements

### Requirement: Gemini call uses default thinking budget
The Gemini API call in the empresa interview route (`POST /api/entrevista-empresa`) SHALL NOT override the thinking budget. The model SHALL operate with its default thinking configuration, consistent with the joven interview route (`POST /api/entrevista`).

#### Scenario: LLM generates a valid slot-targeted question
- **WHEN** the founder responds to the opening question with a description of the role they need
- **AND** the Gemini API is called without a `thinkingConfig` override
- **THEN** the LLM SHALL return a JSON response with a non-empty `nextQuestion` targeting the next pending slot (e.g., `tareas_del_rol`)
- **AND** the `nextQuestion` SHALL be a specific, non-generic question related to the next slot

#### Scenario: LLM processes complex anti-redundancy rules
- **WHEN** the conversation history contains multiple turns
- **AND** the system prompt includes anti-redundancy rules ("NO repitas preguntas ni ángulos ya usados")
- **THEN** the LLM SHALL generate a question that targets a slot not yet covered
- **AND** the question SHALL NOT be a near-duplicate of any previous agent question in the history
