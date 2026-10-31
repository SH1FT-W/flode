#!/usr/bin/env bash
# Test Home Assistant in Docker: one container per config folder, same commands as tools/ha-venv.sh,
# so callers can switch between the two with one variable.
#
#   ha-docker.sh install [version]              pull the image (if missing), prints its name
#   ha-docker.sh start   <config> <port> [ver]  start in the background (no waiting)
#   ha-docker.sh stop    <config>               stop and remove the container (the config folder stays)
#   ha-docker.sh restart <config> <port> [ver]  stop + start
#   ha-docker.sh laeuft  <config>               exit 0 if a container for this folder is running
#   ha-docker.sh wait    <port> [seconds]       wait until /manifest.json answers (default 240 s)
#   ha-docker.sh log     <config> [lines]       tail of home-assistant.log and of the container output
#   ha-docker.sh mb      <config>               memory of the running container in MB
#
# Version: argument, else $HA_VERSION, else the default of tools/ha-venv.sh next to this script (one place for
# the pinned version). It is the image tag of ghcr.io/home-assistant/home-assistant, so "stable", "beta" and
# "dev" work as they are. Container name: $HA_NAME, else "ha-<parent folder of config>"; the container carries
# the absolute config path as a label, all commands find it by that label. Address: $HA_HOST, default 127.0.0.1
# (this Mac only; 0.0.0.0 = also from the network). Inside the container HA always listens on 8123: since
# HA 2026.10 the port lives in .storage/http, start resets it there and in configuration.yaml (a config used
# with ha-venv before carries its own port).
set -euo pipefail

# Docker Desktop puts its CLI and credential helper here; non-interactive shells don't have it in PATH.
export PATH="$PATH:$HOME/.docker/bin:/usr/local/bin:/opt/homebrew/bin"
DOCKER="${DOCKER:-docker}"
IMAGE="${HA_IMAGE:-ghcr.io/home-assistant/home-assistant}"
HOST="${HA_HOST:-127.0.0.1}"
LABEL="ha-docker.config"
HIER="$(cd "$(dirname "$0")" && pwd)"

fehler() { echo "ha-docker: $*" >&2; exit 1; }

version() {
  local v="${1:-${HA_VERSION:-}}"
  if [ -z "$v" ]; then
    v="$(sed -n 's/^HA_DEFAULT="\(.*\)"$/\1/p' "$HIER/ha-venv.sh" 2>/dev/null || true)"
    [ -n "$v" ] || v=stable
  fi
  case "$v" in *[!0-9a-z.]*) fehler "ungültige Version: $v" ;; esac
  echo "$v"
}

docker_ok() { "$DOCKER" info >/dev/null 2>&1 || fehler "Docker antwortet nicht (Docker Desktop gestartet?)"; }

install() {
  local img; img="$IMAGE:$(version "${1:-}")"
  docker_ok
  # stable/beta/dev move: pull them every time, fixed versions only once.
  case "${img##*:}" in
    stable|beta|dev|latest) "$DOCKER" pull -q "$img" >&2 ;;
    *) "$DOCKER" image inspect "$img" >/dev/null 2>&1 || "$DOCKER" pull -q "$img" >&2 ;;
  esac
  echo "$img"
}

abs() { (cd "$1" 2>/dev/null && pwd) || fehler "Ordner fehlt: $1"; }

# Container (running or not) for exactly this config folder.
container_von() {
  "$DOCKER" ps -aq --filter "label=$LABEL=$(abs "$1")" 2>/dev/null | head -1
}

port_pruefen() {
  case "$1" in ''|*[!0-9]*) fehler "ungültiger Port: $1" ;; esac
}

# Inside the container: port 8123 on all addresses (the host side is restricted by -p).
port_setzen() {
  python3 - "$1" <<'PY'
import json, os, re, sys
cfg = sys.argv[1]
st = os.path.join(cfg, ".storage", "http")
if os.path.exists(st):
    with open(st) as f:
        d = json.load(f)
    s = d.setdefault("data", {}).setdefault("stable", {})
    s["server_port"] = 8123
    s.pop("server_host", None)
    d["data"]["pending"] = None
    with open(st + ".neu", "w") as f:
        json.dump(d, f, indent=2)
    os.replace(st + ".neu", st)
y = os.path.join(cfg, "configuration.yaml")
t = open(y).read() if os.path.exists(y) else ""
blk = "http:\n  server_port: 8123\n"
t2, n = re.subn(r"(?m)^http:[^\n]*\n(?:[ \t]+[^\n]*\n|[ \t]*\n(?=[ \t]))*", blk, t)
if n == 0:
    t2 = t.rstrip("\n") + ("\n\n" if t else "") + blk
if t2 != t:
    with open(y, "w") as f:
        f.write(t2)
PY
}

