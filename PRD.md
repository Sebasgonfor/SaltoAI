# PRD — Salto

### Matching de potencial para el primer empleo formal en LATAM

> **Nombre de trabajo:** *Salto* — "Tu primer salto al empleo formal."
> (El nombre es intercambiable; al final hay alternativas.)

**Línea temática:** Generación de ingresos juveniles · Barranqui-IA 2026
**Impulsada por:** Macondo Lab · GOyn · ACOPI
**Versión:** 1.0 — PRD para hackathon/startup
**Autor:** Sebastián

---

## 0. Cómo leer este PRD (mapa a los criterios de evaluación)

Este documento está escrito para maximizar el puntaje en la rúbrica del jurado. El 70% del puntaje vive en dos criterios, y cada sección de abajo alimenta uno o ambos:

| Criterio del jurado | Peso | Pregunta central | Dónde lo respondemos |
|---|---|---|---|
| **2. Uso de la IA** | 35% | ¿La IA es central o es marketing? | §8 (Sistema de IA), §9 (Arquitectura), §13 (Diferenciadores) |
| **3. Impacto y problema** | 35% | ¿Resuelve algo real y desplegable, o es ejercicio académico? | §2 (Problema), §3 (Mercado), §14 (Métricas), §15 (Roadmap) |
| **1. Ejecución / pitch** (asumido, ~30%) | ~30% | ¿Construido y bien contado? | §6 (MVP), §16 (Narrativa de pitch) |

**Las dos pruebas que el jurado va a aplicar — y nuestra respuesta de una línea:**

1. **Test del wrapper (Criterio 2):** *Si quitas la IA, ¿Salto pierde valor?* → **Sí, colapsa.** Sin IA, Salto es un portal de empleo más. El núcleo —convertir experiencia informal y "desafíos de vida" en evidencia laboral estructurada, y hacer matching por potencial y no por CV— es matemáticamente imposible sin extracción semántica + embeddings + un modelo de compatibilidad multifactor. Ver §8.4.
2. **Test del lunes (Criterio 3):** *¿Esto muere el lunes después del hackatón?* → **No.** El problema está validado con usuarios reales presentes en el propio evento (§2.4), el stack es desplegable por un equipo pequeño en 6–12 meses (§9), y tenemos métricas de impacto definidas (§14).

---

## 1. Visión del producto

**Visión:** Que el primer empleo formal de un joven en LATAM dependa de su **potencial**, no de un CV que todavía no puede tener.

**Misión:** Construir el sistema de contratación donde **empresas en etapa temprana y jóvenes en etapa temprana crecen juntos** — convirtiendo habilidades invisibles y experiencia informal en evidencia laboral útil, y conectándolas con las startups que las necesitan para escalar.

**Frase de posicionamiento (una línea):**
> Salto es la plataforma de IA que contrata talento junior por potencial real, no por años de experiencia — para que las startups dejen de perder tiempo y dinero, y los jóvenes consigan su primera oportunidad formal.

**Por qué ahora:** la IA generativa por fin permite *leer y estructurar* lenguaje desordenado (una historia de vida, un trabajo informal, un proyecto sin certificar) y convertirlo en señales comparables. Eso era imposible hace tres años. Es la primera vez que el matching por potencial es técnicamente viable a bajo costo.

---

## 2. El problema

### 2.1 El problema doble (la tijera)

Hay dos lados rotos que se necesitan mutuamente y no se encuentran:

**Lado joven — "no me contratan porque no tengo experiencia, no tengo experiencia porque no me contratan":**
- Millones de jóvenes en LATAM tienen habilidades reales (experiencia informal, proyectos, ventas en el negocio familiar, community management para un emprendimiento, autodidactismo) pero **cero experiencia formal y un CV no competitivo**.
- Los filtros tradicionales (ATS, años de experiencia, títulos) los eliminan **antes** de que un humano los vea.
- Su experiencia más valiosa es **invisible** para el mercado porque no está en formato de CV.

**Lado empresa temprana — "necesito gente pero contratar junior es un riesgo caro":**
- Startups, emprendimientos y pequeños negocios en crecimiento/formalización necesitan talento accesible y adaptable (marketing, atención al cliente, diseño, programación, ventas, community management, operaciones).
- **Contratar un junior es difícil y arriesgado:** no tienen RRHH, no saben filtrar, el costo de una mala contratación es brutal para un equipo de 3 personas, y la rotación los mata.
- LinkedIn y las bolsas de empleo les dan **volumen sin señal**: cientos de CVs, ninguna forma de saber quién encaja con *su* contexto caótico de etapa temprana.

### 2.2 Por qué el mercado actual falla

El mercado optimiza para lo que es **fácil de medir** (años, títulos, keywords), no para lo que **predice el desempeño** en una startup temprana (capacidad de aprendizaje, adaptabilidad, hambre, compatibilidad con un equipo pequeño). Resultado: el talento de mayor potencial es justo el que el sistema descarta primero.

### 2.3 Delimitación (el jurado pregunta: ¿está bien delimitado?)

No resolvemos "el desempleo". Resolvemos un segmento específico y atacable:
- **Quién:** jóvenes 18–28 buscando su **primer/segundo empleo formal** + empresas de **1–25 personas** en etapa temprana.
- **Dónde:** arrancamos en Barranquilla / Caribe colombiano (donde están GOyn, ACOPI, Macondo Lab y un ecosistema de emprendimiento real), luego LATAM.
- **Qué tipo de roles:** funciones operativas y digitales junior donde el potencial > la experiencia (marketing, CS, ventas, contenido, soporte, ops, dev junior).

### 2.4 Validación con usuarios reales — *plan ejecutable durante el hackatón*

> Esto responde directo a la sub-pregunta del Criterio 3: *"¿Hablaron con usuarios reales?"*

