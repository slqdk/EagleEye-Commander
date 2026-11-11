# EagleEye Commander — handoff

Status after the third session (v2.3.2, 11 Nov 2026). Read this first when continuing in a new chat.

- The game is called **EagleEye Commander** since v2.3.2 (before: Jernfronten 2). Internal names were left alone on purpose: the `jf2-*` keys in `localStorage`, `window.JF`, `JF_OFFLINE`.
- The code lives in **https://github.com/slqdk/EagleEye-Commander** (public, branch `main`). Søren's server pulls from `main` with `eagleeye-update`, so `main` must always be playable; larger work goes on a branch.
- It is meant to run in a Proxmox LXC behind Nginx Proxy Manager (see the README).

## Changes since v2.0.0

- **v2.0.1** Radio voice is an American military operator in English.
- **v2.1.0**
  - Units can be picked on the map: left-drag a box (mouse), click a unit, double-click for all of that kind, Shift to add; then give the order (see v2.1.1). On touch a tap picks every unit of that kind. Because the left button now selects, the map is moved with the right or middle button, arrow keys/WASD or the radar (touch still drags).
  - Orders may name exact units: `order.slots = { type: [index, …] }` next to the counts in `order.units`. `assignGroups()` in `sim.js` is the single place that decides who is in which group, used by both simulation and client.
  - Aircraft: Flyveplads (4 pads each), Jagerbomber for Alliancen (two bombs per sortie), Kamphelikopter for Pagten (hovers, eight rockets). They fly straight over everything and return to re-arm. Only weapon types `mg`, `rocket` and `flak` can hit them: MG-bunker, Spejdervogn, Raketsoldat and the new Luftværnskanon / Luftværnsraketter.
  - Large screens: wider sidebar, larger labels, closer default zoom.