name_fuer() {
  local n="${HA_NAME:-ha-$(basename "$(dirname "$1")")}"
  n="$(echo "$n" | tr -c 'a-zA-Z0-9_.-\n' '-')"
  echo "$n"
}

start() {
  local cfg="$1" port="$2" img name id
  port_pruefen "$port"
  cfg="$(abs "$cfg")"
  docker_ok
  id="$(container_von "$cfg")"
  if [ -n "$id" ]; then
    [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$id")" = true ] && fehler "läuft schon: $cfg"
    "$DOCKER" rm -f "$id" >/dev/null
  fi
  if curl -s -o /dev/null --max-time 1 "http://127.0.0.1:$port/"; then fehler "Port $port ist belegt"; fi
  img="$(install "${3:-}")"
  name="$(name_fuer "$cfg")"
  # A leftover container with the same name but another folder would block the start.
  if "$DOCKER" inspect "$name" >/dev/null 2>&1; then
    [ "$("$DOCKER" inspect -f "{{index .Config.Labels \"$LABEL\"}}" "$name")" = "$cfg" ] \
      || fehler "Container $name gehört zu einem anderen Ordner (HA_NAME setzen oder docker rm -f $name)"
    "$DOCKER" rm -f "$name" >/dev/null
  fi
  port_setzen "$cfg"
  # unless-stopped: homeassistant.restart only exits and leaves the restart to the container.
  "$DOCKER" run -d --name "$name" --label "$LABEL=$cfg" --label ha-docker=1 \
    --restart unless-stopped -p "$HOST:$port:8123" -v "$cfg:/config" -e TZ=Europe/Berlin "$img" >/dev/null
  echo "HA ${img##*:} gestartet: $cfg → http://$HOST:$port (Container $name)"
}

stop() {
  local id
  id="$(container_von "$1")"
  [ -z "$id" ] || "$DOCKER" rm -f "$id" >/dev/null
}

warten() {
  local port="$1" max="${2:-240}" i=0
  port_pruefen "$port"
  until curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/manifest.json" | grep -q 200; do
    i=$((i + 2)); [ $i -gt "$max" ] && fehler "Port $port antwortet nach $max s nicht"
    sleep 2
  done
}

laeuft() {
  local id
  [ -d "$1" ] || return 1
  id="$(container_von "$1")"
  [ -n "$id" ] && [ "$("$DOCKER" inspect -f '{{.State.Running}}' "$id" 2>/dev/null)" = true ]
}

cmd="${1:-}"; shift || true
case "$cmd" in
  install) install "${1:-}" ;;
  start)   [ $# -ge 2 ] || fehler "Aufruf: start <config> <port> [version]"; start "$@" ;;
  stop)    [ $# -ge 1 ] || fehler "Aufruf: stop <config>"; [ -d "$1" ] || exit 0; stop "$1" ;;
  restart) [ $# -ge 2 ] || fehler "Aufruf: restart <config> <port> [version]"; stop "$1"; start "$@" ;;
  laeuft)  [ $# -ge 1 ] || exit 1; laeuft "$1" ;;
  wait)    [ $# -ge 1 ] || fehler "Aufruf: wait <port> [sekunden]"; warten "$@" ;;
  log)
    [ $# -ge 1 ] || fehler "Aufruf: log <config> [zeilen]"
    tail -n "${2:-30}" "$1/home-assistant.log" 2>/dev/null || true
    id="$(container_von "$1")"; [ -z "$id" ] || "$DOCKER" logs --tail 10 "$id" 2>&1 || true ;;
  mb)
    [ $# -ge 1 ] || fehler "Aufruf: mb <config>"
    id="$(container_von "$1")"; [ -n "$id" ] || { echo 0; exit 0; }
    "$DOCKER" stats --no-stream --format '{{.MemUsage}}' "$id" | awk '{
      v=$1; u=v; gsub(/[0-9.]/,"",u); gsub(/[A-Za-z]/,"",v);
      if (u=="GiB") v*=1024; else if (u=="KiB") v/=1024; else if (u=="B") v/=1048576; printf "%d\n", v }' ;;
  *) sed -n '2,13p' "$0" >&2; exit 2 ;;
esac