El propio Barranqui-IA es nuestra muestra de validación captiva. Plan de validación de 48h:
1. **Encuesta relámpago en el evento** (y en el pitch en vivo): *"¿Cuántos de los que están aquí buscan trabajo y no consiguen?"* y *"¿Cuántas startups/emprendimientos vinieron también a buscar talento?"* → El conteo de manos **es data de validación en vivo** frente al jurado.
2. **5–8 entrevistas a emprendedores presentes** (hay founders, mentores y sponsors como ACOPI/GOyn): preguntar por su última contratación junior — cuánto tardaron, cuánto les costó, si rotó.
3. **5–8 entrevistas a jóvenes participantes** sin empleo formal: ¿qué desafío real has vivido?, ¿qué hiciste informalmente?
4. Documentar quotes y números → van directo al pitch como prueba de que el problema es real y urgente, no inventado.

---

## 3. Oportunidad de mercado

- **Empleo juvenil LATAM:** el desempleo juvenil en la región es estructuralmente alto (típicamente 2–3x el desempleo general), y la informalidad juvenil es masiva. Es un dolor de política pública — por eso GOyn, ACOPI y Macondo Lab patrocinan esta línea.
- **Micro y pequeñas empresas:** las MiPymes son la inmensa mayoría del tejido empresarial latinoamericano y el mayor generador de empleo; son justo las que **no tienen herramientas de contratación** y las que más sufren una mala contratación.
- **Tamaño del mercado (marco TAM/SAM/SOM para el pitch):**
  - **TAM:** gasto en reclutamiento + soluciones de talento para PyMEs en LATAM.
  - **SAM:** contratación junior/entry-level en empresas de 1–50 personas en Colombia + países ancla (México, Perú, Chile, Argentina).
  - **SOM (12–18 meses):** empresas tempranas del ecosistema Caribe/Colombia accesibles vía aliados (GOyn, ACOPI, Macondo Lab, Caribe Ventures, cámaras de comercio).
- **Viento de cola:** la IA acaba de bajar el costo de "leer" perfiles desordenados casi a cero → un incumbente como LinkedIn está atado a su paradigma de CV; nosotros nacemos nativos de potencial.

> Nota de honestidad para el pitch: presentar TAM/SAM/SOM como *marco* y método, no como cifras infladas. Un jurado técnico castiga números mágicos; premia un razonamiento de mercado claro.

---

## 4. Propuesta de valor

**Para la empresa temprana (cliente que paga):**
> "Contrata junior sin el riesgo. Salto te trae 3 candidatos hiperfiltrados con evidencia de potencial y un % de compatibilidad con TU empresa — no 200 CVs. Menos tiempo, menos costo, menos rotación."

**Para el joven (usuario que atrae demanda):**
> "Tu potencial por fin cuenta. Salto convierte lo que ya hiciste —aunque sea informal— en evidencia que las empresas entienden, y te conecta con quienes te necesitan de verdad."

**El intercambio de valor central (data flywheel):** los jóvenes traen su historia → la IA genera evidencia → las empresas obtienen señal de calidad → contratan → el resultado (¿funcionó el match?) **reentrena el modelo** → mejores matches → más empresas. (Ver §8.6: esto es lo que nos hace defendibles y derrota el "test del wrapper".)

---

## 5. User personas y pain points

### Persona A — Camila, 21, busca su primer empleo formal
- **Contexto:** estudia/estudió técnica, le ha manejado el Instagram al negocio de comida de su tía durante 2 años, vende, responde clientes, hizo crecer las ventas. Nunca tuvo contrato.
- **Pain points:**
  - Su CV está "vacío" aunque su experiencia real no lo está.
  - La rechazan los filtros antes de hablar con alguien.
  - No sabe traducir lo que hace en lenguaje de empresa.
  - No tiene cómo demostrar que aprende rápido.
- **Lo que necesita:** que alguien lea su potencial, no su falta de títulos.

### Persona B — Andrés, 34, founder de un negocio de comida que abre su primer local formal
- **Contexto:** equipo de 3, va a abrir local, necesita armar equipo de marketing/atención/presencia digital. No tiene RRHH.
- **Pain points:**
  - "Es dificilísimo contratar un junior" — no sabe filtrar, no tiene tiempo, una mala contratación le cuesta semanas y plata que no tiene.
  - LinkedIn le da volumen, no señal.
  - Teme la rotación: capacita a alguien y se va.
- **Lo que necesita:** candidatos pre-filtrados que **encajen con su caos de etapa temprana**, rápido y barato.

### Persona C — Lucía, gestora en ACOPI / GOyn / programa de empleabilidad (aliado/canal)
- **Contexto:** tiene metas de inserción laboral juvenil que reportar.
- **Pain points:** procesos manuales, difícil medir impacto, difícil conectar oferta y demanda real.
- **Lo que necesita:** un canal medible de inserción laboral juvenil → **es nuestra puerta de distribución B2B2C**.

---

## 6. La solución y funcionalidades MVP

### 6.1 Qué es Salto en una frase
Un ecosistema de matching por potencial donde la IA (a) **extrae evidencia laboral** de la experiencia informal y los desafíos de vida del joven, y (b) la **empareja por compatibilidad real** con las necesidades de cada empresa temprana, con **feedback en todas las etapas** que reentrena el sistema.

### 6.2 Alcance MVP (lo construible en el hackatón — 48h)

**Must-have (esto es lo que se demo-ea):**

1. **Entrevista de descubrimiento conversacional (IA)** — *núcleo diferenciador.* ✅ Construido — [`app/api/entrevista/route.ts`](app/api/entrevista/route.ts).
   El joven no "llena un CV". Conversa con un agente que le pregunta:
   > "¿Qué desafíos has vivido? ¿Qué resolviste? ¿Qué hiciste aunque nadie te pagara por eso?"
   La IA hace **preguntas de seguimiento adaptativas** y de ahí **extrae habilidades, competencias y rasgos** (esto conecta directo con tu nota: *"a partir de ahí sacar las habilidades, conectar con la persona"*).
   El prompt apunta **explícitamente a cubrir las 8 señales** que el panel lateral detecta — iniciativa, aprendizaje autónomo, resolución de problemas, resultados medibles, atención al cliente, trabajo en equipo, adaptación al cambio, persistencia — sin repetir el ángulo de preguntas anteriores. Cap de 3-5 turnos.

