# Plan de trabajo por persona — Entrevistador Personalizable (4 personas)

> Documento para repartir el trabajo entre el equipo. Cada quien tiene su carril, sus tareas y su "✅ Listo cuando…". El detalle técnico completo está en **[`entrevistador-personalizable.md`](./entrevistador-personalizable.md)** (modelo de datos, arquitectura, fases).

**Qué construimos:** que cada reclutadora personalice el entrevistador (identidad, voz, preguntas, señales, marca, idioma) **y** la devolución al candidato, con un link propio `/r/[slug]`. La voz "como ella" se captura con un **wizard** que destila un descriptor editable (incluye transcribir audios suyos).

**Meta clave:** demo end-to-end funcionando **al final de la Semana 2**.

---

## 0. Asignación (4 carriles)

| Persona | Carril | Resumen |
|---|---|---|
| **P1 — _________** | Plataforma / Datos | Tipos, base de datos, APIs de config y candidatos, y conectar la config en las rutas existentes |
| **P2 — _________** | IA / Prompts | El "cerebro": prompts del entrevistador, destilación de estilo, transcripción de audio, prompts de feedback |
| **P3 — _________** | Frontend Reclutadora | Pantalla de configuración + wizard de estilo + lista de candidatos |
| **P4 — _________** | Frontend Joven / Marca | Landing de marca, theming, threading del chat, mostrar la devolución (perfil latente) |

> Sugerencia: **P2** al más fuerte en IA (es lo más delicado), **P1** a quien domine Firebase, **P3/P4** a los dos de frontend.

---

## 1. Día 1 — Kickoff de contratos (los 4 juntos, ~medio día)

Antes de programar, acordar y subir a la rama base los **contratos** para poder trabajar en paralelo:

- [ ] Tipos en `lib/recruiter-config.ts` (`RecruiterConfig`, `PromptConfig`, `StyleSample`, `RecruiterBrandPublic`) — los define **P1** y los demás los consumen.
- [ ] Shapes (request/response) de cada API nueva y de los params nuevos de `entrevista`/`live-token`/`perfil`.
- [ ] Decidir el merge del PR de señales (`feat/interview-signals-unification`): esta feature **depende** de él → mergearlo o ramificar desde ahí.
- [ ] Crear rama base `feat/recruiter-interviewer`.

Con los contratos listos, **P3 y P4 pueden mockear** y avanzar sin esperar al backend.

---

## 2. Reglas de trabajo (para todos)

- **Branching:** sub-ramas por persona/fase desde `feat/recruiter-interviewer`. PRs pequeños, revisión cruzada. Nada directo a `main`.
- **Contrato = verdad:** si cambias un tipo o shape de API, actualízalo primero y avisa en el grupo.
- **No romper lo actual:** sin `recruiterSlug`, todo debe funcionar igual que hoy (cero regresión).
- **Reglas duras intocables:** 3–5 turnos, schema JSON, detección de señales server-side, gate de cierre y anti-inyección del texto del joven **no se debilitan** por la personalización.
- **Cerrar una tarea =** cumple su "✅ Listo cuando…" **y** `npx tsc --noEmit` queda limpio.

---

## 3. P1 — Plataforma / Datos

### Fase 0 · Fundaciones (primero, desbloquea a todos)
- [ ] Crear **`lib/recruiter-config.ts`**: tipos (`RecruiterConfig`, `PromptConfig`, `StyleSample`, `RecruiterBrandPublic`), `PersonalityPreset`, `InterviewLanguage`, `PERSONALITY_PRESETS`, `RESERVED_SLUGS`, caps, y helpers: `normalizeSlug`, `isValidSlug`, `validateHexColor`, `validatePrioritySignals`, `validateRecruiterConfigInput`, `toPromptConfig`, `toBrandPublic`.
- [ ] **`lib/types.ts`**: añadir `Profile.sourceRecruiterUid?` y `sourceRecruiterSlug?`.
- [ ] **`lib/db.ts`**: colección `recruiter_configs` (doc id = `recruiterUid`) + mem map, siguiendo el patrón existente; funciones `upsertRecruiterConfig`, `getRecruiterConfig`, `getRecruiterConfigBySlug`, `isSlugAvailable`, y `listProfilesBySourceRecruiter`.
- ✅ **Listo cuando:** `tsc` limpio; en dev, `upsert` + `getBySlug` recuperan la config (con y sin Firestore); `normalizeSlug` bloquea reservados y normaliza acentos/espacios.

### Fase 2 · APIs de configuración
- [ ] **`app/api/recruiter-config/route.ts`**: `GET ?slug=` → brand pública (404 si no); `GET ?uid=` → config propia (o null); `PUT` → validar → si cambió slug `isSlugAvailable` (409 `slug_taken`) → guardar.
- [ ] **`app/api/recruiter-config/slug-available/route.ts`** → `{ available }`.
- ✅ **Listo cuando:** se puede guardar/leer config por uid, leer brand por slug, y un slug duplicado devuelve 409.

