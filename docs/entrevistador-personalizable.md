# Entrevistador + Feedback Personalizable por Reclutadora — Plan de Implementación

> Documento maestro de la feature. Define el alcance completo, la arquitectura, el modelo de datos y la implementación **por fases**. Sirve como base técnica y como insumo para la propuesta de alianza con Merlys Solórzano.

- **Estado:** Aprobado para implementación
- **Stack:** Next.js 15 (App Router) · TypeScript · Firebase Firestore · Gemini 2.5 Flash
- **Autor:** Equipo Salto AI

---

## 1. Resumen ejecutivo

Hoy SaltoAI tiene **un único entrevistador genérico** y una **devolución genérica** para todos los jóvenes. Esta feature permite que **cada reclutadora** (cuenta `empresa`) personalice la experiencia de punta a punta —entrevista **y** feedback— para que se sienta **cercana, auténtica y "como ella", no robotizada**, y la comparta con un **link propio de marca** (`/r/[slug]`).

La pieza diferenciadora es que la "personalidad" del entrevistador **no se elige de un menú**: se **captura** mediante un *wizard* (una mini-entrevista a la reclutadora) que destila un **descriptor de voz editable**, alimentado por sus respuestas, ejemplos que pegue y **audios suyos transcritos**. Ese descriptor alimenta tanto las preguntas de la entrevista como la devolución al candidato.

---

## 2. Contexto y objetivos

De la reunión con Merlys Solórzano (Ing. Industrial, 8 años en RRHH para startups LATAM, marca personal de **empleabilidad y coaching**: optimización de CV/LinkedIn):

- Su **valor central NO es el matching** (eso ya lo tiene en su trabajo full-time). Lo que quiere de Salto es:
  1. Una **entrevista que extrae y articula el valor latente** de personas que no documentan bien su experiencia ("extraer con palabras a los que no tienen puesto su valor por ningún lado").
  2. Una **devolución personalizada y rápida** (mejorar CV/LinkedIn, habilidades ocultas, próximos pasos), que se sienta como ella y "que me leyó completo, no un copy-paste".
- Trabaja con **perfiles diversos, no solo tech**.
- En su operación actual su asistente "se llama María" y "personaliza muchas cosas"; pidió **darle identidad/nombre** al entrevistador.
- Quiere una **landing propia** ("Salto-laempresatuya.com") y **poder modificarlo ella misma**.
- Confirmó que **no** quiere una plataforma aparte: **personalizar Salto**, no clonarlo.

### Objetivos
1. Personalizar la **entrevista** (identidad, voz, preguntas, señales, idioma) por reclutadora.
2. Personalizar el **feedback al candidato** (perfil latente, devolución, summary, cursos) en su voz.
3. Capturar la voz real de la reclutadora con un **wizard de estilo**.
4. Dar **link de marca** + **landing** + **theming**.
5. Que la reclutadora **configure y vea a "sus" candidatos** de forma self-service.

---

## 3. Principios de diseño (no negociables)

1. **Aditivo y subordinado.** La personalización se suma a las reglas duras, nunca las anula. Permanecen autoritativos: presupuesto de **3–5 turnos**, **schema JSON** de salida, **anti-inyección** del texto del joven, **detección de señales server-side**, **gate de cierre** (`MIN_SIGNALS_TO_CLOSE`).
2. **Sin config → comportamiento actual.** Si no hay `recruiterSlug` o el slug no existe, todo funciona exactamente como hoy (path genérico cacheado). Cero regresión.
3. **Personalizar Salto, no clonarlo.** Una sola base de código; la marca/landing es una capa, no una plataforma paralela.
4. **Ya es agnóstico de profesión.** Las 12 señales son conductuales, `JobNature` cubre roles cuanti/cualitativos y las skills son de texto libre. No se rehace la taxonomía para perfiles no-tech.
5. **Robustez "la entrevista nunca muere".** Todos los caminos personalizados conservan los fallbacks deterministas y heurísticos existentes.
6. **La reclutadora manda, pero no puede romper el formato.** Sus instrucciones son *preferencias de estilo*; no pueden cambiar turnos, schema, ni inflar la cobertura de señales.