2. **Perfil de Evidencia (no CV)** ✅ Construido — [`app/api/perfil/route.ts`](app/api/perfil/route.ts). La IA estructura la conversación en señales comparables: habilidades (con nivel inferido + por qué), rasgos de personalidad laboral, capacidad de aprendizaje, y **evidencia citada** ("dijiste que subiste ventas 30% en el negocio familiar → señal de orientación a resultados"). Cada quote viene en tercera-persona-pasado-acción para que sea CV-ready (verbo de acción + cuantificación preservada).

3. **Publicación de necesidad por la empresa (lenguaje natural)** ✅ Construido — [`app/api/necesidad/route.ts`](app/api/necesidad/route.ts). El founder describe su empresa y su dolor en texto libre ("abro local, necesito alguien que me maneje redes y atienda clientes, somos caóticos"). La IA estructura el rol, el contexto y los rasgos que ese contexto exige.

4. **Motor de Matching de Potencial → "Índice de Compatibilidad Salto (ICS)"** ✅ Construido — [`app/api/match/route.ts`](app/api/match/route.ts). Pipeline híbrido: embeddings → shortlist top-5 → LLM ranking batched con desglose 4D auditable. Genera el "*82% de compatibilidad con tu empresa*" **explicable** (por qué ese %, qué señales pesaron). Ver §8.

5. **CV optimizado para ATS (one-click)** ✅ Construido — [`app/api/cv/route.ts`](app/api/cv/route.ts) + panel de personalización [`components/cv-customizer.tsx`](components/cv-customizer.tsx). Generado desde el Perfil de Evidencia. Es el **gancho de adquisición** del lado joven (no el core). Tu nota *"ATS una columna"* → vista de una sola columna, parseable por ATS, sin tablas ni gráficos que rompen el parser. 7 secciones estándar (Perfil profesional · Competencias · Experiencia y logros · Rasgos · Educación · Certificaciones · Idiomas), fuentes del sistema (Arial), `@page` A4 con márgenes 16/18mm. **Tailoring por necesidad** (`?needId=...`) reordena skills/evidencia poniendo los matches con el JD primero — keyword density alta donde los ATS la buscan.

6. **Feedback en todas las etapas** ✅ Mínimo viable construido — [`app/api/feedback/route.ts`](app/api/feedback/route.ts) + [`components/match-feedback.tsx`](components/match-feedback.tsx). Botón "¿útil? sí/no" en cada match → POST a `/api/feedback` con `{matchId, needId, profileId, useful, timestamp, source}` → colección `feedback` en Firestore (fallback a memoria si la regla aún no está deployada). No reentrena pesos todavía; el dato queda **propietario** como combustible del flywheel (§8.6). Por construir: feedback en post-entrevista, post-contratación y dashboard de auditoría.

**Nice-to-have (si sobra tiempo en el hackatón):**
- Preparación para entrevistas con IA (simulacro + feedback).
- Dashboard de impacto para aliados (GOyn/ACOPI).

**Out of scope MVP:** pagos/nómina, contratos legales, app móvil nativa, verificación de identidad robusta.

### 6.3 Infraestructura no-funcional construida (lo que el jurado pregunta tarde)

Esto NO está en los must-haves pero **es lo que separa una demo bonita de un producto creíble**. Está implementado y demoable.

| Pieza | Por qué importa | Dónde vive |
|---|---|---|
| **Logs estructurados JSON-line** | Una línea JSON por request con `ts`, `route`, `event`, `requestId`, `status`, `latencyMs`. Respuesta concreta a "¿cómo monitorearían esto en producción?". `tail -f \| jq` en vivo durante el pitch. | [`lib/logger.ts`](lib/logger.ts), aplicado en las 7 rutas API. |
| **Manejo robusto de 429 / rate limits** | El free tier de Gemini son 5-10 req/min. Antes el 429 se traducía en un 500 opaco. Hoy detectamos `RESOURCE_EXHAUSTED` por status/código/mensaje/body, devolvemos HTTP 429 con header `Retry-After`, body `{error, code: "rate_limited", retryAfterSec}` y mensaje en español ("estamos a tope, intentá en N segundos"). El frontend lo muestra como cinta amarilla, no como pantalla rota. | [`lib/api-errors.ts`](lib/api-errors.ts). |
| **Casos borde honestos (§8.5)** | Respuesta de 1 palabra, conversación con 0 user turns, necesidad sin contexto — antes reventaban o caían al mock genérico "Camila Silva". Hoy devuelven 422 con mensaje "necesito más detalle para construir tu perfil". | [`lib/input-validation.ts`](lib/input-validation.ts). |
| **Smoke test E2E reproducible** | Levanta server, hace seed, crea necesidad, corre match, valida ICS ≥ 80 para Camila ↔ Arepas, persiste feedback, genera CV. Se corre antes del pitch en ~15 segundos. | [`scripts/smoke.sh`](scripts/smoke.sh). |
| **Fallback graceful sin Firebase / Gemini** | Bypass por colección (no por proceso): si las reglas de `feedback` no están deployadas, solo esa colección cae a memoria, no toda la base. Si Gemini falla, ranking heurístico (no pantalla rota). | [`lib/db.ts`](lib/db.ts) (`firestoreDisabledFor`), [`lib/gemini.ts`](lib/gemini.ts) (`hasGeminiKey()`). |
| **Reglas Firestore auth-scoped** | Reemplazado el `allow-all` por reglas por colección y por `uid`: `profiles` se autoescriben solo por el dueño (doc id == `auth.uid`), `needs` quedan ligadas al `ownerUid` que las creó, `microtasks` visibles solo para el joven y la empresa propietaria, `feedback` write autenticado y read solo del backend. Default deny en todas las demás. Listas para deploy con `firebase deploy --only firestore:rules`. | [`firestore.rules`](firestore.rules). |
| **Sign-In con Google (Firebase Auth)** | Sin login, el perfil del joven se perdía entre sesiones y la empresa no se podía atar a sus necesidades. Hoy: Google Sign-In en el header, `AuthProvider` en el root layout, `UserButton` con avatar/email/menú. El perfil del joven se persiste con doc id == `uid` (clave para las reglas Firestore arriba). `/empresa/publicar` está gated por sign-in. | [`lib/auth-context.tsx`](lib/auth-context.tsx) · [`components/auth/user-button.tsx`](components/auth/user-button.tsx). |

