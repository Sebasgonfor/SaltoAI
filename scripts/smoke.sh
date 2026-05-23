#!/usr/bin/env bash
# Smoke test E2E reproducible — Salto.
#
# Lo que hace, en orden:
#   1. Levanta el server Next (`npm run dev`) si no hay uno escuchando.
#   2. Espera healthcheck (max 60s).
#   3. POST /api/seed?force=1 → carga los 5 perfiles demo, incluida Camila.
#   4. POST /api/necesidad → crea una necesidad de un local de Arepas.
#   5. POST /api/match → corre el match contra esa necesidad.
#   6. POST /api/feedback → marca el top match como "útil" (verifica que el
#      data flywheel persiste).
#   7. Asserta ICS > 80 para Camila ↔ Arepas.
#
# Salida:
#   exit 0  → todo verde, listo para pitch.
#   exit !=0 → algún paso falló. El error sale por stderr con contexto.
#
# Uso:
#   ./scripts/smoke.sh                  # arranca server si hace falta
#   PORT=3001 ./scripts/smoke.sh        # otro puerto
#   BASE_URL=http://prod.salto/ ./scripts/smoke.sh  # contra deploy remoto
#
# Requiere: bash, curl, jq, node/npm (para levantar el server local).

set -euo pipefail

# ---------- config ----------
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://localhost:$PORT}"
MIN_ICS="${MIN_ICS:-80}"
TARGET_NAME_RE="${TARGET_NAME_RE:-Camila}"
HEALTH_TIMEOUT_SEC="${HEALTH_TIMEOUT_SEC:-60}"

# ---------- helpers ----------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step()  { printf "${CYAN}▸ %s${NC}\n" "$*" >&2; }
ok()    { printf "${GREEN}✓ %s${NC}\n" "$*" >&2; }
warn()  { printf "${YELLOW}⚠ %s${NC}\n" "$*" >&2; }
fail()  { printf "${RED}✗ %s${NC}\n" "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1 || fail "Falta dependencia: $1"; }
need_cmd curl
need_cmd jq

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

SERVER_PID=""
cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    step "Deteniendo server (pid $SERVER_PID)"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ---------- 1. health ----------
is_up() {
  curl -fsS -o /dev/null -m 2 "$BASE_URL" 2>/dev/null
}

if is_up; then
  ok "Server ya está corriendo en $BASE_URL"
else
  if [[ "$BASE_URL" != "http://localhost:$PORT" ]]; then
    fail "BASE_URL apunta a $BASE_URL pero no responde. ¿Está el deploy arriba?"
  fi
  step "Server no responde — levantando 'npm run dev' en background"
  need_cmd npm
  npm run dev > /tmp/salto-smoke-server.log 2>&1 &
  SERVER_PID=$!
  step "Esperando healthcheck (max ${HEALTH_TIMEOUT_SEC}s, pid=$SERVER_PID)"
  for i in $(seq 1 "$HEALTH_TIMEOUT_SEC"); do
    if is_up; then ok "Server arriba tras ${i}s"; break; fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      tail -40 /tmp/salto-smoke-server.log >&2 || true
      fail "El server murió antes de responder. Ver /tmp/salto-smoke-server.log"
    fi
    sleep 1
  done
  is_up || { tail -40 /tmp/salto-smoke-server.log >&2 || true; fail "Timeout esperando $BASE_URL"; }
fi

# ---------- 2. seed ----------
step "POST /api/seed?force=1 (carga 5 perfiles demo)"
SEED_RES="$(curl -fsS -m 60 -X POST "$BASE_URL/api/seed?force=1")"
SEED_COUNT="$(echo "$SEED_RES" | jq '.results | length')"
[[ "$SEED_COUNT" -gt 0 ]] || fail "Seed sin resultados. Respuesta:\n$SEED_RES"
ok "Seed OK ($SEED_COUNT perfiles)"

# ---------- 3. crear necesidad ----------
step "POST /api/necesidad (Arepas Doña Lucha)"
NEED_BODY='{
  "companyName": "Arepas Doña Lucha",
  "rawDescription": "Abrimos nuestro primer local de arepas en Barranquilla. Somos 3 personas, sin protocolos definidos, ritmo rápido y atendemos al público directamente. Necesitamos a alguien que maneje las redes sociales (Instagram, TikTok), responda mensajes de clientes, atienda pedidos en vitrina y resuelva reclamos sin que tengamos que estar encima. Necesita aguantar caos, aprender solo y orientarse a resultados de ventas."
}'
NEED_RES="$(curl -fsS -m 60 -X POST "$BASE_URL/api/necesidad" \
  -H 'Content-Type: application/json' \
  -d "$NEED_BODY")"