---

## 4. Decisiones de producto confirmadas

| Decisión | Elección |
|---|---|
| Vinculación joven ↔ reclutadora | **Por reclutadora** (1 config por cuenta + link `/r/[slug]`) |
| Alcance v1 | **Máximo**: estilo, nombre/persona, preguntas, señales, marca, idioma (es/en), feedback personalizado, vista de candidatos |
| Motor de preguntas | **Híbrido** (teje preguntas propias + cubre las 12 señales) |
| Captura de estilo | **Wizard guiado** que destila un `personaDescriptor` editable |
| Fuentes de voz | Respuestas del wizard + ejemplos pegados + **audios transcritos** |
| Idioma | **es / en** configurable en v1 |

---

## 5. Arquitectura general

```
RECLUTADORA (cuenta empresa)
  └─ /empresa/entrevistador  ──>  configura: identidad, wizard de estilo,
        │                         preguntas, señales, marca, idioma
        │   POST /api/recruiter-config (+ /persona destila, /transcribe audio)
        ▼
   Firestore: recruiter_configs (doc id = recruiterUid, con slug único)
        │
        ▼  link compartible
   /r/[slug]  (landing pública con su marca)
        │   CTA "Empezar entrevista"
        ▼
   /joven/chat?r=slug   (entrevista con marca + voz de la reclutadora)
        │   POST /api/entrevista        (texto, recruiterSlug)
        │   POST /api/live/token        (voz,   recruiterSlug)
        ▼
   POST /api/perfil  (sourceRecruiterUid)  ──>  Profile asociado a la reclutadora
        │
        ├─ /api/talento-latente   feedback latente en su voz
        ├─ /api/perfil/gaps       gaps sesgados por su foco/idioma
        └─ /api/cursos/recomendar cursos sesgados por su foco/idioma
        ▼
   /joven/perfil/[id]  (devolución personalizada visible)

   /empresa/candidatos  (la reclutadora ve a "sus" candidatos)
```

**Flujo del dato de personalización:** `RecruiterConfig` → `toPromptConfig()` → `PromptConfig` (slim, saneado) → inyectado en los *builders* de prompt y en los endpoints de feedback. El descriptor de voz es la fuente de verdad; las muestras son apoyo *few-shot*.

---

## 6. Modelo de datos

### 6.1 `lib/recruiter-config.ts` (nuevo, módulo puro server+client)

```ts
type PersonalityPreset = "calido" | "directo" | "profesional" | "juvenil" | "tecnico"; // baseline rápido
type InterviewLanguage = "es" | "en"; // default "es"

interface StyleSample { source: "wizard" | "pasted" | "audio"; text: string; }

interface RecruiterBrand {
  logoUrl?: string;
  primaryColor?: string;   // validado #RRGGBB
  tagline?: string;
  welcomeMessage?: string;
}

interface RecruiterConfig {
  recruiterUid: string;      // doc id (1 config por reclutadora)
  slug: string;              // único, público, URL-safe
  displayName: string;       // marca/persona mostrada al joven
  interviewerName?: string;  // nombre del bot (ej. "María")
  personality: PersonalityPreset;
  personaDescriptor?: string;// párrafo de voz DESTILADO y EDITABLE (fuente de verdad del estilo)
  styleSamples: StyleSample[];
  language: InterviewLanguage;
  focus?: string;            // sector/audiencia (ej. "empleabilidad general, perfiles diversos")
  instructions?: string;     // preferencias libres (subordinadas a las reglas duras)
  customQuestions: { id: string; text: string }[];
  prioritySignals: string[]; // subconjunto de SIGNAL_IDS
  brand: RecruiterBrand;
  createdAt: number;
  updatedAt: number;
}

// Shape slim y saneado que reciben builders y endpoints de feedback:
interface PromptConfig {
  displayName?: string;
  interviewerName?: string;
  personality: PersonalityPreset;
  personaDescriptor?: string;
  styleSamples: string[];    // top N textos
  language: InterviewLanguage;
  focus?: string;
  instructions?: string;
  customQuestions: string[];
  prioritySignals: string[];
}

// Público para la landing (NUNCA expone persona/instructions/samples):
interface RecruiterBrandPublic { slug; displayName; interviewerName?; brand; }
```