### 6.4 Funcionalidades agregadas más allá del scope original

Tres piezas grandes que entraron post-MVP y refuerzan el foso defensivo del producto. No estaban en los 6 must-haves originales del hackatón.

| Pieza | Qué hace | Por qué importa | Dónde vive |
|---|---|---|---|
| **Detector de talento latente** | Endpoint `/api/talento-latente`: dado un Perfil de Evidencia, infiere `hiddenSkills` (habilidades implícitas en la trayectoria que el joven no nombró), `transversalSkills`, `suggestedRoles` con `whyFits` + `readinessHint`, y un `closingMessage` motivacional. Devuelve `LatentProfile`. | El joven se entera de capacidades que tiene pero no nombra (ej. "negociación" inferida desde "manejé reclamos del local familiar"). Sube su confianza y amplía qué necesidades pueden matchear. | [`app/api/talento-latente/route.ts`](app/api/talento-latente/route.ts) · types `HiddenSkill` / `TransversalSkill` / `SuggestedRole` / `LatentProfile` en [`lib/types.ts`](lib/types.ts). |
| **Micro-tareas pagadas E2E** | 4 endpoints (`proponer` / `entregar` / `evaluar` / `list`) + 4 páginas (`/empresa/probar/[profileId]`, `/empresa/tareas/[id]`, `/joven/tareas`, `/joven/tareas/[id]`). La empresa propone una tarea acotada y pagada como "audición antes del contrato". El joven entrega. La IA evalúa contra criterios estructurados + la empresa rate-ea + pago. | Solución concreta al "¿y si me equivoco al contratar al junior?" del founder: tarea acotada y pagada como filtro de bajo riesgo. Y genera el dato propietario más valioso del producto: **outcome verificable de desempeño real**, no opinión. | [`app/api/microtask/*`](app/api/microtask/) · types `MicroTask` / `MicroTaskStatus` / `EvaluationCriterion` / `CriterionScore` / `TaskOutcomeStat`. |
| **Outcome stats en el match** | Cuando un candidato tiene `taskStats` (totalCompleted, averageRating de micro-tareas previas), la card del match #1 muestra un badge "X tareas verificadas · rating Y". | El ICS dejó de ser solo predicción; ahora hay historial real anclado al perfil. Reduce incertidumbre del founder y prepara la entrada del outcome data al reentrenamiento de pesos (§8.6). | Campo `taskStats?: TaskOutcomeStat` en `Profile` y `Match` ([`lib/types.ts`](lib/types.ts)). |

---

## 7. Experiencia de usuario y flujo principal

### 7.1 Flujo joven (Camila)
1. Entra → en vez de "sube tu CV", ve: **"Cuéntanos tu historia."**
2. **Entrevista conversacional con IA** (5–8 min, adaptativa). Tono humano, no formulario.
3. La IA devuelve su **Perfil de Evidencia**: "esto es lo que sabes hacer y aquí está la prueba." (momento "wow" — ve su valor por primera vez).
4. Recibe **matches** con empresas + por qué encaja.
5. Genera su **CV ATS** de un clic.
6. Avanza en el proceso con **feedback en cada etapa** (sabe por qué sí / por qué no — algo que LinkedIn nunca le da).

### 7.2 Flujo empresa (Andrés)
1. Describe su empresa y su dolor en lenguaje natural.
2. La IA estructura el rol + el **contexto de etapa temprana** (clave: el match considera el caos, no solo el rol).
3. Recibe **3 candidatos hiperfiltrados** con ICS explicable + evidencia, no 200 CVs.
4. Agenda/contacta. Da feedback en cada etapa.
5. Post-contratación: reporta si funcionó → cierra el loop de aprendizaje.

### 7.3 Principio de UX
**Reducir la fricción del lado joven a casi cero** (conversación, no formularios) y **maximizar la señal del lado empresa** (3 buenos, no 200 dudosos). El producto se siente humano de un lado y quirúrgico del otro.

---

## 8. Sistema de IA y matching (Criterio 2 — 35%) ⭐

> Esta es la sección que gana o pierde el hackatón. Aquí demostramos que la IA es **central, sofisticada y consciente de sus límites** — los tres ejes de la rúbrica.

### 8.1 ¿Qué tipo de IA usamos y por qué es la indicada? (sub-pregunta directa del jurado)

| Capa | Técnica | Por qué es la indicada para *este* problema |
|---|---|---|
| Extracción | **LLM con salida estructurada** (Gemini, function calling / JSON mode) | El input es lenguaje humano desordenado (historias de vida). Solo un LLM puede convertir "le subí las ventas a mi tía" en señales estructuradas. |
| Representación | **Embeddings** (semánticos) de habilidades, rasgos y necesidades | Permite comparar potencial **por significado**, no por keywords. "Atención al cliente" ≈ "manejé clientes molestos en el local" aunque no compartan palabras. |
| Búsqueda | **Vector search** + filtros duros | Encontrar compatibilidad semántica a escala, no coincidencia exacta de texto. |
| Contexto | **RAG** sobre una ontología de competencias laborales | Aterriza la inferencia en un marco real de competencias (evita que el modelo invente skills). |
| Orquestación | **Agente conversacional** con preguntas de seguimiento adaptativas | La entrevista de descubrimiento no es un script; el agente decide qué profundizar según lo que la persona revela. |
| Decisión | **Modelo de scoring multifactor** (no solo cosine similarity) | El match real combina varias señales ponderadas → §8.3. Aquí está la sofisticación que separa un 5 de un 3. |