### Fase 1 / 4 / 8 · Conectar config en rutas existentes (con builders de P2)
- [ ] **`app/api/entrevista/route.ts`**: aceptar `recruiterSlug`; si viene, cargar config y construir el system prompt **per-request** con el builder de P2; reordenar señales pendientes; pasar cfg al fallback. **Mantener intactos** `detectSignals` y el gate de cierre.
- [ ] **`app/api/live/token/route.ts`**: aceptar `recruiterSlug`; para `mode==="joven"` pasar la config al builder de voz de P2.
- [ ] **`app/api/perfil/route.ts`**: persistir `sourceRecruiterUid/Slug`; pasar cfg para tono/idioma del summary (prompt de P2).
- ✅ **Listo cuando:** con un slug de prueba la entrevista usa la config; sin slug, salida idéntica a hoy; el perfil queda con `sourceRecruiterUid`.

### Fase 6 · API de candidatos
- [ ] **`app/api/empresa/candidatos/route.ts`**: `GET ?uid=` → `listProfilesBySourceRecruiter` (subset seguro: id, name, summary, skills, createdAt).
- ✅ **Listo cuando:** devuelve solo los perfiles de esa reclutadora.

---

## 4. P2 — IA / Prompts

### Fase 1 · Motor del entrevistador
- [ ] **`lib/interview-prompt.ts`**: `buildRecruiterBlock(cfg?)` con **identidad** ("Eres {interviewerName} para {displayName}"), **voz** (`personaDescriptor` + 3–4 `styleSamples` como few-shot), `instructions` como PREFERENCIAS, y preguntas propias a **tejer** (no de golpe, sin sacrificar cobertura).
- [ ] **Idioma**: si `cfg.language==="en"`, cambiar la regla de español por inglés.
- [ ] Añadir param opcional `cfg?` a `buildRestInterviewSystemPrompt`, `buildOpeningQuestionPrompt`, `buildLiveSystemInstruction` (aditivo; sin cfg = igual que hoy).
- [ ] `orderPendingSignals(remaining, prioritySignals)` y `pickFallbackQuestion(covered, asked, cfg?)` (preguntas propias primero → `signal:"custom"`; si no, raw con prioridad).
- ✅ **Listo cuando:** con cfg el prompt suena en su tono/idioma, teje ≥1 pregunta propia y prioriza sus señales; sin cfg, idéntico a hoy.

### Fase 3 · Captura de estilo (endpoints LLM)
- [ ] **`app/api/recruiter-config/persona/route.ts`**: recibe `styleSamples` + preset + idioma → Gemini destila `personaDescriptor` (2ª persona: voz, tono, muletillas, qué hace/evita). Fallback sin key: descriptor mínimo desde el preset.
- [ ] **`app/api/recruiter-config/transcribe/route.ts`**: audio (URL Cloudinary) → texto con Gemini multimodal (mirar `lib/document-extractor.ts`). Fallback: que la UI permita pegar a mano.
- ✅ **Listo cuando:** un audio se transcribe y "Generar mi estilo" produce un descriptor coherente; ambos con fallback si falla.

### Fase 5 · Feedback en su voz
- [ ] **`app/api/talento-latente/route.ts`**: aceptar `recruiterSlug` → inyectar voz/foco/idioma en `LATENT_PROMPT` (hidden skills, roles sugeridos, mensaje de cierre cercano).
- [ ] **`app/api/perfil/route.ts`** (prompt `EXTRACTION_PROMPT`): tono/idioma del summary (P1 cablea, P2 define el prompt).
- [ ] **`app/api/perfil/gaps/route.ts`** y **`app/api/cursos/recomendar/route.ts`**: sesgar por `focus`/sector + idioma.
- ✅ **Listo cuando:** la devolución (latente, summary, gaps, cursos) sale en el tono/idioma/foco de la reclutadora; fallbacks heurísticos intactos sin key.

---

## 5. P3 — Frontend Reclutadora

### Fase 2 · Pantalla de configuración
- [ ] **`app/empresa/entrevistador/page.tsx`** (RoleGate empresa): prefill con `GET /api/recruiter-config?uid=`. Campos: slug (con chequeo de disponibilidad + preview `/r/{slug}`), displayName, interviewerName, personality, **idioma (es/en)**, foco/sector, instrucciones (con contador), preguntas propias (añadir/quitar), señales a priorizar (chips desde `SIGNALS`), marca (logo, color, tagline, welcome).
- [ ] Acciones: Guardar (`PUT`, manejar 409 inline), **Copiar link** `/r/{slug}`, **Probar entrevista** (abre `/r/{slug}`).
- ✅ **Listo cuando:** se guarda la config, el slug valida disponibilidad y el botón copia el link.

### Fase 3 · Wizard "Tu estilo"
- [ ] Paso de wizard: 4–6 preguntas guiadas + campo para **pegar** ejemplos + **subir audios** (llama `transcribe`, muestra la transcripción).
- [ ] Botón **"Generar mi estilo"** (llama `persona`) → muestra el `personaDescriptor` **editable** antes de guardar.
- ✅ **Listo cuando:** responder + pegar + subir audio genera un descriptor editable que persiste en la config.