**Constantes:** `PERSONALITY_PRESETS: Record<preset,{label,promptLine}>`, `RESERVED_SLUGS`, y caps: `MAX_CUSTOM_QUESTIONS=8`, `INSTRUCTIONS_MAX_CHARS=600`, `INTERVIEWER_NAME_MAX=40`, `FOCUS_MAX=200`, `PERSONA_DESCRIPTOR_MAX=1200`, `MAX_STYLE_SAMPLES=12`, `STYLE_SAMPLE_MAX_CHARS=1000`.

**Helpers:** `normalizeSlug`, `isValidSlug`, `validateHexColor`, `validatePrioritySignals` (∩ `SIGNAL_IDS` de `./signals`), `validateRecruiterConfigInput(raw,uid)`, `toPromptConfig(cfg)`, `toBrandPublic(cfg)`.

### 6.2 `lib/types.ts` (modificado)

`Profile` gana (opcionales, retro-compat): `sourceRecruiterUid?: string`, `sourceRecruiterSlug?: string`.

### 6.3 Almacenamiento `lib/db.ts` (modificado)

Colección `recruiter_configs` (doc id = `recruiterUid`), siguiendo el patrón existente (mem map + `firestoreDisabledFor` + `stripUndefined`):
- `upsertRecruiterConfig(c)`, `getRecruiterConfig(uid)`, `getRecruiterConfigBySlug(slug)`, `isSlugAvailable(slug, forUid)`.
- `listProfilesBySourceRecruiter(recruiterUid)` (para la vista de candidatos).

---

## 7. Inventario de archivos

### Nuevos
| Archivo | Propósito |
|---|---|
| `lib/recruiter-config.ts` | Tipos, presets, validación, slug, helpers |
| `app/api/recruiter-config/route.ts` | GET brand pública / GET config propia / PUT upsert |
| `app/api/recruiter-config/slug-available/route.ts` | Disponibilidad de slug |
| `app/api/recruiter-config/persona/route.ts` | Destila `personaDescriptor` (Gemini) |
| `app/api/recruiter-config/transcribe/route.ts` | Audio → texto (Gemini multimodal) |
| `app/api/empresa/candidatos/route.ts` | Lista candidatos por `sourceRecruiterUid` |
| `app/empresa/entrevistador/page.tsx` | UI de configuración + wizard de estilo |
| `app/empresa/candidatos/page.tsx` | Lista de "sus" candidatos |
| `app/r/[slug]/page.tsx` | Landing pública de marca |

### Modificados
| Archivo | Cambio |
|---|---|
| `lib/types.ts` | `Profile.sourceRecruiterUid/Slug` |
| `lib/db.ts` | CRUD `recruiter_configs` + `listProfilesBySourceRecruiter` |
| `lib/interview-prompt.ts` | `cfg` en builders, `buildRecruiterBlock`, identidad, idioma, `orderPendingSignals`, `pickFallbackQuestion(cfg)` |
| `app/api/entrevista/route.ts` | system prompt per-request + threading de slug/prioridad/fallback |
| `app/api/live/token/route.ts` | threading de `recruiterSlug` (voz) |
| `hooks/use-live-interview.ts` | opción `recruiterSlug` |
| `app/api/perfil/route.ts` | `sourceRecruiterUid` + tono/idioma del summary |
| `app/api/talento-latente/route.ts` | feedback latente con voz/foco/idioma |
| `app/api/perfil/gaps/route.ts` | gaps sesgados por foco/idioma |
| `app/api/cursos/recomendar/route.ts` | cursos sesgados por foco/idioma |
| `app/joven/perfil/[id]/page.tsx` | **mostrar perfil latente** (hoy oculto) |
| `app/joven/chat/page.tsx` | contexto de reclutadora + theming + threading |
| `components/empresa/empresa-header.tsx` | enlaces "Mi entrevistador" / "Mis candidatos" |
| `app/empresa/page.tsx` | CTA + link compartible |

---