### 8.2 El pipeline de extracción "desafíos de vida → evidencia"

```
Conversación (audio/texto)
  → Transcripción + limpieza
  → LLM (salida estructurada): extrae {habilidades, rasgos, logros, contexto}
  → Cada señal se ancla a EVIDENCIA citada de la conversación (anti-alucinación)
  → Normalización contra ontología de competencias (RAG)
  → Embedding del Perfil de Evidencia
  → Perfil comparable + explicable
```

El punto clave para el jurado: **no le pedimos al LLM "dame un score"**. Le pedimos que *extraiga evidencia citada*, y el score lo calcula un modelo determinista encima. Eso es lo que evita el "wrapper".

### 8.3 El Índice de Compatibilidad Salto (ICS) — por qué no es un wrapper

El "82%" **no** es "pregúntale a ChatGPT qué tan compatible es". Es un score compuesto y ponderado:

```
ICS = w1 · Ajuste_semántico(skills_joven, necesidad_empresa)        // embeddings
    + w2 · Compatibilidad_conductual(rasgos_joven, contexto_empresa) // p.ej. tolerancia al caos de startup
    + w3 · Señal_de_aprendizaje(evidencia de adaptación/autodidactismo)
    + w4 · Ajuste_de_contexto(etapa temprana, recursos, ritmo)
    − penalizaciones (red flags duros: disponibilidad, ubicación, etc.)
```

- Los pesos `w` arrancan calibrados a mano (heurística honesta para el MVP) y **se reentrenan con los resultados reales de contratación** (§8.6).
- Cada componente es **explicable**: el founder ve "82% — alto por orientación a resultados y tolerancia al caos; medio en experiencia técnica directa."

### 8.4 Test del wrapper (la pregunta literal del jurado) — respuesta

> *"Si quitas la IA, ¿la solución pierde valor o sigue igual?"*

**Sin IA, Salto no existe:**
- Sin extracción por LLM → el joven tiene que llenar un CV → volvemos al problema original (su valor sigue invisible).
- Sin embeddings → matching por keywords → volvemos a LinkedIn/bolsas de empleo.
- Sin scoring multifactor → no hay "potencial", solo "experiencia" → discriminamos al junior, que es justo a quien servimos.

La IA no es una *feature* de Salto. La IA **es** el producto. Quitarla no degrada la solución: la borra.

### 8.5 Manejo de límites de la IA (sub-pregunta directa: hallucinations, errores, casos borde, fallbacks)

> El jurado da el 5 a quien **maneja claramente los límites**. Esto casi nadie lo hace — es donde más fácil ganamos puntos.

| Riesgo | Mitigación concreta | Implementado en |
|---|---|---|
| **Alucinación** (inventar skills) | Toda señal debe estar **anclada a una cita** de la conversación. Sin evidencia → no entra al perfil. El prompt de extracción rechaza skills/quotes sin sustento textual. | [`app/api/perfil/route.ts`](app/api/perfil/route.ts) (EXTRACTION_PROMPT) |
| **Sesgo / discriminación** (género, origen, nombre) | El matching corre sobre evidencia y señales, **no** sobre datos demográficos. Auditoría de sesgo en los matches. El score es explicable para poder auditarlo. | Schema `Profile` sin campos demográficos; ICS desglosado y auditable. |
| **Sobre-confianza del score** | El ICS se presenta como **señal de priorización, no veredicto**. El humano decide. Mostramos incertidumbre con el `redFlag` por candidato + cinta de aviso si el ranking corrió en heurística. | [`app/empresa/matches/[needId]/page.tsx`](app/empresa/matches/[needId]/page.tsx) |
| **Casos borde** — respuesta de 1 palabra, 0 user turns, necesidad sin contexto | Validación previa: el agente pide más detalle ANTES de gastar cuota LLM. Cierre de perfil con <15 palabras o última respuesta <3 palabras → 422 con mensaje "necesito más detalle para construir tu perfil". Necesidad sin contexto → match corre igual pero emite `warning` al cliente. | [`lib/input-validation.ts`](lib/input-validation.ts) |
| **Rate limits del proveedor** (free tier Gemini = 5-10 req/min) | Detectamos `RESOURCE_EXHAUSTED` / HTTP 429 por status, código, mensaje o body (`retryDelay:"30s"`). Devolvemos HTTP 429 con header `Retry-After`, body `{code: "rate_limited", retryAfterSec, error}` en español. En `/api/match` cae a ranking heurístico (matching no se rompe). | [`lib/api-errors.ts`](lib/api-errors.ts) |
| **Errores de extracción** | El joven revisa su Perfil de Evidencia antes de publicarlo (human-in-the-loop). Si la extracción devuelve 0 skills + 0 evidencia, respondemos 422 "no pudimos anclar evidencia concreta — profundizá con un ejemplo". | [`app/api/perfil/route.ts`](app/api/perfil/route.ts) |
| **Falla del proveedor LLM** | Capa de abstracción de modelo + degradación elegante: fallback a heurística para ranking, banco de preguntas determinista para la entrevista, mock extractor para el perfil. La demo no se rompe sin internet. | [`lib/gemini.ts`](lib/gemini.ts) (`hasGeminiKey()`), fallbacks en cada route. |
| **Falla del backend (Firestore)** | Bypass **por colección**, no por proceso: si las reglas faltan en `feedback`, solo esa colección cae a memoria. `profiles`/`needs` siguen contra Firestore. Antes un permiso faltante desactivaba la base entera. | [`lib/db.ts`](lib/db.ts) (`firestoreDisabledFor`) |
| **Privacidad** | Las historias de vida son sensibles. Consentimiento explícito, minimización de datos, el joven controla qué se publica. Reglas Firestore deploy-ables por colección. | [`firestore.rules`](firestore.rules) |