NEED_ID="$(echo "$NEED_RES" | jq -r '.id // empty')"
[[ -n "$NEED_ID" ]] || fail "Necesidad sin id. Respuesta:\n$NEED_RES"
ok "Necesidad creada: $NEED_ID"

# ---------- 4. correr match ----------
step "POST /api/match (needId=$NEED_ID)"
MATCH_RES="$(curl -fsS -m 90 -X POST "$BASE_URL/api/match" \
  -H 'Content-Type: application/json' \
  -d "{\"needId\":\"$NEED_ID\"}")"

WARN="$(echo "$MATCH_RES" | jq -r '.warning // empty')"
[[ -z "$WARN" ]] || warn "El match devolvió aviso: $WARN"

MATCH_COUNT="$(echo "$MATCH_RES" | jq '.matches | length')"
[[ "$MATCH_COUNT" -gt 0 ]] || fail "Match sin candidatos. Respuesta:\n$MATCH_RES"

TOP_NAME="$(echo "$MATCH_RES" | jq -r '.matches[0].profileName')"
TOP_ICS="$(echo "$MATCH_RES" | jq -r '.matches[0].ics')"
TOP_ID="$(echo "$MATCH_RES" | jq -r '.matches[0].profileId')"

# Buscamos a Camila en el top-3, no asumimos que es la #1
CAMILA_ICS="$(echo "$MATCH_RES" | jq -r --arg re "$TARGET_NAME_RE" '
  .matches | map(select(.profileName | test($re; "i"))) | .[0].ics // empty
')"
CAMILA_ID="$(echo "$MATCH_RES" | jq -r --arg re "$TARGET_NAME_RE" '
  .matches | map(select(.profileName | test($re; "i"))) | .[0].profileId // empty
')"

printf "  Top match     : %s (ICS=%s)\n" "$TOP_NAME" "$TOP_ICS" >&2
printf "  Target match  : %s (ICS=%s)\n" "$TARGET_NAME_RE" "$CAMILA_ICS" >&2

[[ -n "$CAMILA_ICS" ]] || fail "$TARGET_NAME_RE no apareció en el shortlist. Top-3:\n$(echo "$MATCH_RES" | jq '.matches | map({name: .profileName, ics: .ics})')"

if [[ "$CAMILA_ICS" -ge "$MIN_ICS" ]]; then
  ok "$TARGET_NAME_RE ↔ Arepas: ICS=$CAMILA_ICS ≥ $MIN_ICS"
else
  fail "$TARGET_NAME_RE ↔ Arepas: ICS=$CAMILA_ICS < $MIN_ICS"
fi

# ---------- 5. feedback ----------
step "POST /api/feedback (top match → útil=true)"
FB_RES="$(curl -fsS -m 30 -X POST "$BASE_URL/api/feedback" \
  -H 'Content-Type: application/json' \
  -d "{\"needId\":\"$NEED_ID\",\"profileId\":\"$TOP_ID\",\"useful\":true,\"source\":\"empresa_match\"}")"
FB_ID="$(echo "$FB_RES" | jq -r '.id // empty')"
[[ -n "$FB_ID" ]] || fail "Feedback sin id. Respuesta:\n$FB_RES"
ok "Feedback persistido: $FB_ID"

# Verifica que el GET de feedback lo lista (data flywheel está vivo)
FB_LIST="$(curl -fsS -m 30 "$BASE_URL/api/feedback")"
FB_FOUND="$(echo "$FB_LIST" | jq --arg id "$FB_ID" '[.feedback[] | select(.id == $id)] | length')"
[[ "$FB_FOUND" == "1" ]] || warn "Feedback creado pero no aparece en el listado (sin Firestore real es esperable si el proceso se reinicia)."

# ---------- 6. cv ats ----------
step "GET /api/cv?profileId=$CAMILA_ID (one-click ATS)"
CV_HTTP="$(curl -s -o /tmp/salto-cv.html -w '%{http_code}' "$BASE_URL/api/cv?profileId=$CAMILA_ID")"
[[ "$CV_HTTP" == "200" ]] || fail "CV devolvió HTTP $CV_HTTP"
grep -q "<h1>" /tmp/salto-cv.html || fail "CV no contiene <h1> con nombre"
grep -q "$TARGET_NAME_RE" /tmp/salto-cv.html || warn "El CV no contiene el nombre esperado '$TARGET_NAME_RE'"
ok "CV ATS HTML generado (/tmp/salto-cv.html, $(wc -c < /tmp/salto-cv.html) bytes)"

printf "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
printf "${GREEN}✓ SMOKE TEST OK — listo para el pitch${NC}\n"
printf "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
exit 0