## 8. Implementación por fases

Cada fase es un incremento **verificable**. El orden prioriza tener un **demo end-to-end temprano** (Fase 2) y la **autenticidad** (Fase 3–4) después.

---

### FASE 0 — Fundaciones (datos + almacenamiento)
**Objetivo:** Base de tipos y persistencia. No visible al usuario.

- `lib/recruiter-config.ts`: tipos, `PERSONALITY_PRESETS`, idioma, caps, validación, slug, `toPromptConfig`, `toBrandPublic`.
- `lib/types.ts`: `Profile.sourceRecruiterUid/Slug`.
- `lib/db.ts`: colección `recruiter_configs` + `upsert/get/getBySlug/isSlugAvailable` + `listProfilesBySourceRecruiter`.

**Criterios de aceptación:**
- `npx tsc --noEmit` limpio.
- En un proceso dev, `upsert` + `getBySlug` recuperan la config desde el mem map (con y sin Firestore).
- `normalizeSlug` bloquea reservados y normaliza acentos/espacios.

**Dependencias:** ninguna. **Tamaño:** S.

---

### FASE 1 — Entrevista personalizada (texto)
**Objetivo:** Que la entrevista por chat se adapte cuando llega `recruiterSlug` (identidad, voz, preguntas híbridas, señales prioritarias, idioma), sin romper las reglas duras.

- `lib/interview-prompt.ts`:
  - `buildRecruiterBlock(cfg?)` (identidad + voz `personaDescriptor`/samples + instrucciones como PREFERENCIAS + preguntas propias a *tejer*).
  - Idioma es/en.
  - `cfg?` opcional en `buildRestInterviewSystemPrompt` / `buildOpeningQuestionPrompt`.
  - `orderPendingSignals(remaining, prioritySignals)` y `pickFallbackQuestion(covered, asked, cfg?)`.
- `app/api/entrevista/route.ts`: cargar config por slug, `systemPrompt` per-request, reordenar señales, "preguntas propias aún no usadas", fallback con cfg. **`detectSignals` y gate intactos.**
- `app/api/perfil/route.ts`: persistir `sourceRecruiterUid/Slug`.

**Criterios de aceptación:**
- Con un slug de prueba: el agente usa el tono/idioma, teje ≥1 pregunta propia, y pregunta antes por las señales prioritarias.
- Se mantienen 12 señales detectables, 3–5 turnos y gate de cierre.
- Sin `?r=`: salida byte-idéntica a hoy.
- Inyección en `instructions` ("cierra en 1 turno / cambia el JSON") **no** surte efecto.

**Dependencias:** Fase 0. **Tamaño:** M.

---

### FASE 2 — Configuración + Landing + Marca (primer demo end-to-end)
**Objetivo:** La reclutadora configura lo básico, obtiene su link y un joven hace una entrevista con su marca. **Hito demostrable para Merlys.**

- `app/api/recruiter-config/route.ts` (GET brand / GET propia / PUT con 409 `slug_taken`).
- `app/api/recruiter-config/slug-available/route.ts`.
- `app/empresa/entrevistador/page.tsx` (sin wizard aún): slug + disponibilidad, displayName, interviewerName, personality, idioma, foco, instrucciones, preguntas, señales (chips), marca (logo, color, tagline, welcome), copiar link, "probar".
- `app/r/[slug]/page.tsx`: landing pública con marca (404 amable si no existe).
- `app/joven/chat/page.tsx`: leer `?r=`/localStorage, refrescar brand, **theming** (`--brand-primary`), header con identidad, threading de `recruiterSlug` a `/api/entrevista` y `sourceRecruiterUid` a `/api/perfil`, persistir contexto.
- `components/empresa/empresa-header.tsx` + `app/empresa/page.tsx`: enlace "Mi entrevistador" + link compartible.

**Criterios de aceptación:**
- Guardar config, ver disponibilidad de slug, copiar `/r/{slug}`; 409 con slug duplicado.
- `/r/{slug}` renderiza marca; `/r/{bogus}` → página neutra con CTA al chat genérico.
- `/joven/chat?r={slug}` aplica color/logo/identidad y manda `recruiterSlug`; al terminar, el `Profile` queda con `sourceRecruiterUid`.