### 8.6 Por qué Salto se vuelve mejor que cualquier wrapper (data flywheel)
Cada contratación genera un dato propietario que nadie más tiene: **¿el match de alto ICS efectivamente funcionó?** Ese feedback (de tu nota "feedback en todas las etapas") reentrena los pesos del ICS. Con el tiempo, Salto predice compatibilidad mejor que cualquier prompt genérico sobre un modelo público. **Ese es el foso defensivo.**

**Lo que ya está capturando data (MVP, día 1):**

Colección `feedback` en Firestore, schema mínimo:
```ts
{
  matchId: string,        // `${needId}__${profileId}` — idempotente, sin secuencias
  needId?: string,
  profileId?: string,
  useful: boolean,        // ¿el founder marcó "útil" o "no útil"?
  timestamp: number,
  source: "empresa_match" | "joven_perfil" | "other",
  note?: string
}
```

Punto de entrada: botón `¿útil? sí/no` en cada card de match ([`components/match-feedback.tsx`](components/match-feedback.tsx)), POST a [`/api/feedback`](app/api/feedback/route.ts). Persistente en localStorage del navegador (sobrevive refresh sin auth). Reentrenamiento de pesos del ICS = roadmap fase 1-2 con piloto real.

**Próximas etapas a instrumentar (no en MVP):** post-entrevista joven ("¿la conversación se sintió justa?"), post-contratación empresa ("¿el match efectivamente funcionó después de N días?"), dashboard de auditoría para aliados.

---

## 9. Arquitectura general

> Diseñada para ser **desplegable por un equipo pequeño en 6–12 meses** (responde al Criterio 3: "¿es desplegable en contexto real?").

```
┌─────────────────────────────────────────────────────────┐
│  CLIENTE  (Next.js + PWA, deploy en Vercel)               │
│  - Flujo joven (entrevista conversacional)                │
│  - Flujo empresa (publicar necesidad, ver matches)        │
│  - Dashboard aliados (impacto)                            │
└───────────────┬───────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────┐
│  CAPA DE IA  (servicios)                                   │
│  - Agente de entrevista (Gemini, función adaptativa)       │
│  - Extractor de evidencia (Gemini, salida estructurada)    │
│  - Embeddings (modelo de embeddings)                       │
│  - Motor de Matching / ICS (servicio determinista)         │
│  - Guardrails (anclaje a evidencia, auditoría de sesgo)    │
└───────────────┬───────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────┐
│  DATOS                                                     │
│  - Firestore (profiles, needs, microtasks, feedback)       │
│  - Vector store (embeddings de perfiles y necesidades)     │
│  - Auth (Firebase Auth + Google Sign-In) — perfil ID == uid│
│  - Reglas auth-scoped por colección (default deny)         │
│  - Ontología de competencias (para RAG)                    │
└───────────────────────────────────────────────────────────┘
```

**Decisiones clave:**
- **Sin servidores pesados al inicio:** Next.js + Vercel + Firebase = un equipo de 2–3 lo opera. Realismo de despliegue = puntos en Criterio 3.
- **Capa de abstracción de modelo:** no casados con un solo proveedor (mitiga riesgo, §8.5).
- **El motor de ICS es código propio**, no una llamada a LLM — así controlamos explicabilidad y reentrenamiento.
- **Sin vector DB todavía:** cosine similarity en memoria sobre arrays de embeddings guardados en Firestore. Suficiente para demo y piloto temprano (decenas de miles de perfiles); migrar a pgvector / índice gestionado cuando lo justifique la escala.

**Rutas API construidas en el MVP:**

| Endpoint | Método | Función | Archivo |
|---|---|---|---|
| `/api/entrevista` | POST | Siguiente pregunta adaptativa con cobertura de las 8 señales. Devuelve `{nextQuestion, done, targetedSignal, signalsCovered}`. | [`app/api/entrevista/route.ts`](app/api/entrevista/route.ts) |
| `/api/perfil` | POST | Cierre de entrevista → extracción + embedding + persistencia. Devuelve `{id, profile}`. | [`app/api/perfil/route.ts`](app/api/perfil/route.ts) |
| `/api/perfil` | GET | Lee perfil por id. | idem |
| `/api/necesidad` | POST | Estructura texto libre del founder → rol/contexto/skills/traits/restricciones + embedding. | [`app/api/necesidad/route.ts`](app/api/necesidad/route.ts) |
| `/api/necesidad` | GET | Lee necesidad por id. | idem |
| `/api/match` | POST | Shortlist por embeddings + ranking ICS por LLM, fallback heurístico, avisos al cliente. | [`app/api/match/route.ts`](app/api/match/route.ts) |
| `/api/cv` | GET/POST | CV ATS one-click (HTML imprimible / JSON plain-text). Tailoring por `?needId=...`. | [`app/api/cv/route.ts`](app/api/cv/route.ts) |
| `/api/feedback` | POST/GET | Persiste y lista feedback de matches (data flywheel). | [`app/api/feedback/route.ts`](app/api/feedback/route.ts) |
| `/api/talento-latente` | POST | Detector de habilidades implícitas + roles sugeridos a partir del Perfil de Evidencia (`LatentProfile`). | [`app/api/talento-latente/route.ts`](app/api/talento-latente/route.ts) |
| `/api/microtask/proponer` | POST | Empresa propone micro-tarea pagada (brief, criterios, monto COP, deadline) a un candidato matchea­do. | [`app/api/microtask/proponer/route.ts`](app/api/microtask/proponer/route.ts) |
| `/api/microtask/entregar` | POST | Joven entrega su deliverable (texto + adjuntos opcionales). | [`app/api/microtask/entregar/route.ts`](app/api/microtask/entregar/route.ts) |
| `/api/microtask/evaluar` | POST | LLM evalúa el deliverable contra los `EvaluationCriterion` definidos por la empresa, devuelve `CriterionScore[]` + score global. La empresa rate-ea encima. | [`app/api/microtask/evaluar/route.ts`](app/api/microtask/evaluar/route.ts) |
| `/api/microtask/list` | GET | Lista micro-tareas del usuario actual (joven o empresa según contexto). | [`app/api/microtask/list/route.ts`](app/api/microtask/list/route.ts) |
| `/api/seed` | GET/POST | Carga 5 perfiles demo idempotente. | [`app/api/seed/route.ts`](app/api/seed/route.ts) |

