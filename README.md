# Salto

> Matching de potencial para el primer empleo formal en LATAM. Hackathon Barranqui-IA 2026.

## Minimum demoable path

1. **Joven**: `/joven/chat` → entrevista adaptativa (3-5 turnos) con Gemini → genera **Perfil de Evidencia** con skills/traits/evidencia citada → persiste en Firestore con embedding.
2. **Empresa**: `/empresa/publicar` → describe su necesidad en lenguaje libre → Gemini estructura el rol, contexto, skills requeridos, traits deseados → persiste con embedding.
3. **Motor ICS**: `/empresa/matches/[needId]` → shortlist por similitud semántica (embeddings) + ranking explicable por LLM con desglose 4D (skills 35% · conducta 30% · aprendizaje 20% · contexto 15% − penalizaciones).

## Stack

- **Next.js 15** (App Router) + React 19 + Tailwind 4
- **API routes** (Node runtime) para toda la lógica IA
- **Gemini 2.5 Flash** para generación + `text-embedding-004` para embeddings
- **Firestore** (cliente modular) para persistencia
- Sin vector DB: cosine similarity en memoria sobre arrays guardados en Firestore (suficiente para demo y piloto temprano)

Todo el código tiene **fallback funcional sin credenciales**: si no hay `GEMINI_API_KEY` usa extractor mock + heurística de matching; si no hay Firebase, usa store en memoria. La demo funciona sin internet, pero brilla con ambas keys.

## Setup local

### 1. Dependencias

```bash
npm install
```

### 2. Credenciales

```bash
cp .env.example .env.local
```

Llena `.env.local` con:

- **`GEMINI_API_KEY`**: créala en https://aistudio.google.com/apikey
- **Firebase web config** (6 vars):
  1. Consola Firebase → crea un proyecto (o usa uno existente).
  2. Activa **Firestore** en modo "test" (reglas abiertas — ver `firestore.rules`).
  3. Project Settings → General → "Your apps" → agrega una Web app → copia el config.

### 3. Correr

```bash
npm run dev
```

App en http://localhost:3000

### 4. Cargar perfiles demo (opcional pero recomendado)

Con la app corriendo:

```bash
curl http://localhost:3000/api/seed
```

Inserta 5 perfiles con embeddings (Camila, Andrés, Luisa, Jhon, Maritza). Idempotente — `?force=1` para regenerar.

## Endpoints API

| Endpoint | Método | Función |
|---|---|---|
| `/api/entrevista` | POST | Siguiente pregunta adaptativa dado historial. Devuelve `{nextQuestion, done}`. |
| `/api/perfil` | POST | Cierre de entrevista → extracción estructurada + embedding + persistencia. Devuelve `{id, profile}`. |
| `/api/perfil?id=X` | GET | Lee perfil por ID. |
| `/api/necesidad` | POST | Estructura texto libre del founder → rol/contexto/skills/traits/restricciones + embedding + persistencia. |
| `/api/necesidad?id=X` | GET | Lee necesidad por ID. |
| `/api/match` | POST | Dado `needId`: shortlist por embeddings + ranking ICS por LLM. Devuelve top-3 con breakdown. |
| `/api/seed` | GET/POST | Carga perfiles demo. |

## Estructura

```
app/
  joven/
    chat/page.tsx              # entrevista
    perfil/page.tsx            # landing "aún no tienes perfil"
    perfil/[id]/page.tsx       # Perfil de Evidencia
  empresa/
    publicar/page.tsx          # form de necesidad
    matches/page.tsx           # landing
    matches/[needId]/page.tsx  # ranking con desglose ICS
  api/
    entrevista/route.ts
    perfil/route.ts
    necesidad/route.ts
    match/route.ts
    seed/route.ts

lib/
  types.ts                     # Profile, CompanyNeed, Match, ICS_WEIGHTS
  gemini.ts                    # cliente compartido + flag hasGeminiKey()
  embeddings.ts                # embed() + cosineSimilarity() con fallback mock
  db.ts                        # Firestore (con fallback en memoria)
  firebase.ts                  # init Firebase
  seed-data.ts                 # 5 perfiles realistas
```

## Decisiones clave

- **Anti-wrapper**: el ICS NO lo decide un LLM solo. El score es `Σ wᵢ · dimensiónᵢ − penalizaciones` donde cada dimensión la calcula el LLM con prompt determinista anclado al perfil + necesidad. Los pesos viven en `lib/types.ts` (`ICS_WEIGHTS`) y son auditable/ajustables.
- **Evidencia citada**: la extracción del perfil exige que cada skill esté anclada a una cita textual de la entrevista. Si no hay cita, no entra. Anti-alucinación.
- **Híbrido shortlist + ranking**: embeddings reducen el universo a top-5 candidatos por similitud semántica; el LLM solo califica esos 5. Escala a miles de perfiles sin pagar LLM por cada uno.
- **Fallbacks graceful**: si Gemini falla o no hay key, todo sigue funcionando con extractor mock + heurística de strings. Demo no se rompe.

## Roadmap inmediato

- Reglas Firestore por auth + ownership.
- CV ATS (one-click desde el Perfil de Evidencia).
- Feedback en cada etapa que reentrena los pesos ICS (data flywheel — ver PRD §8.6).
- Migrar `firebase` (cliente) a `firebase-admin` en API routes con service account.
