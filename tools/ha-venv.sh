#!/usr/bin/env bash
# Test-Home-Assistant ohne Docker: HA Core aus einer gemeinsamen venv je Version
# (~/.cache/ha-venv/<version>, mit uv angelegt), ein Prozess je Konfigurationsordner.
#
#   ha-venv.sh install [version]              venv anlegen (falls nötig), gibt ihren Pfad aus
#   ha-venv.sh start   <config> <port> [ver]  im Hintergrund starten (ohne Warten)
#   ha-venv.sh stop    <config>               beenden (TERM, nach 30 s KILL)
#   ha-venv.sh restart <config> <port> [ver]  stop + start
#   ha-venv.sh laeuft  <config>               Exit 0, wenn ein HA mit diesem Ordner läuft
#   ha-venv.sh wait    <port> [sekunden]      warten, bis /manifest.json antwortet (Standard 240 s)
#   ha-venv.sh log     <config> [zeilen]      Ende von home-assistant.log und der Startausgabe
#   ha-venv.sh mb      <config>               Speicher des laufenden HA in MB (RSS)
#
# Version: Argument, sonst $HA_VERSION, sonst die feste Standardversion unten. „stable“ und „beta“
# lösen die neueste Version bzw. die neueste Vorabversion von PyPI auf (z. B. 2026.11.0b0).
# Port: steht seit HA 2026.10 in .storage/http (die YAML-Angabe „http: server_port“ wird nach der
# einmaligen Übernahme ignoriert) – start setzt beides. Adresse: $HA_HOST, Standard 127.0.0.1
# (nur dieser Mac; 0.0.0.0 = auch aus dem Netz). Gemeinsame Vorlage aus repo-vorlagen/vorlagen,
# in den Repos byteidentisch als tools/ha-venv.sh (Abgleich: vorlagen/abgleich.sh).
set -euo pipefail

HA_DEFAULT="2026.10.1"
BASIS="${HA_VENV_DIR:-$HOME/.cache/ha-venv}"
HOST="${HA_HOST:-127.0.0.1}"

fehler() { echo "ha-venv: $*" >&2; exit 1; }

# Version auflösen: stable/beta über PyPI, sonst wie angegeben.
version() {
  local v="${1:-${HA_VERSION:-$HA_DEFAULT}}"
  case "$v" in
    stable|beta)
      curl -fsS --max-time 20 https://pypi.org/pypi/homeassistant/json | python3 -c '
import json, re, sys
d = json.load(sys.stdin); beta = sys.argv[1] == "beta"
def key(v):
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:b(\d+))?", v)
    return None if not m else (int(m[1]), int(m[2]), int(m[3]), int(m[4]) if m[4] else 10**6)
vs = [v for v, f in d["releases"].items() if f and key(v) and (beta or "b" not in v)]
print(max(vs, key=key))' "$v" || fehler "PyPI nicht erreichbar ($v)" ;;
    *[!0-9a-z.]*|"") fehler "ungültige Version: $v" ;;
    *) echo "$v" ;;
  esac
}

# venv für eine Version anlegen. Sperre per mkdir, damit parallel startende HAs nur einmal installieren.
install() {
  local v d sperre i=0
  v="$(version "${1:-}")"; d="$BASIS/$v"
  [ -x "$d/bin/hass" ] && { echo "$d"; return; }
  command -v uv >/dev/null || fehler "uv fehlt (brew install uv)"
  mkdir -p "$BASIS"; sperre="$BASIS/.$v.lock"
  until mkdir "$sperre" 2>/dev/null; do
    i=$((i + 1)); [ $i -gt 600 ] && fehler "Sperre $sperre hängt (älter als 10 min? dann löschen)"
    sleep 1
    [ -x "$d/bin/hass" ] && { echo "$d"; return; }
  done
  echo "ha-venv: lege $d an (HA $v) …" >&2
  local py ok=0
  # Neueste Python zuerst; neue HA-Versionen verlangen sie, ältere laufen meist auch mit 3.13.
  for py in 3.14 3.13; do
    rm -rf "$d"
    uv venv -q --python "$py" "$d" >&2 \
      && VIRTUAL_ENV="$d" uv pip install -q "homeassistant==$v" >&2 \
      && { ok=1; break; }
  done
  rmdir "$sperre" 2>/dev/null || true
  [ $ok = 1 ] || { rm -rf "$d"; fehler "HA $v ließ sich nicht installieren"; }
  echo "$d"
}

abs() { (cd "$1" 2>/dev/null && pwd) || fehler "Ordner fehlt: $1"; }

# PID des HA, das mit genau diesem Konfigurationsordner läuft (über die Befehlszeile, ohne PID-Datei).
pid_von() {
  local cfg; cfg="$(abs "$1")"
  # awk reads to the end: an early exit lets ps die of SIGPIPE, and pipefail turns a running HA into an error.
  ps -axo pid=,command= | awk -v s=" -c $cfg" '
    !f && index($0, "/bin/hass") && length($0) >= length(s) && substr($0, length($0) - length(s) + 1) == s { print $1; f = 1 }'
}

port_pruefen() {
  case "$1" in ''|*[!0-9]*) fehler "ungültiger Port: $1" ;; esac
}