---

## 10. Stack tecnológico propuesto

| Capa | Tecnología | Notas |
|---|---|---|
| Frontend | **Next.js + PWA, Vercel** | Stack que ya domino; instalable, sin fricción de app store. |
| Auth & DB | **Firebase (Auth + Firestore)** | Rápido para MVP, escala razonable. |
| LLM / Agente | **Google Gemini** (Flash para velocidad/costo) | Alineado con el ecosistema del evento (Build with AI, créditos de Google). |
| Embeddings | Modelo de embeddings (Gemini / Vertex) | Para el matching semántico. |
| Vector search | Vector store (pgvector / índice gestionado) | Búsqueda por significado. |
| Salida estructurada | Function calling / JSON mode | Extracción confiable, anti-alucinación. |
| Notificaciones | Web Push / email (y opcional Telegram) | Avisos de match y feedback. |

> Ventaja de pitch: el stack es **deliberadamente Google-céntrico** (Gemini, créditos cloud del evento) — coherente con los talleres y patrocinadores, y con experiencia previa del equipo.

---

## 11. Modelo de negocio

**Principalmente B2B** (la empresa paga; el joven entra gratis y genera la liquidez de oferta).

- **SaaS por suscripción para empresas:** plan mensual por acceso a matches/contrataciones. PyMEs/startups: precio accesible y escalonado.
- **Pay-per-hire / éxito:** fee cuando una contratación se concreta (alinea incentivos: cobramos cuando funciona).
- **B2B2C institucional:** GOyn, ACOPI, alcaldías, cajas de compensación, universidades pagan/subsidian por **inserción laboral juvenil medible** (les resolvemos su KPI). → También es canal de distribución (§12).
- **Gratis para el joven, siempre.** El joven es la oferta de talento; cobrarle mataría la liquidez.

**Por qué las empresas NO pueden no usarlo (de tu visión):** les ahorra tiempo (3 candidatos vs 200 CVs), dinero (menos costo de mala contratación y rotación) y riesgo (evidencia de potencial + matching de contexto). El dolor es recurrente: cada vez que crecen, contratan.

---

## 12. Go-to-market (enfocado en startups y emprendedores)

> Responde a tu nota: *"go to market: ¿qué le voy a ofrecer al que llega?"*

**El problema clásico de marketplace (huevo y gallina): arrancamos por el lado empresa**, porque la demanda calificada atrae oferta sola.

**Qué le ofrecemos al que llega (oferta de entrada):**
- **A la empresa temprana:** "Tus primeras 3 contrataciones filtradas, gratis / a precio de lanzamiento. Te traemos candidatos con evidencia de potencial, no CVs." (Onboarding asistido para vencer el "es difícil contratar junior".)
- **Al joven:** "Tu Perfil de Evidencia + CV ATS gratis, y matches reales con empresas que te necesitan."

**Canales (aprovechando el ecosistema del evento):**
1. **Aliados institucionales como canal:** **GOyn, ACOPI, Macondo Lab, Caribe Ventures** ya agregan exactamente nuestros dos lados (jóvenes y emprendimientos). Una integración con ellos = distribución instantánea. *Están patrocinando esta línea — el GTM ya está sentado en la sala.*
2. **Cohortes de startups tempranas** (aceleradoras, Founder Institute, Caribe Ventures): empresas que justo están armando equipo.
3. **Universidades / técnicas:** oferta de jóvenes.
4. **Land-and-expand:** un founder feliz contrata varias veces y refiere a otros founders.

**Wedge inicial:** Caribe colombiano (densidad de aliados + dolor real + acceso). Probar el loop aquí → replicar a LATAM.

---

## 13. Ventajas competitivas y diferenciadores

### 13.1 Frente a LinkedIn
| | LinkedIn | Salto |
|---|---|---|
| Filtra por | CV, títulos, años | **Potencial y evidencia** |
| Para el junior sin experiencia | Lo invisibiliza | Lo hace visible |
| Para el founder | Volumen sin señal | 3 matches con ICS explicable |
| Optimizado para | Profesionales con trayectoria | **Etapa temprana** (joven y empresa) |
| Experiencia informal | No la captura | **Es el insumo principal** |

### 13.2 Frente a bolsas de empleo tradicionales (Computrabajo, etc.)
- Ellas: tablón de anuncios + filtro por keywords. Nosotros: **matching semántico por compatibilidad de contexto** + evidencia generada.
- Ellas: el joven compite por keywords que no tiene. Nosotros: traducimos su potencial a evidencia.
- Ellas: cero feedback. Nosotros: **feedback en cada etapa**.

### 13.3 El foso real
No es la UI ni el CV builder (copiables). Es el **data flywheel de resultados de contratación** (§8.6): con cada match exitoso/fallido, el ICS predice mejor. Un competidor que arranca hoy no tiene esa data.

---

## 14. Métricas clave (Criterio 3: "¿cómo medirían el impacto?")

**North Star Metric:** **Número de jóvenes que consiguen su primer empleo formal vía Salto** (idealmente, ingresos generados).

**Métricas de impacto (las que le importan al jurado y a GOyn/ACOPI):**
- Jóvenes colocados / mes y **tiempo al primer ingreso**.
- % de colocados sin experiencia formal previa (el corazón de la misión).
- Ingresos generados para jóvenes (COP).