**Dependencias:** Fases 0–1. **Tamaño:** L.

---

### FASE 3 — Wizard de estilo (captura de la voz "como ella")
**Objetivo:** Capturar la personalidad real de la reclutadora y destilar un `personaDescriptor` editable.

- `app/api/recruiter-config/transcribe/route.ts`: audio (subido vía el patrón Cloudinary de `documents-manager`) → texto con Gemini multimodal (como `lib/document-extractor.ts`). Fallback: pegar a mano.
- `app/api/recruiter-config/persona/route.ts`: `styleSamples` + preset + idioma → Gemini destila `personaDescriptor` (2ª persona: voz, tono, muletillas, qué hace/evita). Fallback sin key: descriptor mínimo desde el preset.
- `app/empresa/entrevistador/page.tsx`: paso **"Tu estilo"** — preguntas guiadas (4–6), pegar ejemplos, subir audios (con transcripción visible), botón "Generar mi estilo" → `personaDescriptor` **editable** antes de guardar.
- Inyección del descriptor + 3–4 samples en `buildRecruiterBlock` (ya preparado en Fase 1; aquí se llena de verdad).

**Criterios de aceptación:**
- Responder wizard + pegar ejemplo + subir 1 audio → transcripción agregada; "Generar mi estilo" produce un descriptor coherente y editable; persiste en la config.
- La entrevista (Fase 1) suena notablemente más "como ella" con el descriptor cargado.
- Sin key / audio fallido → fallbacks no rompen el flujo.

**Dependencias:** Fases 0–2. **Tamaño:** L.

---

### FASE 4 — Voz personalizada (paridad)
**Objetivo:** Que el modo voz adopte identidad, tono, preguntas e idioma.

- `app/api/live/token/route.ts`: aceptar `recruiterSlug`; para `mode==="joven"` cargar config y pasar a `buildLiveSystemInstruction` (gana `cfg?`).
- `hooks/use-live-interview.ts`: opción `recruiterSlug` reenviada al token.

**Criterios de aceptación:**
- En voz, el agente se presenta con `interviewerName`, usa el tono/idioma y respeta `MIN_USER_TURNS`/cierre.

**Dependencias:** Fases 0–1 (idealmente 3 para la voz). **Tamaño:** S–M.

---

### FASE 5 — Feedback personalizado al candidato (núcleo de Merlys)
**Objetivo:** Que la devolución se sienta cercana y "como ella", y **mostrar el perfil latente que hoy se genera pero está oculto**.

- `app/joven/perfil/[id]/page.tsx`: nueva sección de **perfil latente** (habilidades ocultas, roles sugeridos, mensaje de cierre cercano). Asegurar disparo de generación (en `/api/perfil` o lazy en primera carga; ya existe `updateProfileLatent`).
- `app/api/talento-latente/route.ts`: `recruiterSlug` → voz (`personaDescriptor`+samples), `focus` para roles sugeridos, idioma, cierre cercano.
- `app/api/perfil/route.ts`: tono/idioma del `summary` con cfg.
- `app/api/perfil/gaps/route.ts` y `app/api/cursos/recomendar/route.ts`: sesgar por `focus`/sector + idioma.
- CV: el upload ya existe (`DocumentsManager`); solo asegurar que aparece en el flujo con marca.

**Criterios de aceptación:**
- Al abrir el perfil del candidato: perfil latente visible; summary/gaps/cursos en el tono/idioma/foco de la reclutadora.
- Fallbacks heurísticos/mock intactos sin key Gemini.

**Dependencias:** Fases 0–2. **Tamaño:** L.

---

### FASE 6 — Vista de candidatos de la reclutadora
**Objetivo:** Que la reclutadora vea y gestione a "sus" candidatos.

- `app/api/empresa/candidatos/route.ts`: `GET ?uid=` → `listProfilesBySourceRecruiter` (subset seguro).
- `app/empresa/candidatos/page.tsx`: lista con link a `/empresa/candidatos/[profileId]`.
- `components/empresa/empresa-header.tsx` + `app/empresa/page.tsx`: enlace "Mis candidatos".

