#!/usr/bin/env bash
# EagleEye Commander — installer and updater for a Debian or Ubuntu machine (a Proxmox LXC, a VM, a Raspberry Pi).
# Run as root inside the container:
#
#   apt-get update && apt-get install -y curl ca-certificates
#   curl -fsSL https://raw.githubusercontent.com/slqdk/EagleEye-Commander/main/deploy/install.sh | bash
#
# Running it again updates the code and keeps the matches. After the first run the same thing is the command
#   eagleeye-update
#
# Optional settings, given in front of "bash":  PORT=8080  APP_DIR=/opt/eagleeye-commander
#   DATA_DIR=/var/lib/eagleeye-commander  BRANCH=main  REPO=https://github.com/slqdk/EagleEye-Commander.git
set -euo pipefail

SVC=eagleeye-commander
RUN_USER=eagleeye

say() { printf '\n== %s\n' "$*"; }
die() { printf '\nFEJL: %s\n' "$*" >&2; exit 1; }
node_ok() { command -v node >/dev/null 2>&1 && [ "$(node -p 'parseInt(process.versions.node)' 2>/dev/null || echo 0)" -ge 20 ]; }

# Step 1: packages, Node.js and the code. Runs from the downloaded script (or the copy that is being replaced).
fetch_code() {
  command -v apt-get >/dev/null 2>&1 || die "Installationen er lavet til Debian og Ubuntu (apt-get mangler)."
  export DEBIAN_FRONTEND=noninteractive

  say "Henter pakker (git, curl)"
  apt-get update -qq
  apt-get install -y -qq --no-install-recommends git curl ca-certificates >/dev/null

  if ! node_ok; then
    say "Installerer Node.js"
    local cand; cand=$(apt-cache policy nodejs 2>/dev/null | awk '/Candidate:/ { print $2 }')
    if [ "${cand%%.*}" -ge 20 ] 2>/dev/null; then
      apt-get install -y -qq --no-install-recommends nodejs >/dev/null          # the distribution's own (Debian 13: Node 20)
    else
      curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null      # older systems: Node 24 from NodeSource
      apt-get install -y -qq nodejs >/dev/null
    fi
  fi
  node_ok || die "Node.js 20 eller nyere kunne ikke installeres. Installér det selv, og kør scriptet igen."

  if [ -d "$APP_DIR/.git" ]; then
    say "Opdaterer koden i $APP_DIR"
    git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
    git -C "$APP_DIR" checkout --quiet "$BRANCH"
    git -C "$APP_DIR" merge --quiet --ff-only "origin/$BRANCH" \
      || die "Koden i $APP_DIR er ændret lokalt. Se 'git -C $APP_DIR status', ryd op, og prøv igen."
  else
    [ ! -e "$APP_DIR" ] || [ -z "$(ls -A "$APP_DIR" 2>/dev/null)" ] || die "$APP_DIR findes allerede og er ikke en git-kopi af spillet."
    say "Henter koden til $APP_DIR"
    git clone --quiet --branch "$BRANCH" "$REPO" "$APP_DIR"
  fi
}

# Step 2: user, data folder, service. Always runs from the freshly fetched copy of this script.
configure() {
  cd "$APP_DIR"
  local version; version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -n 1)

  if ! id -u "$RUN_USER" >/dev/null 2>&1; then
    useradd --system --user-group --no-create-home --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$RUN_USER"
  fi
  install -d -o "$RUN_USER" -g "$RUN_USER" -m 750 "$DATA_DIR"
  chown -R "$RUN_USER:$RUN_USER" "$DATA_DIR"

  # the update command remembers the choices made now
  cat > /usr/local/bin/eagleeye-update <<EOF
#!/bin/sh
# Updates EagleEye Commander to the newest version on GitHub and restarts it. The matches are kept.
REPO='$REPO' BRANCH='$BRANCH' APP_DIR='$APP_DIR' DATA_DIR='$DATA_DIR' PORT='$PORT' exec bash '$APP_DIR/deploy/install.sh' "\$@"
EOF
  chmod 755 /usr/local/bin/eagleeye-update

  if [ ! -d /run/systemd/system ]; then
    say "EagleEye Commander $version er hentet, men systemd kører ikke her, så der er ikke lavet en tjeneste."
    echo "   Start selv:  cd $APP_DIR && PORT=$PORT DATA_DIR=$DATA_DIR node server/server.js"
    return 0
  fi

  say "Sætter tjenesten $SVC op"
  sed -e "s|/opt/eagleeye-commander|$APP_DIR|g" -e "s|/var/lib/eagleeye-commander|$DATA_DIR|g" -e "s|^Environment=PORT=.*|Environment=PORT=$PORT|" \
    deploy/$SVC.service > /etc/systemd/system/$SVC.service
  systemctl daemon-reload
  systemctl enable --quiet "$SVC"
  systemctl restart "$SVC"

  local ok=''
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -m 3 -X POST "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 1
  done
  if [ -z "$ok" ]; then
    systemctl --no-pager --lines=20 status "$SVC" || true
    die "Tjenesten svarer ikke på port $PORT. Se loggen:  journalctl -u $SVC -n 50"
  fi

  local ip; ip=$(hostname -I 2>/dev/null | awk '{ print $1 }')
  say "EagleEye Commander $version kører."
  cat <<EOF
   Adresse:              http://${ip:-<containerens IP>}:$PORT
   Kampe og loginnøgle:  $DATA_DIR   (tag backup af den mappe, eller af hele containeren)
   Opdatér senere:       eagleeye-update
   Log:                  journalctl -u $SVC -f

   Nginx Proxy Manager:  Scheme http · Forward Hostname/IP ${ip:-<containerens IP>} · Forward Port $PORT
                         Lad "Cache Assets" være slået fra. Websockets er ikke nødvendigt.
EOF
}

main() {
  [ "$(id -u)" = 0 ] || die "Kør som root."
  REPO=${REPO:-https://github.com/slqdk/EagleEye-Commander.git}
  BRANCH=${BRANCH:-main}
  APP_DIR=${APP_DIR:-/opt/eagleeye-commander}
  DATA_DIR=${DATA_DIR:-/var/lib/eagleeye-commander}
  PORT=${PORT:-8080}
  export REPO BRANCH APP_DIR DATA_DIR PORT
  case "$PORT" in ''|*[!0-9]*) die "PORT skal være et tal." ;; esac

  if [ "${1:-}" != --configure ]; then
    fetch_code
    exec bash "$APP_DIR/deploy/install.sh" --configure      # continue with the version that was just fetched
  fi
  configure
}

# Everything is inside functions, so a half-downloaded script does nothing, and the file can be replaced while it runs.
main "$@"; exit 0
