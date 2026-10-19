#!/bin/bash
# FLODE release gate — run before every release, release only when it is green
# for exactly the commit that goes out (see dev/gate/README.md).
#
#   dev/gate/gate.sh                full gate (about 5 minutes)
#   dev/gate/gate.sh --only STEP    one step: static|cards|roundtrip|actions|visual (doesn't count)
#   dev/gate/gate.sh --no-restart   don't restart the test HA (only frontend changes; doesn't count)
#   dev/gate/gate.sh --baseline     after a release: store the visual baseline for the next one
#
# Test HA: HA Core from a venv (tools/ha-venv.sh, no Docker) with its config in FLODE_GATE_DIR/config
# (default ../flode-test next to the repo), on port FLODE_GATE_PORT (default 8123) of FLODE_GATE_URL
# (default http://localhost:8123), HA version FLODE_GATE_HA_VERSION (default: the one in ha-venv.sh);
# access token in FLODE_GATE_DIR/.claude-token or FLODE_GATE_TOKEN.
#
# Writes .gate/gate-<commit>.json (commit, clean tree, result per step and per test, flaky
# tests) and logs to .gate/logs/ (one per step, one per test that was not ok).
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO" || exit 2
GATE="$REPO/dev/gate"
OUT="$REPO/.gate"
TEST_DIR="${FLODE_GATE_DIR:-$REPO/../flode-test}"
HA_VENV="$REPO/tools/ha-venv.sh"
PORT="${FLODE_GATE_PORT:-8123}"
HA_VERSION_ARG="${FLODE_GATE_HA_VERSION:-}"

ONLY=""; RESTART=1; BASELINE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="$2"; shift ;;
    --only=*) ONLY="${1#--only=}" ;;
    --no-restart) RESTART=0 ;;
    --baseline) BASELINE=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
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
rm -f "$OUT"/step-*.json "$OUT/steps.txt"

# run NAME COMMAND… — runs one step, logs it, records name|status|seconds|log for summary.mjs.
run() {
  local name="$1"; shift
  [ -n "$ONLY" ] && [ "$ONLY" != "$name" ] && return 0
  local log="$OUT/logs/$name.log" t0=$(date +%s) status=ok
  printf '▶ %-10s' "$name"
  if "$@" >"$log" 2>&1; then echo " ✓ $(( $(date +%s) - t0 )) s"
  else status=failed; echo " ✗ $(( $(date +%s) - t0 )) s — $log"; grep -E '^\s+✗' "$log" | head -15; fi
  grep -E '^\s+(·|~)' "$log" | head -8
  echo "$name|$status|$(( $(date +%s) - t0 ))|${log#"$REPO/"}" >>"$OUT/steps.txt"
}

# Biome, type check, unit tests, build — each one a test of the step "static".
static_checks() {
  local ok=true tests=""
  for pair in "biome:yarn biome ci ." "typecheck:yarn typecheck" "unit tests:yarn test --run" "build:yarn build:ha"; do
    local name="${pair%%:*}" cmd="${pair#*:}" status=ok
    echo "▶ $name"
    $cmd || { status=failed; ok=false; }
    tests="$tests{\"name\":\"$name\",\"status\":\"$status\"},"
  done
  printf '{"step":"static","ok":%s,"tests":[%s]}\n' "$ok" "${tests%,}" >"$OUT/step-static.json"
  [ "$ok" = true ]
}

prepare_ha() {
  [ -d "$GATE/node_modules" ] || (cd "$GATE" && npm ci --no-audit --no-fund) || return 1
  rsync -a --delete custom_components/flode/ "$TEST_DIR/config/custom_components/flode/" || return 1
  if ! "$HA_VENV" laeuft "$TEST_DIR/config"; then
    "$HA_VENV" start "$TEST_DIR/config" "$PORT" $HA_VERSION_ARG || return 1
  elif [ $RESTART = 1 ]; then
    "$HA_VENV" restart "$TEST_DIR/config" "$PORT" $HA_VERSION_ARG || return 1
  fi
  node "$GATE/ready.mjs" 180 && node "$GATE/seed.mjs"
}

echo "FLODE gate · $COMMIT$([ $CLEAN = true ] || echo ' (uncommitted changes)')"
run static static_checks
if [ "$ONLY" != static ]; then
  printf '▶ %-10s' "test HA"
  T0=$(date +%s)
  if prepare_ha >"$OUT/logs/prepare.log" 2>&1; then
    echo " ✓ ($(grep -E 'ready|seeded' "$OUT/logs/prepare.log" | tr '\n' ' '))"
    echo "test HA|ok|$(( $(date +%s) - T0 ))|.gate/logs/prepare.log" >>"$OUT/steps.txt"
  else
    echo " ✗ — $OUT/logs/prepare.log"; tail -5 "$OUT/logs/prepare.log"
    echo "test HA|failed|$(( $(date +%s) - T0 ))|.gate/logs/prepare.log" >>"$OUT/steps.txt"
    node "$GATE/summary.mjs" --commit "$COMMIT" --clean "$CLEAN" --only "$ONLY" --restart "$RESTART" --seconds $(( $(date +%s) - STARTED ))
    exit 1
  fi
  run cards node "$GATE/check-cards.mjs"
  run roundtrip node "$GATE/check-roundtrip.mjs"
  run actions node "$GATE/check-actions.mjs"
  if [ $BASELINE = 1 ]; then run visual node "$GATE/check-visual.mjs" --baseline
  else run visual node "$GATE/check-visual.mjs"; fi
  node "$GATE/cleanup.mjs" >/dev/null 2>&1
fi

# summary.mjs writes gate-<commit>.json (steps, every test, flaky ones) and returns 0 when all steps are ok.
# A gate only counts for a release when it ran in full, on a clean tree, with the HA restarted.
echo
OK=true
node "$GATE/summary.mjs" --commit "$COMMIT" --clean "$CLEAN" --only "$ONLY" --restart "$RESTART" --seconds $(( $(date +%s) - STARTED )) || OK=false
COUNTS=false
[ $OK = true ] && [ -z "$ONLY" ] && [ $RESTART = 1 ] && [ $CLEAN = true ] && COUNTS=true
echo
if [ $OK = true ]; then
  echo "✓ gate green · $COMMIT · $(( $(date +%s) - STARTED )) s$([ $COUNTS = true ] || echo ' · does not count for a release (partial run or uncommitted changes)')"
  node -e 'const r = require(process.argv[1]).review; process.exit(r && r.length ? 0 : 1)' "$OUT/step-visual.json" 2>/dev/null \
    && echo "  look at the picture differences: .gate/visual/report.html"
  exit 0
fi
echo "✗ gate red · $COMMIT · see .gate/logs/"
exit 1
