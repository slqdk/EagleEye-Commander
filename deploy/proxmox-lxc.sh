#!/usr/bin/env bash
# EagleEye Commander — makes a small Debian container (LXC) on a Proxmox VE host and installs the game in it.
# Run in the shell of the Proxmox host (as root), not inside a container:
#
#   curl -fsSL https://raw.githubusercontent.com/slqdk/EagleEye-Commander/main/deploy/proxmox-lxc.sh | bash
#
# Optional settings, given in front of "bash", for example a fixed address:
#   curl -fsSL .../proxmox-lxc.sh | IP=192.168.1.50/24 GW=192.168.1.1 bash
#
#   CTID       container number             (default: the next free one)
#   CT_NAME    host name                    (default: eagleeye)
#   IP, GW     address with /mask, gateway  (default: dhcp)
#   BRIDGE     network bridge               (default: vmbr0)
#   STORAGE    where the disk goes          (default: the first storage that takes containers)
#   TEMPLATES  where templates are kept     (default: the first storage that takes templates)
#   DISK, MEMORY, SWAP, CORES               (default: 4 GB, 512 MB, 256 MB, 1)
#   PORT       the game's port              (default: 8080)
set -euo pipefail

RAW=https://raw.githubusercontent.com/slqdk/EagleEye-Commander/main/deploy
say() { printf '\n== %s\n' "$*"; }
die() { printf '\nFEJL: %s\n' "$*" >&2; exit 1; }
first_storage() { pvesm status --content "$1" 2>/dev/null | awk 'NR > 1 && $3 == "active" { print $1; exit }'; }

main() {
  [ "$(id -u)" = 0 ] || die "Kør som root på Proxmox-værten."
  for c in pct pveam pvesm pvesh; do command -v "$c" >/dev/null 2>&1 || die "'$c' findes ikke. Scriptet skal køres på selve Proxmox-værten."; done

  CTID=${CTID:-$(pvesh get /cluster/nextid)}
  CT_NAME=${CT_NAME:-eagleeye}
  IP=${IP:-dhcp}; GW=${GW:-}
  BRIDGE=${BRIDGE:-vmbr0}
  STORAGE=${STORAGE:-$(first_storage rootdir)}
  TEMPLATES=${TEMPLATES:-$(first_storage vztmpl)}
  DISK=${DISK:-4}; MEMORY=${MEMORY:-512}; SWAP=${SWAP:-256}; CORES=${CORES:-1}
  PORT=${PORT:-8080}
  [ -n "$STORAGE" ] || die "Fandt intet lager til containere. Angiv et med STORAGE=..."
  [ -n "$TEMPLATES" ] || die "Fandt intet lager til skabeloner. Angiv et med TEMPLATES=..."
  case "$CTID" in ''|*[!0-9]*) die "CTID skal være et tal." ;; esac
  ! pct status "$CTID" >/dev/null 2>&1 || die "Container $CTID findes allerede. Vælg et andet nummer med CTID=..."

  # Debian 13 on Proxmox 9 and newer, Debian 12 on older hosts (they cannot all start a Debian 13 container)
  local major deb tpl
  major=$(pveversion 2>/dev/null | sed -n 's|^pve-manager/\([0-9]*\)\..*|\1|p')
  deb=12; [ "${major:-0}" -ge 9 ] 2>/dev/null && deb=13
  deb=${DEBIAN:-$deb}

  say "Finder skabelonen Debian $deb"
  pveam update >/dev/null 2>&1 || true
  tpl=$(pveam available --section system | awk '{ print $2 }' | grep -E "^debian-${deb}-standard_.*_amd64\." | sort -V | tail -n 1 || true)
  [ -n "$tpl" ] || die "Fandt ingen Debian $deb-skabelon med 'pveam available'."
  if ! pveam list "$TEMPLATES" 2>/dev/null | grep -q "$tpl"; then
    say "Henter $tpl til lageret $TEMPLATES"
    pveam download "$TEMPLATES" "$tpl"
  fi

  local net="name=eth0,bridge=$BRIDGE,ip=$IP"
  [ "$IP" = dhcp ] || [ -z "$GW" ] || net="$net,gw=$GW"

  say "Opretter container $CTID ($CT_NAME) på lageret $STORAGE"
  pct create "$CTID" "$TEMPLATES:vztmpl/$tpl" \
    --hostname "$CT_NAME" --unprivileged 1 --features nesting=1 \
    --cores "$CORES" --memory "$MEMORY" --swap "$SWAP" --rootfs "$STORAGE:$DISK" \
    --net0 "$net" --onboot 1 --start 1

  say "Venter på netværk i containeren"
  local ok=''
  for _ in $(seq 1 30); do
    if pct exec "$CTID" -- sh -c 'getent hosts deb.debian.org >/dev/null 2>&1'; then ok=1; break; fi
    sleep 2
  done
  [ -n "$ok" ] || die "Containeren har ikke fået netværk (tjek BRIDGE, IP og GW). Den findes stadig som nummer $CTID."

  say "Installerer spillet i containeren"
  pct exec "$CTID" -- env PORT="$PORT" bash -c \
    "export DEBIAN_FRONTEND=noninteractive; apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null && curl -fsSL $RAW/install.sh | bash"

  local addr; addr=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{ print $1 }')
  say "Færdig. Container $CTID ($CT_NAME) kører EagleEye Commander på http://${addr:-<IP>}:$PORT"
  cat <<TXT
   Ind i containeren:   pct enter $CTID
   Opdatér spillet:     pct exec $CTID -- eagleeye-update
   Root har ingen adgangskode i containeren; brug 'pct enter', eller sæt en med 'pct exec $CTID -- passwd'.
TXT
  [ "$IP" != dhcp ] || echo "   Adressen kommer fra DHCP. Reservér den i routeren (eller opret med IP=.../24 GW=...), så Nginx Proxy Manager altid rammer rigtigt."
}

main "$@"; exit 0
