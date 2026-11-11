# EagleEye Commander

A cartoon take on 90s base-building strategy, played in rounds. Everyone builds, trains and gives attack orders in their own time; when all are ready, the round runs as one battle on a shared map and is played back as a film.

No dependencies: Node 20 or newer and a browser. (Until v2.3.1 the project was called Jernfronten 2.)

## Run it

```
node server/server.js            # http://localhost:8080
PORT=8090 DATA_DIR=/var/lib/eagleeye-commander node server/server.js
```

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on |
| `DATA_DIR` | `./data` | Where matches and the login key are kept |
| `HOST` | all interfaces | Listen on one address only, e.g. `127.0.0.1` |
| `TRUSTED_PROXY` | none | Extra reverse-proxy addresses or networks, comma separated (see "Behind a reverse proxy") |

- Matches are plain JSON files in the data folder, one per invite code, plus `secret.key` (signs login tokens). Back up by copying the folder. Neither belongs in git (`.gitignore` keeps `data/` out).
- Deadlines are checked once a minute, so rounds resolve even when nobody has the page open.
- `npm test` plays AI-only matches headless and prints each round (`node tools/selftest.mjs <bots> <rounds> <seed> <map>`).

## Install on Proxmox

The game runs fine in a small unprivileged LXC: 1 core, 512 MB memory and 2-4 GB disk are plenty (Node idles around 70 MB; a match costs well under 1 MB).

**A. In a container you have made yourself** (Debian 12/13 or Ubuntu 22.04/24.04). In the container's console, as root:

```
apt-get update && apt-get install -y curl ca-certificates
curl -fsSL https://raw.githubusercontent.com/slqdk/EagleEye-Commander/main/deploy/install.sh | bash
```

The same from the shell of the Proxmox host, for container 120:

```
pct exec 120 -- bash -c "apt-get update && apt-get install -y curl ca-certificates && curl -fsSL https://raw.githubusercontent.com/slqdk/EagleEye-Commander/main/deploy/install.sh | bash"
```

**B. Let a script make the container too.** In the shell of the Proxmox host:

```
curl -fsSL https://raw.githubusercontent.com/slqdk/EagleEye-Commander/main/deploy/proxmox-lxc.sh | bash
# with a fixed address:
curl -fsSL https://raw.githubusercontent.com/slqdk/EagleEye-Commander/main/deploy/proxmox-lxc.sh | IP=192.168.1.50/24 GW=192.168.1.1 bash
```

It takes the next free container number, downloads the Debian template if needed, creates an unprivileged container (`CTID`, `CT_NAME`, `IP`, `GW`, `BRIDGE`, `STORAGE`, `DISK`, `MEMORY`, `CORES` can be set, see the top of the script) and runs the installer in it.

What `deploy/install.sh` does:

- installs git, curl and Node.js (the distribution's own if it is 20 or newer, otherwise Node 24 from NodeSource);
- clones this repository to `/opt/eagleeye-commander`;
- creates the system user `eagleeye` and the data folder `/var/lib/eagleeye-commander`;
- installs and starts the systemd service `eagleeye-commander` on port 8080, and checks that it answers;
- adds the command `eagleeye-update`.

Other choices go in front of `bash`: `curl ... | PORT=9000 bash` (also `APP_DIR`, `DATA_DIR`, `BRANCH`).

Day to day:

```
eagleeye-update                          # newest version from GitHub, restart; matches are kept
systemctl status eagleeye-commander      # is it running?
journalctl -u eagleeye-commander -f      # the log
```

From the shell of the Proxmox host the same is `pct exec 120 -- eagleeye-update` (120 being the container's number). An installation made before 2.4.1 does not have the command where `pct exec` looks; update it once with `pct exec 120 -- bash /opt/eagleeye-commander/deploy/install.sh`, and the short form works from then on.

Back up `/var/lib/eagleeye-commander`, or simply include the container in Proxmox's backup job.

### Behind a reverse proxy (Nginx Proxy Manager)

Add a Proxy Host:

| Field | Value |
|---|---|
| Domain Names | your name for the game |
| Scheme | `http` |
| Forward Hostname / IP | the container's address |
| Forward Port | `8080` |
| Cache Assets | **off** |
| Block Common Exploits | on if you like |
| Websockets Support | not needed |

Then pick a certificate on the SSL tab and turn on Force SSL.

- **Leave "Cache Assets" off.** The server already tells browsers to check every file on each visit (answering "unchanged" for the ones they have), so an update reaches everyone at once. A proxy cache in between hands out a mix of old and new files after an update.
- The game uses relative paths only, so it also works **under a sub-path**. Put this in the proxy host's Advanced tab (prefix stripped, trailing slash kept):

  ```
  location = /eagleeye { return 301 /eagleeye/; }
  location /eagleeye/ {
    proxy_pass http://CONTAINER-IP:8080/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  ```

- **Login throttle.** Eight wrong codes or PINs from one address lock that address out for ten minutes. Behind a proxy the server needs the visitor's address from `X-Forwarded-For` (Nginx Proxy Manager sends it). The header is believed only when the request comes from a proxy on the server's own network, on a private network or on the same machine, and only the last address in it counts. Check from outside with

  ```
  curl -s -X POST https://your.domain/api/health
  ```

  `"you"` should be your own public address. If it shows the proxy's address instead (a proxy on another network), name the proxy: `systemctl edit eagleeye-commander`, add

  ```
  [Service]
  Environment=TRUSTED_PROXY=203.0.113.7
  ```

  and `systemctl restart eagleeye-commander`.

### Docker

```
docker build -t eagleeye-commander .
docker run -d --name eagleeye --restart unless-stopped -p 8080:8080 -v eagleeye-data:/data eagleeye-commander
```

### How far the installation has been tested

The one-line install runs on a real Proxmox host: an unprivileged Debian container behind Nginx Proxy Manager with HTTPS (11 Nov 2026). Before that it was run in clean Debian 12 and Debian 13 systems (Node 24 from NodeSource and Debian's own Node 20), including an update and an update blocked by a local edit. Not run yet: `proxmox-lxc.sh` (the script that also makes the container) and the `Dockerfile`.

The first real run also showed that `pct exec` does not search `/usr/local/bin`; since 2.4.1 the update command is linked into `/usr/bin` as well, and the installer no longer prints locale warnings.

## Matches

- **Front page.** The browser keeps a login for every match it has taken part in. The front page lists them ("Dine kampe", with "Din tur" when the others wait for you) and the open matches that still look for generals ("Åbne kampe"). A match can also be private: then it is only reachable through the invite code or link.
- **Lobby.** The host chooses the map, its size, the landscape, the start money, how alliances work, the round deadline, the ceasefire and whether the match is listed. A small picture shows the map as it will be with the generals who have joined so far; "Nyt kort" rolls a new random map. The lobby has a chat.
- **Maps.** `Tilfældigt` is generated from a seed. `Korsvejen` (open country with roads to the middle), `Voldgraven` (a ring-shaped river with a bridge for every base and fords between them) and `Bjergpasset` (ridges with one pass between neighbours) are the same every time and alike for every player. Landscapes (green, snow, desert) only change the look. Every map comes in three **sizes**: normal, large (sides 1.3 times as long) and huge (1.6 times), with more ore on the larger ones. A battle lasts 150, 180 or 210 seconds, so that the slow units can still get there.
- **Bridges** can be shot down: give an attack group the bridge as its target. Whoever stands on it is lost. Anyone can pay to have a fallen bridge rebuilt while planning. Every base can always reach the middle through a ford.
- **Neutral buildings** lie on every map: depots (money after each battle), lookout towers (sight) and field workshops (mend nearby units). They cannot be destroyed. An **engineer** from the barracks takes one over by walking in: send him with a group whose target is close to the building. The enemy's engineer can take it back.
- **Alliances.** Either the teams from the lobby are fixed, or alliances can be offered and accepted during the match and ended again, with one battle's notice or at once, as the host chose. Allies see each other's bases and troops, do not shoot each other and win together. An alliance can hold at most half of the generals who are still in the match. AI generals do not make pacts.
- **Chat** during the match is under the speech bubble in the top bar, to everybody or to allies only.

## Sound

- **Effects and music** are synthesised in the browser by `public/js/audio.js`; there are no audio files for them. The three marches are written as patterns in the `SONGS` table.
- **Voices** are recorded lines in one file, `public/audio/voices.mp3` (about 640 KB), with `public/js/voiceindex.js` saying where each line starts. The radio operator and every unit type have their own voice.
- To change a line or a voice, edit the tables at the top of `tools/make_voices.py` and run it (the header of the file lists what to install). With `--check` each line is listened to by speech recognition, and the takes that are heard wrong are redone.
- The voices are synthesised with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) through kokoro-onnx, then run through a radio effect.

## Settings and graphics

- The cog in the top bar (and on the start page) opens the settings: **Lyd** (effects, voices and music with their own volumes, unit answers on/off, which song), **Grafik** and **Styring**. They are kept in the browser (`localStorage` key `jf2-settings`), one set per device. Only choices that differ from the defaults are stored, so changing a default in `public/js/settings.js` reaches everyone who has not chosen otherwise.
- Graphics choices: detail (high = materials, soft shading, small parts, richer terrain; low = flat cartoon shapes), colours (dusty military, which is the default, or bright cartoon), outline (thick or thin), sharpness (sprite resolution), shadows, visible damage on buildings, idle animation, and the amount of smoke and dust. Changes apply at once; a small scene in the panel shows the result.
- Controls: whether dragging with the left mouse button draws a selection box or moves the map (then Shift+drag draws the box), scrolling when the mouse is at the edge of the map, and the speed a battle starts at.
- All art is drawn by code in `public/js/toon.js`: a model is a list of boxes, cylinders and tubes; the renderer adds outline, shading and a material per part (brick, wall panels, corrugated sheet, tracks with road wheels ...). `public/galleri.html` shows every sprite; add `?p=cartoon`, `?d=low`, `?o=thin`, `?s=96`, `?dmg=2` or `?only=b` to try the variants.

## Offline demo

`npm i --no-save esbuild && node tools/bundle.mjs` writes `dist/eagleeye-commander-demo.html`: one file, skirmish against AI only, opens straight from disk.

## Files

| Path | Contents |
|---|---|
| `public/shared/defs.js` | All balance: buildings, units, damage table, economy |
| `public/shared/map.js` | Map generator: random maps and the three fixed ones, start positions, ore, bridges, neutral buildings |
| `public/shared/sim.js` | Deterministic round simulation: path finding, combat, harvesting, vision |
| `public/shared/engine.js` | Rules: lobby and match options, power, placement, actions, alliances, chat, round resolution, what each player may see |
| `public/shared/ai.js` | AI generals (same actions as humans) |
| `public/js/toon.js` | Cartoon sprite factory: models built from boxes, cylinders and tubes; materials, shading, palettes, damage |
| `public/js/render.js` | Terrain painting, sprites, shroud, effects, radar |
| `public/js/main.js` | The whole UI: front page, lobby, sidebar, orders, chat and alliances, playback, settings panel |
| `public/js/settings.js` | The player's settings (sound, graphics, controls), stored in the browser |
| `public/js/audio.js` | Sound effects, music synthesiser and voice playback |
| `public/audio/voices.mp3` | All spoken lines in one file (made by `tools/make_voices.py`) |
| `public/js/backend.js` | Server play and offline play behind one interface |
| `server/server.js` | HTTP server, storage (matches that nobody uses leave the memory), login, the list for the front page |
| `deploy/install.sh` | Installer and updater for Debian/Ubuntu (systemd service) |
| `deploy/proxmox-lxc.sh` | Makes the container on a Proxmox host and runs the installer in it |
| `public/galleri.html` | Shows every sprite in every direction (for working on the art) |

The `shared/` folder runs unchanged in Node and in the browser. The server computes each round; the client re-runs the same simulation to show it.