**Criterios de aceptación:**
- `/empresa/candidatos` lista los perfiles con `sourceRecruiterUid` propio y permite abrir el detalle.

**Dependencias:** Fases 0, 2. **Tamaño:** S–M.

---

### FASE 7 — QA, hardening y entrega
**Objetivo:** Verificación end-to-end, seguridad y pulido.

- Recorrido completo de la **matriz de verificación** (sección 11).
- Pruebas de **anti-inyección** (instrucciones maliciosas), **degradado** (sin Gemini key), **regresión** (sin `?r=`), **anónimos**, **paridad de voz**.
- Revisión de privacidad de `styleSamples` y manejo de audio.
- (Opcional) `/code-review` del diff y commit/PR.

**Criterios de aceptación:** toda la matriz en verde; `npx tsc --noEmit` y `npm run build` limpios.

**Dependencias:** todas. **Tamaño:** M.

---

## 9. Aspectos transversales

### Seguridad / anti-inyección
- Texto del **joven** = DATOS (cláusula SEGURIDAD existente, intacta).
- `instructions` de la reclutadora = **PREFERENCIAS**: capadas, etiquetadas, colocadas **antes** del schema JSON, e **incapaces** de afectar `detectSignals`, el gate de cierre o el presupuesto de turnos.
- `primaryColor` validado a `#RRGGBB` estricto (evita inyección por CSS var).
- Endpoints `persona`/`transcribe`/config con scoping por `uid`.

### Internacionalización
- Idioma de la **entrevista/feedback**: es/en según config (la UI de la app permanece en español en v1).

### Privacidad
- `styleSamples` son material de la **reclutadora**, no de candidatos. Audios solo se transcriben (no se persiste el binario más allá de Cloudinary). `personaDescriptor` siempre revisado/editable por ella; no se inyecta audio crudo sin su aprobación.

### Robustez / fallbacks
- Slug ausente/no encontrado → experiencia genérica (log info, sin dead-end).
- `pickFallbackQuestion(cfg)` sirve preguntas propias/prioridad en modo degradado.
- Feedback sin key Gemini → fallback heurístico/mock existente.
- El *bypass* por colección de Firestore evita que un error en `recruiter_configs` tumbe `profiles`/`needs`.

### Theming
- `--brand-primary` aplicado en chat y landing (anillo de avatar, barra de progreso, panel de señales, hero). Default emerald si no hay color válido.

---

## 10. Modelo de negocio y monetización

> Esta feature no es solo técnica: la **experiencia personalizada es en sí misma un producto monetizable** y es el eje de la alianza con Merlys. Los números concretos quedan **por definir con el equipo**; aquí se fija el marco capturado de la reunión.

### 10.1 Plataforma (modelo base del pitch)
- **Comisión por contratación exitosa** a empresas (% sobre la contratación, tras el periodo de prueba).
- **Gratis para candidatos/jóvenes** (filosofía: quien busca trabajo no paga).
- **Microtareas remuneradas**: Salto cobra una **tarifa de intermediación** sobre lo que la empresa paga al joven (ej. 10% — ilustrativo, **no final**).
- **Premium para candidatos** (entrevistas/simulaciones con IA) vía **suscripción o pago único**.

### 10.2 Monetización de esta feature (reclutadoras / partnership)
La experiencia personalizada habilita ingresos nuevos del lado reclutador:
- **Plan de reclutadora (SaaS):** suscripción por usar entrevistador + feedback personalizados con su marca.
- **Setup de personalización:** fee inicial por configurar voz/marca/wizard (servicio).
- **Landing de marca / dominio propio como servicio:** add-on pago sobre la landing `/r/[slug]`.
- **Revenue-share / comisión compartida:** si la reclutadora coloca candidatos vía Salto.

