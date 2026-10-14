#!/bin/bash
# FLODE release gate — run before every release, release only when it is green
# for exactly the commit that goes out (see dev/gate/README.md).
#
#   dev/gate/gate.sh                full gate (about 5 minutes)
#   dev/gate/gate.sh --only STEP    one step: static|cards|roundtrip|actions|visual (doesn't count)
#   dev/gate/gate.sh --no-restart   don't restart the test HA (only frontend changes; doesn't count)
#   dev/gate/gate.sh --baseline     after a release: store the visual baseline for the next one
#
# Test HA: Docker container FLODE_GATE_CONTAINER (default flode-test) with its config in
# FLODE_GATE_DIR/config (default ../flode-test next to the repo), at FLODE_GATE_URL
# (default http://localhost:8123); access token in FLODE_GATE_DIR/.claude-token or FLODE_GATE_TOKEN.
#
# Writes .gate/gate-<commit>.json (commit, clean tree, result per step) and logs to .gate/logs/.
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 2
GATE="$REPO/dev/gate"
OUT="$REPO/.gate"
CONTAINER="${FLODE_GATE_CONTAINER:-flode-test}"
TEST_DIR="${FLODE_GATE_DIR:-$REPO/../flode-test}"

ONLY=""; RESTART=1; BASELINE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift ;;
    --only=*) ONLY="${1#--only=}" ;;
    --no-restart) RESTART=0 ;;
    --baseline) BASELINE=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
case "$ONLY" in ""|static|cards|roundtrip|actions|visual) ;; *) echo "--only: static|cards|roundtrip|actions|visual" >&2; exit 2 ;; esac

COMMIT="$(git rev-parse --short HEAD)"
CLEAN=true
# Only what ends up in the release counts (docs or notes lying around don't).
[ -z "$(git status --porcelain -- packages custom_components dev hacs.json package.json yarn.lock)" ] || CLEAN=false
STARTED=$(date +%s)
mkdir -p "$OUT/logs"
rm -f "$OUT"/step-*.json
RESULTS=""

# run NAME COMMAND… — runs one step, logs it, remembers ok/failed.
run() {
  local name="$1"; shift
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && return 0
  local log="$OUT/logs/$name.log" t0=$(date +%s) status=ok
  printf '▶ %-10s' "$name"
  if "$@" >"$log" 2>&1; then echo " ✓ $(( $(date +%s) - t0 )) s"
  else status=failed; echo " ✗ $(( $(date +%s) - t0 )) s — $log"; grep -E '^\s+✗' "$log" | head -15; fi
  grep -E '^\s+·' "$log" | head -8
  RESULTS="$RESULTS\"$name\": \"$status\","
}

static_checks() {
  yarn biome ci . && yarn typecheck && yarn test --run && yarn build:ha
}

prepare_ha() {
  [ -d "$GATE/node_modules" ] || (cd "$GATE" && npm ci --no-audit --no-fund) || return 1
  rsync -a --delete custom_components/flode/ "$TEST_DIR/config/custom_components/flode/" || return 1
  if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != true ]; then
    docker start "$CONTAINER" || return 1
  elif [ $RESTART = 1 ]; then
    docker restart "$CONTAINER" || return 1
  fi
  node "$GATE/ready.mjs" 180 && node "$GATE/seed.mjs"
}

echo "FLODE gate · $COMMIT$([ $CLEAN = true ] || echo ' (uncommitted changes)')"
run static static_checks
if [ "$ONLY" != static ]; then
  printf '▶ %-10s' "test HA"
  if prepare_ha >"$OUT/logs/prepare.log" 2>&1; then echo " ✓ ($(grep -E 'ready|seeded' "$OUT/logs/prepare.log" | tr '\n' ' '))"
  else echo " ✗ — $OUT/logs/prepare.log"; tail -5 "$OUT/logs/prepare.log"; exit 1; fi
  run cards node "$GATE/check-cards.mjs"
  run roundtrip node "$GATE/check-roundtrip.mjs"
  run actions node "$GATE/check-actions.mjs"
  if [ $BASELINE = 1 ]; then run visual node "$GATE/check-visual.mjs" --baseline
  else run visual node "$GATE/check-visual.mjs"; fi
  node "$GATE/cleanup.mjs" >/dev/null 2>&1
fi

OK=true
echo "$RESULTS" | grep -q failed && OK=false
# A gate only counts for a release when it ran in full, on a clean tree, with the HA restarted.
COUNTS=false
[ $OK = true ] && [ -z "$ONLY" ] && [ $RESTART = 1 ] && [ $CLEAN = true ] && COUNTS=true
cat >"$OUT/gate-$COMMIT.json" <<EOF
{
  "commit": "$COMMIT",
  "clean": $CLEAN,
  "ok": $OK,
  "counts_for_release": $COUNTS,
  "only": "$ONLY",
  "date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "seconds": $(( $(date +%s) - STARTED )),
  "steps": { ${RESULTS%,} }
}
EOF
echo
if [ $OK = true ]; then
  echo "✓ gate green · $COMMIT · $(( $(date +%s) - STARTED )) s$([ $COUNTS = true ] || echo ' · does not count for a release (partial run or uncommitted changes)')"
  grep -q '"review": \[\]' "$OUT/step-visual.json" 2>/dev/null || [ ! -f "$OUT/step-visual.json" ] || echo "  look at the picture differences: .gate/visual/report.html"
  exit 0
fi
echo "✗ gate red · $COMMIT · see .gate/logs/"
exit 1