- **v2.1.1** Ordering changed after play-testing (a plain click on the map made orders by accident, and the arrows were not self-explanatory): select units, press **Send af sted** (or G, or the sidebar's Angreb button), then point out the target. A click elsewhere only deselects. A planned attack is shown as a numbered flag with a label ("5 enheder") at the target; the route line is drawn only for the group that is selected, hovered or being edited. Clicking a flag selects its group.

- **v2.2.0** Music, unit voices and build animations.
  - Voices are now recorded lines (`public/audio/voices.mp3` + `public/js/voiceindex.js`, built by `tools/make_voices.py` with Kokoro-82M and a radio effect), so they sound the same on every device. The radio operator has 24 lines; each of the 14 unit types answers with three lines when selected and three when sent off. Browser speech synthesis is only a fallback if the file fails to load.
  - Music: three original marches (Stålmarch, Malmfeber, Jernregn) played live by a small synthesiser in `audio.js`. Level 0 while planning, 1 for a ceasefire round, 2 in battle. Menu has on/off for effects, voices and music, a volume slider and "next track".
  - Animations: buildings rise out of the ground with dust and hammering, sold buildings sink, destroyed buildings collapse, new units come out of the barracks or factory door and walk to their post, new aircraft land on the pad, the command centre's crane swings while building, the radar screen rolls on.
  - Not judged by ear: the sound was built in a container without audio output. Lines were checked with speech recognition and the music by level and spectrum only, so tone and mix need a human listen.

- **v2.3.0** Settings panel and detailed graphics.
  - **Settings** (cog in the top bar, also on the start page and in the ☰ menu), three tabs. Lyd: effects, voices and music each with on/off and volume, unit answers on/off, song choice. Grafik: detail high/low, colours cartoon/military, outline thick/thin, sharpness, shadows, visible damage, idle animation, amount of smoke. Styring: left mouse drag = selection box or map (then Shift+drag = box), scrolling at the edge of the map, start speed of battles. Stored per device in `localStorage` (`jf2-settings`, defaults in `public/js/settings.js`); everything applies live.
  - **Sprites** (`toon.js` rewritten): every part now has a material drawn on its surfaces in the part's own coordinates (brick courses, prefab wall panels with bolts, corrugated roofs, seamed team-colour roofs, riveted bands, concrete slabs with cracks, crates, lattice girders, roller doors, hazard stripes, window frames with glints, track links and road wheels, tyres with hubs), plus soft shading, a lighter bevel and a small drop shadow under each part. New `tube` primitive gives round barrels, wheels, pipes and rockets. Parts are ordered by a pairwise "south of / above" rule instead of only their centres, so details can be placed freely. All models got extra parts: vents, air conditioners, ladders, lamps, drums, antennas, dishes, skirts, mudguards, exhausts, headlights, hatches. The factory's saw-tooth roof now shows its lit glazing.
  - **Two palettes**: military (dusty field colours, team colour toned towards the faction's paint, weathering blotches, olive terrain; the default since v2.3.1) and cartoon (the bright colours from before).
  - **Damage**: buildings below 50 % and 25 % health show soot, cracks and holes with a burnt inside (`sprite(..., { dmg })`); vehicles smoke when badly hit; wrecks and rubble burn for a while; explosions throw debris and a shock ring.
  - **Terrain**: grain, bare earth, flowers or straw, pebbles, bushes, firs among the leafy trees, faceted boulders, foam and deeper water, trampled earth around buildings.
  - Sprite memory is capped (least recently used sprites are dropped), and vehicles no longer carry an unused shadow image.
  - Søren asked for the look to match Red Alert exactly "in cartoon form". That was declined: its buildings and units are Westwood's/EA's designs. The answer was more detail in the game's own designs, plus the military palette.
- **v2.3.1** Søren chose the **military palette as the default** (cartoon is still one click away in the settings). Settings now store only what differs from the defaults (`{ v: 2, ... }`), so a changed default reaches everyone who has not chosen otherwise; a stored 2.3.0 blob with the old default palette follows the new one.

- **v2.3.2** New name, GitHub and installation. `deploy/install.sh` installs or updates on Debian/Ubuntu (Node, clone to `/opt/eagleeye-commander`, user `eagleeye`, data in `/var/lib/eagleeye-commander`, systemd service, health check, the command `eagleeye-update`); `deploy/proxmox-lxc.sh` makes the container on the Proxmox host first. Server: the data folder setting is `DATA_DIR` (`JF_DATA` still works), `HOST` and `TRUSTED_PROXY` are new, static files get an ETag and gzip (still revalidated on every load, so an update reaches everyone at once), the login throttle takes the visitor's address only from a nearby proxy and only the last entry of `X-Forwarded-For`, `api/health` reports the version and the address it sees (`you`).

## What was decided

- Rebuild from scratch instead of extending v66. v66 was "own base + separate raids"; the 90s feel needs one shared battlefield.
- Game model: keep v66's rhythm (build, plan attacks, press Ready, battle resolves automatically, watch it). New: all bases sit on **one shared map per match** with ore fields and shroud; armies **march across the map**; no control of single units.
- A match has a winner (last team with buildings) and then you start a new one.
- Server: Node.js on Proxmox (no dependencies, JSON files). Client: vanilla JS + canvas.
- Two factions, Alliancen and Pagten, with partly different units and defences.
- Art: original cartoon style (outlines, team colours, chunky shapes, drawn by code) in the slanted 90s view, at a level of detail and in a palette the player chooses. Not copies of any existing game's units, buildings, names or logo; this was asked for again in session three and stays as it is.

## How a round works

1. Planning: build (sidebar picture → clock wipe → place near own buildings), train units, sell/repair, make up to 3 attack groups (units + route of up to 4 points; the last is the target).
2. Ready: when every living human is ready, or the deadline passes, the server lets the AI generals act, then simulates 150 seconds on the whole map.
3. In the simulation: groups follow their route and then hunt the nearest enemy buildings; units left at home guard the base; harvesters shuttle ore to the refineries (that is the income); defences fire.
4. Afterwards: survivors are back home, buildings keep their damage, ore regrows a little, everyone watches the playback (auto speed: fast when quiet, slow when fighting) and gets a report.
- Ceasefire in the first rounds (default 2): nobody can shoot, but groups can scout.
- Power as in v66: the newest buildings switch off first.
- Radar station: turns on the minimap and reveals enemy command centres.
- Lose all non-wall buildings and you are out. Losing buildings pays 35 % rebuilding aid; every round pays 300 supply.

## Architecture in one paragraph

`public/shared/*` is the game (definitions, map, simulation, rules, AI) and runs in both Node and the browser. `server/server.js` wraps it with login (invite code + name + PIN) and JSON storage. `public/js/backend.js` gives the client the same interface for server play and for offline skirmish (rules run in the browser, saved in localStorage). The playback is not a recording: the client gets the pre-round snapshot and re-runs `sim.js`. Sprites are generated in code (`toon.js`): each model is a list of boxes, cylinders and tubes with materials, rendered once per direction, team colour, frame and damage level and kept in a capped cache. `settings.js` holds the player's choices; `main.js` passes the graphics ones to `toon.js` (`setStyle`) and `render.js` (`R.opt`, `R.restyle()`), `audio.js` listens for the sound ones.

## Tested

- Headless AI matches (2–6 players): deterministic, 60–1200 ms per round, matches last roughly 10–30 rounds.
- Browser: offline skirmish through many rounds for both factions, placement, walls, sell, repair, train/undo, orders, playback, report, victory screen; box selection, click-to-order and both aircraft types on a 1920 px screen.
- Server: create, join by invite link on a phone-sized screen, lobby, start, both ready, round resolves for both.
- v2.3.0: every sprite in both palettes, both detail levels and all damage levels (gallery page); the settings panel on desktop and phone size; every graphics setting flipped while planning and during a battle without errors; left-drag modes, edge scrolling, start speed; staged battles for both factions (1× and 2× pixel density).

## Known gaps and ideas, roughly in priority order

0. **No match with real people has been played yet.** The server itself runs for real since 11 Nov 2026 (Proxmox LXC behind Nginx Proxy Manager, installed with `deploy/install.sh`); `proxmox-lxc.sh` and the Dockerfile have still not been run. Not confirmed: that the server sees the visitors' own addresses through the proxy (`"you"` in `api/health`). Nothing tells a player that a round has been resolved or that the others are waiting (no mail, push or chat message), which matters most for "play in a busy week".
1. **Balance is a first pass.** Only AI-vs-AI tested. Watch: early infantry rushes right after the ceasefire, Pagten's lightning tower, artillery.
2. **Playback leaks hidden information.** The client receives the full pre-round snapshot (the shroud is applied when drawing). Fine among friends; fix by recording per-team keyframes on the server.
3. Not ported from v66 yet: mines, the A-bomb, the shared fortress, snow maps, PWA service worker.
4. Aircraft are a first version: no air-to-air combat, no transport, landed aircraft can only be hit by anti-air weapons, and aircraft in a mixed group fly ahead of the ground units.
5. Walls are drawn as separate blocks (no joined corners). Vehicles do not show damage on the sprite itself (only smoke), and infantry is still a simple 2D figure.
6. AI knows where every base is and always attacks the nearest; no difficulty levels.
7. Music and voices have not been heard by anyone yet (see v2.2.0): expect to adjust the mix, the radio effect or single lines. The new volume sliders make that easy to try.
   The graphics were only looked at as screenshots from a headless browser: speed on a real phone at high detail is untested (low detail and "Skarphed: Normal" are the fallbacks).
8. Late joining after the match has started is not possible; a spectator link does not exist.
9. Teams exist (lobby: Hold 1–3, shared vision, no friendly fire) but have only been tested lightly.

## Content backlog (from the "what is missing" talks; nothing here is decided)

- Interface: mouse cursors that change over targets, control groups on Ctrl+1-9, a sidebar and menus that follow the palette, an end-of-match screen with graphs.
- Units and buildings: engineer (captures buildings) and spy; a mobile construction yard for a second base; a superweapon with a countdown everyone sees (v66 had the A-bomb); navy (yard, ships, submarines; the maps already have water); transport, mine layer and paratroopers; a repair depot and silos; bonus crates on the map.
- Match setup: snow and desert maps, fixed hand-made maps, start money and tech level in the lobby, destructible bridges, neutral buildings to fight over, alliances and chat during the match, a campaign with briefings (large, and a poor fit for a friend group).
- Orders: more than "go there and hunt": hold a spot, escort, pick a kind of target, leave later than the other groups. Probably the cheapest way to add skill to a game without unit control.
- Look: joined walls and gates, damage on vehicle sprites, infantry that aims and falls, craters and wrecks that stay between rounds.
- Søren's earlier pick was atmosphere first (done in v2.2-2.3); the suggestion after that was engineer + mobile construction yard.

## Conventions

- UI text is Danish; code and comments are English.
- All numbers that affect balance live in `public/shared/defs.js`.
- After changing the simulation, run `npm test` and check that "deterministisk: ja" still prints.
- Bump `?v=` in `index.html` when static files change.
- New art: build the model in `toon.js` from the kit's primitives, give parts a palette colour (the colour picks the material) and look at it in `galleri.html` in both palettes before trying it in the game.