# Port und Adresse in .storage/http (falls vorhanden) und in configuration.yaml setzen.
port_setzen() {
  python3 - "$1" "$2" "$HOST" <<'PY'
import json, os, re, sys
cfg, port, host = sys.argv[1], int(sys.argv[2]), sys.argv[3]
st = os.path.join(cfg, ".storage", "http")
if os.path.exists(st):
    with open(st) as f:
        d = json.load(f)
    s = d.setdefault("data", {}).setdefault("stable", {})
    s["server_port"] = port
    s["server_host"] = [host]
    d["data"]["pending"] = None
    with open(st + ".neu", "w") as f:
        json.dump(d, f, indent=2)
    os.replace(st + ".neu", st)
y = os.path.join(cfg, "configuration.yaml")
t = open(y).read() if os.path.exists(y) else ""
blk = f"http:\n  server_host: {host}\n  server_port: {port}\n"
t2, n = re.subn(r"(?m)^http:[^\n]*\n(?:[ \t]+[^\n]*\n|[ \t]*\n(?=[ \t]))*", blk, t)
if n == 0:
    t2 = t.rstrip("\n") + ("\n\n" if t else "") + blk
if t2 != t:
    with open(y, "w") as f:
        f.write(t2)
PY
}

start() {
  local cfg="$1" port="$2" d pid
  port_pruefen "$port"
  cfg="$(abs "$cfg")"
  [ -z "$(pid_von "$cfg")" ] || fehler "läuft schon: $cfg"
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/"; then fehler "Port $port ist belegt"; fi
  d="$(install "${3:-}")"
  port_setzen "$cfg" "$port"
  # Im Hintergrund und abgekoppelt, damit das HA das aufrufende Skript überlebt.
  # Restart like a container with "unless-stopped": homeassistant.restart only exits (code 100, on macOS
  # often a segfault in the final write) and leaves the restart to the container. stop() leaves a marker;
  # a run shorter than 20 s ends the loop so a broken config does not restart forever.
  rm -f "$cfg/.ha-venv-stop"
  (cd "$cfg" || exit 1; nohup bash -c 'while :; do t=$SECONDS; "$1/bin/hass" -c "$2"; [ -e "$2/.ha-venv-stop" ] && exit; [ $((SECONDS - t)) -lt 20 ] && exit 1; done' \
    ha-venv "$d" "$cfg" > "$cfg/.ha-venv.out" 2>&1 < /dev/null &)
  sleep 1
  pid="$(pid_von "$cfg")"
  [ -n "$pid" ] || { tail -20 "$cfg/.ha-venv.out" >&2; fehler "Start fehlgeschlagen"; }
  echo "HA $(basename "$d") gestartet: $cfg → http://$HOST:$port (PID $pid)"
}

stop() {
  local pid i=0
  [ -d "$1" ] && touch "$1/.ha-venv-stop"
  pid="$(pid_von "$1" 2>/dev/null || true)"
  # Between two runs of a restart there is no hass for a moment.
  if [ -z "$pid" ] && ps -axo command= | awk -v s=" ha-venv " -v e=" $(abs "$1")" 'index($0, s) && substr($0, length($0) - length(e) + 1) == e { f = 1 } END { exit !f }'; then
    sleep 2; pid="$(pid_von "$1" 2>/dev/null || true)"
  fi
  [ -n "$pid" ] || return 0
  kill "$pid" 2>/dev/null || true
  while kill -0 "$pid" 2>/dev/null; do
    i=$((i + 1)); [ $i -gt 30 ] && { kill -9 "$pid" 2>/dev/null || true; break; }
    sleep 1
  done
}

warten() {
  local port="$1" max="${2:-240}" i=0
  port_pruefen "$port"
  until curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/manifest.json" | grep -q 200; do
    i=$((i + 2)); [ $i -gt "$max" ] && fehler "Port $port antwortet nach $max s nicht"
    sleep 2
  done
}

cmd="${1:-}"; shift || true
case "$cmd" in
  install) install "${1:-}" ;;
  start)   [ $# -ge 2 ] || fehler "Aufruf: start <config> <port> [version]"; start "$@" ;;
  stop)    [ $# -ge 1 ] || fehler "Aufruf: stop <config>"; [ -d "$1" ] || exit 0; stop "$1" ;;
  restart) [ $# -ge 2 ] || fehler "Aufruf: restart <config> <port> [version]"; stop "$1"; start "$@" ;;
  laeuft)  [ $# -ge 1 ] && [ -d "$1" ] && [ -n "$(pid_von "$1")" ] ;;
  wait)    [ $# -ge 1 ] || fehler "Aufruf: wait <port> [sekunden]"; warten "$@" ;;
  log)
    [ $# -ge 1 ] || fehler "Aufruf: log <config> [zeilen]"
    tail -n "${2:-30}" "$1/home-assistant.log" 2>/dev/null || true
    tail -n 10 "$1/.ha-venv.out" 2>/dev/null || true ;;
  mb)
    [ $# -ge 1 ] || fehler "Aufruf: mb <config>"
    p="$(pid_von "$1")"; [ -n "$p" ] || { echo 0; exit 0; }
    echo $(( $(ps -o rss= -p "$p") / 1024 )) ;;
  *) sed -n '2,13p' "$0" >&2; exit 2 ;;
esac