### 10.3 Costos de personalización (lo que Merlys pidió ver)
Drivers para armar la cotización (setup + costo variable):
- **Desarrollo** (una vez): Fases 0–7 de este documento.
- **Uso de Gemini** por candidato: tokens de entrevista (texto/voz) + feedback (latente/gaps/cursos) + **destilación de persona** + **transcripción de audio** del wizard.
- **Infra/almacenamiento:** Firestore + Cloudinary (audios, logo).
- **Mantenimiento y soporte.**
→ Salida: cotización tipo *setup inicial + costo por entrevista/candidato*. **Cifras por definir.**

### 10.4 Modelo de alianza con Merlys
- **Aporta Salto:** tecnología, personalización, infraestructura.
- **Aporta Merlys:** experiencia en reclutamiento (preguntas/criterios), pilotaje con usuarios reales de su servicio de empleabilidad, feedback continuo, relacionamiento/comunidades LATAM, mentoría para enriquecer el chat.
- **Validación:** pilotos con sus clientes; medir efectividad y **autenticidad** de la devolución.
- **Pendiente de ambos lados:** documento de especificaciones de Merlys + **propuesta formal** (modelo de colaboración, cambios, costos) del equipo.

### 10.5 Track de cobros (futuro, paralelo)
Cuando se decida activar ingresos: integrar pasarela (ej. **Stripe**) para suscripción de reclutadora, cobros premium y *split* de microtareas. **Fuera del alcance v1** de esta feature (que entrega la personalización); es un track de negocio paralelo a las fases técnicas.

---

## 11. Fuera de alcance (futuro)

- **Dominio propio** (`salto-laempresatuya.com`) → servicio aparte sobre la landing.
- **Historial de slugs** (redirección de links viejos al cambiar slug).
- **Configuración de criterios de matching/ICS** por reclutadora (ella priorizó la entrevista/feedback, no el matching).
- **Simulación de entrevista con feedback** (seguridad/comunicación al hablar) — mencionada en la reunión como mejora futura.
- **Más idiomas** además de es/en.
- **Importar tono desde LinkedIn/contenido** como fuente de muestras (no seleccionado para v1).
- **Cobros/pagos** (ver §10.5).

> Nota: el campo `instructions` (texto libre) absorbe pedidos ad-hoc que lleguen en el documento de especificaciones de Merlys, sin cambiar el schema.

---

## 12. Matriz de verificación (end-to-end)

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | `npx tsc --noEmit` / `npm run build` | Limpio |
| 2 | Guardar config en `/empresa/entrevistador` | Persiste; disponibilidad de slug; 409 en duplicado |
| 2b | Wizard de estilo (preguntas + ejemplos + audio) | Transcripción agregada; `personaDescriptor` editable; persiste |
| 3 | `/r/{slug}` y `/r/{bogus}` | Marca renderiza / página neutra con CTA |
| 4 | Entrevista texto con `?r={slug}` | Identidad+tema+idioma; preguntas propias tejidas; señales prioritarias antes; 12 señales/3–5 turnos/gate intactos; `sourceRecruiterUid` guardado |
| 5 | Entrevista voz con `recruiterSlug` | Agente se presenta con su nombre y tono; `MIN_USER_TURNS` respetado |
| 6 | Perfil del candidato | Perfil latente visible; summary/gaps/cursos en tono/idioma/foco |
| 7 | `/empresa/candidatos` | Lista los perfiles con `sourceRecruiterUid` propio |
| 8 | `instructions` maliciosas | Schema/turnos/cobertura server-side intactos |
| 9 | Sin Gemini key | Fallbacks de entrevista y feedback funcionan |
| 10 | `/joven/chat` sin `?r=` | Experiencia genérica actual (cero regresión) |

---

## 13. Resumen de fases

| Fase | Nombre | Hito | Tamaño |
|---|---|---|---|
| 0 | Fundaciones | Tipos + storage | S |
| 1 | Entrevista personalizada (texto) | Motor adapta por slug | M |
| 2 | Config + Landing + Marca | **Demo end-to-end** | L |
| 3 | Wizard de estilo | Suena "como ella" | L |
| 4 | Voz personalizada | Paridad de voz | S–M |
| 5 | Feedback personalizado | Devolución + perfil latente | L |
| 6 | Vista de candidatos | "Mis candidatos" | S–M |
| 7 | QA, hardening y entrega | Matriz en verde | M |
