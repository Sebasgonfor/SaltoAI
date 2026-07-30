# Benchmark: Mappa.ai → qué adoptar en SaltoAI

> Análisis de mappa.ai (jun 2026) como referencia de posicionamiento y UX, no como blueprint técnico.
> Mappa: voz → biomarcadores conductuales, talento **senior LATAM → empresas US**, seed US$3.4M (Draper).
> SaltoAI: conversación de texto → **evidencia citada**, **jóvenes sin CV → startups**, micro-tareas.
> Son **tesis adyacente**, no competencia directa (segmentos distintos).

---

## A. Teardown del onboarding

### A.1 Candidato (lo más relevante para nosotros)

Flujo real de Mappa (sección "How it works" → *"One chat with Maria, our WhatsApp assistant. That's the whole application."*):

| Paso | Qué hace | Copy verbatim |
|---|---|---|
| 01 — Aplicar | Mensaje a **Maria** (asistente IA por **WhatsApp**): **1 audio de 10s + link de LinkedIn**. | *"That's it"* |
| 02 — Seguir | Estado en tiempo real bajo demanda, por WhatsApp. | *"Anxiously awaiting results? Get real-time status updates whenever you want"* |
| 03 — Explorar | Pregunta por vacantes a Maria; ella sugiere el *fit*. | — |

Patrones de fricción/ansiedad:
- **"The quickest application on earth"** · *"one minute away from finding your fit"* (urgencia sin presión).
- **Canal familiar**: WhatsApp, no un formulario web.
- **Salarios visibles** en el job board.
- **Validación emocional**, no de papel: *"Fit you can feel"*, *"where you're not just a good fit on paper"*.
- Cero CV obligatorio: *"Get matched by who you are, not what your CV says"*.

### A.2 Empresa / reclutador

Servicio **Hire** (individuos) — sección "How it works":

| Paso | Qué hace | Notas |
|---|---|---|
| 01 — Tell us what you need | Rol, dinámica de equipo, criterios de éxito. | *"Cost- and risk-free"* |
| 02 — We search for the best fit | Background + análisis conductual por voz (más allá del CV). | — |
| 03 — Ready-to-hire candidates | **Shortlist curado en 48h** con *behavioral insights*. | *"Within 48 hours…"* |

Servicio **Scout** (arma un squad) — *"You deal with one PM. That's it."*: Select PM → Scope roadmap → el squad entrega.

Elementos de confianza:
- **Pricing por resultado**: *"You don't pay until you hire"* / *"You only pay when you receive what we agreed upon"*.
- **Sin mínimo / sin compromiso**, recalibración: *"We'll keep working… until you find the right match"*.
- Propuesta núcleo: *"Forget reading resumes. We've built a new way to hire, based on data-backed predictions about compatibility."*

### A.3 Lo que hace bien (patrones a robar)
1. **Una sola acción para aplicar** (1 audio + 1 link). Fricción casi cero.
2. **Canal nativo del usuario** (WhatsApp), no obligan a entrar a una web.
3. **Loop de estado proactivo** que mata la ansiedad del candidato.
4. **Transparencia de salario** desde el job board.
5. **Narrativa por resultado** (retención / *fit*), no por features.
6. **Pricing alineado al éxito** baja la barrera de entrada del reclutador.

### A.4 Lo que NO copiar
- **Inferir rasgos desde la voz**: sesgo, validez científica débil, privacidad. Para jóvenes vulnerables es éticamente delicado. Nuestra **evidencia citada y auditable** es mejor defensa y diferenciador.
- Su **segmento** (seniors → US). Copiar su modelo de staffing nos sacaría de la misión.

---

## B. Qué adoptar en SaltoAI (priorizado)

### P0 — Alto impacto, bajo costo
1. **Estado proactivo del joven (anti-ansiedad).**
   Hoy mostramos "visible para empresas" y el inbox. Falta un **timeline de estado claro**: "tu perfil fue visto", "estás en shortlist de X", "una empresa te propuso tarea". Ya tenemos `activityTimeline` en `/api/dashboard/joven` y el `HistoryCard` — exponerlo también arriba del perfil/dashboard como estado de "qué está pasando con mi candidatura".
2. **Salarios/pago visibles.** En micro-tareas ya mostramos `amountCOP`. En oportunidades (`/joven/conectar`) y en el match, mostrar rango de pago esperado donde exista. Transparencia = confianza.
3. **Narrativa por resultado en el copy.** Hoy vendemos "Perfil de Evidencia". Sumar el ángulo outcome: "trabajos reales pagados antes del primer contrato", "evidencia que retiene". Alinear landing + dashboard.

### P1 — Medio plazo
4. **Intake por WhatsApp (la apuesta grande).**
   Hoy la entrevista vive en `/joven/chat` (web). Un **bot de WhatsApp** que haga la entrevista conversacional (texto, no voz) sería enorme para jóvenes LATAM: cero instalación, canal familiar, retomar cuando quieran. Mismo motor de extracción de evidencia detrás. Empezar por: notificaciones de estado por WhatsApp (más barato), luego entrevista completa.
5. **Intake del reclutador ultra-simple.**
   Mappa: el reclutador describe "el problema a resolver" y la IA arma el perfil + redacta la vacante. Nuestro wizard de reclutador (`/r/[slug]`, entrevistador personalizable) puede añadir un modo "**describe en 2 frases a quién necesitas → te armamos la necesidad/ICS**", autogenerando criterios en vez de formularios largos.
6. **Pricing/empaque por resultado para la empresa.** Comunicar el modelo de micro-tarea como "paga por evidencia real de trabajo, no por un CV" — es nuestro equivalente honesto a *"pay only if it works"*.

### P2 — Estratégico / opcional
7. **Verificación de identidad del joven.** Hoy verificamos skills por documento; no verificamos *identidad*. Mappa usa voz como biométrico anti-suplantación. Nosotros podríamos usar un método liviano (verificación de teléfono/WhatsApp, o documento de identidad opcional) sin caer en biometría de voz.
8. **"Evidencia/ICS as an API" (Conduit-like).** A futuro, exponer el Perfil de Evidencia/ICS como API para ATS o partners. Es la vía B2B que Mappa ya empaquetó (Conduit). No ahora, pero anótalo en la visión.

### Lo que explícitamente NO hacemos
- Predicción de rasgos por voz / biomarcadores. Mantenemos **"sin cita, no entra"** como principio anti-alucinación y ético.
- Pivotar a talento senior para empresas US.

---

## Resumen de una línea
De Mappa robamos **fricción cero + canal WhatsApp + estado proactivo + transparencia de pago + narrativa por resultado**; descartamos **la voz-como-juez**. Nuestro foso sigue siendo la **evidencia citada para jóvenes sin CV**.

## Fuentes
- https://mappa.ai/ · https://mappa.ai/candidates/get-matched · https://mappa.ai/services/hire-individuals · https://mappa.ai/services/build-a-team
- Refresh Miami (seed $3.4M) · TechCrunch Disrupt 2025 · análisis Seven Square (voz/limitaciones)