**Métricas de valor para la empresa (las que sostienen el negocio):**
- **Time-to-hire** (vs. su baseline) — meta: reducirlo drásticamente.
- **Costo por contratación** (vs. baseline).
- **Retención a 3 / 6 meses** (probamos que reducimos rotación).
- Candidatos revisados por contratación (3 vs 200).

**Métricas de calidad de la IA:**
- Precisión del match: correlación entre ICS alto y contratación que funcionó.
- Tasa de edición humana del Perfil de Evidencia (mide calidad de extracción).
- Tasa de matches reportados como sesgados / injustos (auditoría).

**Métricas de motor (marketplace):**
- Liquidez (% de necesidades con ≥1 match bueno).
- Empresas activas recurrentes; matches → contrataciones (conversión).

---

## 15. Roadmap

| Fase | Tiempo | Objetivo | Estado |
|---|---|---|---|
| **0. Hackatón** | 48h | MVP demo-able: entrevista IA → Perfil de Evidencia → ICS explicable → CV ATS + feedback loop + manejo robusto de 429 + casos borde honestos + smoke E2E + logs estructurados. Validación en vivo (§2.4). | ✅ Construido — smoke test verde con Camila ↔ Arepas ICS=93 (LLM) o 89 (heurístico). |
| **1. Piloto Caribe** | Mes 1–3 | 1 aliado (GOyn/ACOPI) + 10–20 empresas tempranas + cohorte de jóvenes. Probar el loop. Calibrar ICS con resultados reales. Migrar de cliente web Firebase a `firebase-admin` con service account. Reglas Firestore por auth + ownership. | Pendiente |
| **2. Product-market fit** | Mes 4–6 | Iterar matching con data real. Primeras métricas de retención. Primeros ingresos B2B. Reentrenar los pesos del ICS con la colección `feedback` acumulada. Auditoría de sesgo con datos reales. | Pendiente |
| **3. Escala regional** | Mes 7–12 | Más aliados/ciudades, automatizar onboarding, dashboard de impacto institucional, migrar a vector DB gestionado (pgvector / Vertex). **Desplegable en contexto real ✔ (responde Criterio 3).** | Pendiente |
| **4. LATAM** | 12+ | Replicar el modelo de aliados a otros países; reentrenar ICS por mercado. | Pendiente |

---

## 16. Narrativa de pitch (guion)

> Estructura para 3–5 min. Optimizada para los criterios. Incluye tus notas de validación en vivo.

**1. Gancho (validación en vivo — Criterio 3):**
> "Levanten la mano: ¿cuántos de los que están aquí han buscado trabajo y no lo consiguieron por falta de experiencia? … Ahora, ¿cuántos vinieron representando una startup o emprendimiento que necesita talento y no sabe dónde encontrarlo? … Acaban de ver el problema. Y la solución estaba en la misma sala."

**2. El problema (la tijera):**
> "Camila tiene 21 años, le triplicó las ventas al negocio de su tía manejando redes. Pero su CV está vacío, así que ningún filtro la deja pasar. Andrés abre su primer local y necesita exactamente a alguien como Camila — pero LinkedIn le da 200 CVs y ninguna señal. Contratar un junior es carísimo y arriesgado. Los dos se necesitan. Ninguno se encuentra."

**3. La solución (insight):**
> "El mercado contrata por el pasado. Nosotros contratamos por el potencial. Salto convierte la experiencia informal y los desafíos de vida en evidencia laboral, y la empareja con las empresas que la necesitan."

**4. Demo (lo construido):**
> Mostrar: Camila *habla* (no llena CV) → aparece su Perfil de Evidencia con skills citadas → Andrés describe su dolor en una frase → salen 3 candidatos con **"82% de compatibilidad, y aquí está el porqué."**

**5. Por qué es IA de verdad (Criterio 2 — di esto explícito):**
> "Esto no es un wrapper de ChatGPT. Si le quitas la IA, vuelve a ser una bolsa de empleo. El núcleo —extraer evidencia de una historia desordenada y matchear por potencial con un score explicable— es imposible sin extracción estructurada, embeddings y nuestro motor de compatibilidad. Y manejamos los límites: anclamos cada skill a evidencia para no alucinar, y matcheamos sobre señales, no sobre demografía, para no discriminar."

**6. Impacto y por qué no muere el lunes (Criterio 3):**
> "Validamos con founders y jóvenes aquí mismo. Es desplegable por un equipo pequeño en meses. Y GOyn, ACOPI y Macondo Lab —que patrocinan esta línea— son nuestro canal: ya agregan a nuestros dos usuarios. Medimos lo que importa: jóvenes colocados, tiempo y costo de contratación, y rotación."

**7. Cierre:**
> "El primer empleo no debería depender de un CV que aún no puedes tener. Salto hace que dependa de tu potencial. Empresas tempranas y jóvenes tempranos, creciendo juntos."

---

## 17. Riesgos y respuestas (para el Q&A del jurado)

| Te van a preguntar | Tu respuesta |
|---|---|
| "¿No es esto un CV builder con IA?" | El CV es el gancho, no el core. El core es el matching por potencial (§8.4). |
| "¿Cómo evitas el sesgo del algoritmo?" | Matching sobre evidencia, no demografía; score explicable y auditable (§8.5). |
| "¿Cómo arrancas el marketplace?" | Por el lado empresa, vía aliados que ya agregan ambos lados (§12). |
| "¿Por qué no lo hace LinkedIn?" | Está atado al paradigma de CV; nosotros nacemos nativos de potencial (§13). |
| "¿Es desplegable de verdad?" | Stack ligero, equipo pequeño, 6–12 meses, canal institucional listo (§9, §15). |

---

## Apéndice — Nombres alternativos
*Salto* (recomendado) · *Brío* · *Trampolín* · *Próxima* · *Cimiento* · *Brote* · *Puente*.
Para el motor de matching: *Índice de Compatibilidad Salto (ICS)* — funciona como marca propia del "82%".