### Fase 6 · Mis candidatos
- [ ] **`app/empresa/candidatos/page.tsx`**: lista (de `GET /api/empresa/candidatos?uid=`) con link a `/empresa/candidatos/[profileId]`.
- [ ] **`components/empresa/empresa-header.tsx`** + CTA en `app/empresa/page.tsx`: enlaces "Mi entrevistador" y "Mis candidatos" + mostrar el link compartible.
- ✅ **Listo cuando:** la reclutadora ve la lista de sus candidatos y navega al detalle.

---

## 6. P4 — Frontend Joven / Marca

### Fase 2 · Landing + theming + threading del chat
- [ ] **`app/r/[slug]/page.tsx`** (público, sin RoleGate): trae brand por slug; 404 amable con CTA al chat genérico; hero de marca (logo, tagline, welcome, nombre del bot); color con `--brand-primary`; CTA → `/joven/chat?r=slug`; persistir contexto en localStorage.
- [ ] **`app/joven/chat/page.tsx`**: leer `?r=` / localStorage, traer brand, aplicar `--brand-primary` (avatar, barra de progreso, panel de señales), header con identidad; **enviar** `recruiterSlug` a `/api/entrevista` y `sourceRecruiterUid/Slug` a `/api/perfil`; persistir el contexto en el estado del chat.
- ✅ **Listo cuando:** `/r/{slug}` renderiza marca; el chat aplica color/identidad y manda el slug; el perfil queda asociado a la reclutadora.

### Fase 4 · Voz
- [ ] **`hooks/use-live-interview.ts`**: opción `recruiterSlug` reenviada al body de `/api/live/token`.
- ✅ **Listo cuando:** en modo voz, el agente adopta nombre/tono/idioma de la config.

### Fase 5 · Mostrar la devolución (perfil latente)
- [ ] **`app/joven/perfil/[id]/page.tsx`**: nueva sección que muestra el **perfil latente** (habilidades ocultas, habilidades transversales, roles sugeridos, mensaje de cierre). Asegurar que se dispara su generación.
- ✅ **Listo cuando:** al abrir el perfil se ve la devolución personalizada (hoy se genera pero está oculta).

---

## 7. Cronograma sugerido (4 semanas, ajustable)

| Semana | P1 — Datos | P2 — IA/Prompts | P3 — FE Reclutadora | P4 — FE Joven/Marca |
|---|---|---|---|---|
| **S1** | Fase 0 (tipos, db) | Fase 1 (`interview-prompt`) | Scaffold config (mocks) | Scaffold landing + theming (mocks) |
| **S2** | CRUD config + wiring `entrevista` | Cerrar Fase 1 con P1 | Conectar form real + copiar link | `joven/chat` threading + theming |
| | **🎯 Fin S2: demo end-to-end (config → link → entrevista con marca)** | | | |
| **S3** | wiring `live/token` + `perfil` | Endpoints `persona`+`transcribe` + prompts feedback | Wizard de estilo | Voz + empezar perfil latente |
| **S4** | API `empresa/candidatos` | Cerrar feedback (gaps/cursos/idioma) | `empresa/candidatos` + header/CTA | Cerrar perfil latente + pulido |
| | **Fase 7 (los 4): QA, anti-inyección, degradado, regresión, build + PRs** | | | |

---

## 8. Orden / dependencias que no se saltan

1. **Fase 0 (P1)** primero → desbloquea a todos.
2. **Builders de P2** antes de que P1 cablee las rutas (Fases 1, 4, 5).
3. **CRUD config (P1)** antes de que P3 guarde de verdad y P4 lea brand real (Fase 2).
4. **`persona`/`transcribe` (P2)** antes del wizard funcional de P3 (Fase 3).
5. Fases 4, 5 y 6 se pueden hacer **en paralelo** una vez exista la Fase 2.

---

## 9. Definición de "terminado" (Fase 7 — los 4)

Recorrer la **matriz de verificación** (§12 del doc maestro). Todo en verde:
- [ ] Config se guarda; slug valida; 409 en duplicado.
- [ ] Wizard genera descriptor editable (con audio transcrito).
- [ ] `/r/{slug}` con marca; `/r/{bogus}` neutra con CTA.
- [ ] Entrevista texto con `?r=`: identidad+tema+idioma; preguntas propias tejidas; señales prioritarias; 12 señales/3–5 turnos/gate intactos; `sourceRecruiterUid` guardado.
- [ ] Entrevista voz: agente con nombre/tono; turnos mínimos respetados.
- [ ] Perfil: devolución latente visible, en tono/idioma/foco.
- [ ] `/empresa/candidatos` lista los candidatos propios.
- [ ] Instrucciones maliciosas no rompen schema/turnos/cobertura.
- [ ] Sin Gemini key: fallbacks de entrevista y feedback funcionan.
- [ ] Sin `?r=`: experiencia genérica actual (cero regresión).
- [ ] `npx tsc --noEmit` y `npm run build` limpios.
