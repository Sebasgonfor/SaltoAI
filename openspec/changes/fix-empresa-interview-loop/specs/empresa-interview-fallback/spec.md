## ADDED Requirements

### Requirement: Empty LLM nextQuestion routes to deterministic slot fallback
When the Gemini LLM returns a response with an empty, missing, or null `nextQuestion` field, the system SHALL reject the response and route to the deterministic `fallbackResponse(messages)` function, which picks the next unanswered slot question from the question bank based on heuristic regex slot detection.

#### Scenario: LLM returns JSON without nextQuestion field
- **WHEN** Gemini returns `{ "done": false }` with no `nextQuestion` property
- **THEN** the API SHALL throw an error equivalent to `"empty_next_question"`
- **AND** the catch handler SHALL call `fallbackResponse(messages)` which returns a slot-targeted question for the first pending slot (e.g., `tareas_del_rol`)

#### Scenario: LLM returns JSON with empty string nextQuestion
- **WHEN** Gemini returns `{ "nextQuestion": "", "done": false }`
- **THEN** the API SHALL throw an error equivalent to `"empty_next_question"`
- **AND** the fallback SHALL produce a meaningful, slot-targeted question, not a generic phrase

### Requirement: Exception handler uses deterministic slot-aware fallback
When an unhandled exception occurs during interview turn processing (after rate-limit checks), the system SHALL return a response built by `fallbackResponse(messages)` which includes the current slot coverage state and a question targeting the next pending slot.

#### Scenario: Unexpected exception during LLM call
- **WHEN** an unexpected runtime error occurs after the `isLastAnswerTooShort` guard and Gemini call
- **AND** the error is not a rate-limit error (429)
- **THEN** the API SHALL call `fallbackResponse(messages)` using the current message history
- **AND** the response SHALL include `slotsCovered` reflecting the actual heuristic detected slots
- **AND** the response SHALL include `targetedSlot` set to the next pending slot

### Requirement: No generic fallback strings in conversation history
The system SHALL NOT inject hardcoded generic strings (such as "Cuéntame más sobre eso, ¿puedes darme un ejemplo concreto?") into the conversation history as agent messages. Every agent message produced by a fallback path MUST come from the deterministic `fallbackResponse()` or `pickFallbackQuestion()` functions, ensuring it targets a specific pending slot.

#### Scenario: Client-side fallback never triggers due to missing nextQuestion
- **WHEN** the API returns a response with `nextQuestion` populated from `fallbackResponse()`
- **THEN** the client's fallback (`data.nextQuestion || 'Cuéntame más sobre eso...'`) SHALL never execute the hardcoded string branch
