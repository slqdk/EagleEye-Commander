# EagleEye Commander — handoff

Status after the third session (v2.4.0 on branch `v2.4`, 11 Nov 2026; `main` is v2.3.2). Read this first when continuing in a new chat.

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

- **v2.4.0** Match setup, things to fight over, diplomacy and a real front page.
  - **Front page** ("Mine + åbne kampe", Søren's choice): the browser keeps a login per match (`jf2-tokens`); `api/list` returns my matches with status and the open lobbies. A reload stays in the match (session storage), a new visit shows the front page.
  - **Lobby options**: map (`random`, `kors`, `grav`, `pas`), landscape (`grass`, `snow`, `desert`, looks only), start money, diplomacy (`fixed`, `notice`, `free`), listed or private, plus deadline and ceasefire as before. Map preview (the client generates the same map from the seed), "Nyt kort", chat.
  - **Maps** (`map.js`): fixed maps are built in polar coordinates folded into one half sector, so they are alike for every base and exactly symmetric for 2 and 4 players. Output now also has `bridges` and `neutrals`. Every base reaches the middle through fords alone.
  - **Bridges**: `game.bridges = [{ id, x, y, w, h, cells, a, hp }]`, decks on water cells. Only shot on purpose: an order whose last point is on or next to a standing bridge makes the group a siege group (`u.sg`, mode `siege` in `sim.js`). Ground units on the deck are lost when it falls. `rebridge` rebuilds for `DEFS.bridge.cost`. Søren chose "can be rebuilt".
  - **Neutral buildings** (`DEFS.neutral`: depot, tower, shop; `game.neut = [{ id, t, x, y, o }]`): block the way, cannot be shot, give sight / income after the battle / healing. Captured only by the new unit **Ingeniør** (`eng`, no weapon, Søren's choice): he follows his group, then walks into the nearest neutral building within `DEFS.capRange` of the target that his team does not hold, and is used up (`result.players[].used`, not a loss). Allowed during the ceasefire. The AI buys one engineer at a time and sends him to the nearest one.
  - **Alliances**: a team is a number in `p.team` (lobby teams 1-3, pacts from `game.nextTeam`). Actions `ally` (offer, or accept the other's offer), `unally`, `leave`; `p.leaving` for notice. At most half of the living generals in one alliance when it is formed; AI never joins. Allies win together.
  - **Chat**: `game.chat` (150 lines, system lines for joins, pacts, bridges, eliminations), action `chat` in every phase, to all or to allies (`ids`). Speech bubble in the top bar with an unread count; a toast shows new messages.
  - **Server**: an index of all matches (front page, deadlines) and a cache of the ones in use; a finished match leaves the memory after ten minutes, any other after six hours. API answers are gzipped. At most 20 new matches per address per hour. `upgrade()` in `engine.js` gives older saved matches the new fields.
  - **Buildings have their own outlines** (Søren, after seeing the live game: "they are all square"): no more square slab filling the footprint. Cut and round slabs, barrel roofs (`Kit.arch`), an eight-sided radar house, a round-ended tech centre, a six-sided control tower; helpers `slab`, `oct`, `block` in `toon.js`.
  - New sprites: bridge decks (drawn by `render.js` along the road), depot, lookout tower, field workshop, engineer (hard hat and toolbox, three voice lines each way).
  - **Soldiers redrawn** (Søren: "identical dolls, make them more military and easier to tell apart"): the uniform is the faction's field cloth with the team colour on shoulders, sleeves and a helmet band; the helmet sits low over a shadowed face; packs, webbing and pouches. Each kind has its own outline: rifle, launcher on the shoulder with spare rockets in the pack, raised stick grenade and field cap, fuel tanks with gas mask and pilot flame, hard hat with spanner and toolbox. `galleri.html?only=i` shows them large.
  - **Map size** (Søren: "aren't the maps small for a long match?"): `opts.size` = `normal`, `large` (sides x 1.3) or `huge` (x 1.6), in the lobby and in the skirmish form. Larger maps get extra ore fields, and the battle lasts 150 / 180 / 210 seconds (`DEFS.sizes`), because a rifleman walks one cell a second and everybody goes home after each battle. Six AI generals on a huge map take about a second a round to resolve on the build machine (two at worst).
  - The AI now and then pays to rebuild a fallen bridge (it still never brings one down).
  - **2.3.3** (also merged into 2.4): a request for a path beginning with `//` made `new URL` throw and stopped the server. The path is now read from the request line, and a failing request is answered with an error instead of ending the process.

- **v2.4.1** The installer, and one fix in the client. `pct exec <id> -- eagleeye-update` failed on Søren's host with "Failed to exec": `pct exec` does not search `/usr/local/bin`. The command is now also linked into `/usr/bin`, the installer sets its own `PATH` and a locale that exists (`C.UTF-8`, no more perl warnings). The way that always works: `pct exec <id> -- bash /opt/eagleeye-commander/deploy/install.sh`. The client fix: opening an online match from the front page (or reloading the page) when a round had been resolved since the last visit threw an error in `renderSide()` (`st.ps` was still empty), so the battle never played and the view hung; reloading did not help. `applyView()` now works out the power state before the first playback. Present since 2.3.

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
3. Not ported from v66 yet: mines, the A-bomb, the shared fortress, PWA service worker.
4. Aircraft are a first version: no air-to-air combat, no transport, landed aircraft can only be hit by anti-air weapons, and aircraft in a mixed group fly ahead of the ground units.
5. Walls are drawn as separate blocks (no joined corners). Vehicles do not show damage on the sprite itself (only smoke), and infantry is still a simple 2D figure.
6. AI knows where every base is and always attacks the nearest; no difficulty levels.
7. Music and voices have not been heard by anyone yet (see v2.2.0): expect to adjust the mix, the radio effect or single lines. The new volume sliders make that easy to try.
   The graphics were only looked at as screenshots from a headless browser: speed on a real phone at high detail is untested (low detail and "Skarphed: Normal" are the fallbacks).
8. Late joining after the match has started is not possible; a spectator link does not exist.
9. New in 2.4 and only tried by the AI and by scripted browsers: bridge sieges, engineers, alliances, chat. Watch for: random maps where the way round a fallen bridge is very long (seen: 251 cells instead of 65), bridges that make a map lopsided, depots that pay too much (400 a round), alliances in a three-player match (two against one until one leaves). The AI never attacks a bridge and never allies.
10. Chat and the front page are polled (4 and 20 seconds); nothing is pushed, and there is still no notice outside the page that it is your turn.

## Content backlog (from the "what is missing" talks; nothing here is decided)

- Interface: mouse cursors that change over targets, control groups on Ctrl+1-9, a sidebar and menus that follow the palette, an end-of-match screen with graphs.
- Units and buildings: an engineer who can also take enemy buildings, and a spy; a mobile construction yard for a second base; a superweapon with a countdown everyone sees (v66 had the A-bomb); navy (yard, ships, submarines; the maps already have water); transport, mine layer and paratroopers; a repair depot and silos; bonus crates on the map.
- Match setup: tech level in the lobby, a campaign with briefings (large, and a poor fit for a friend group). (Done in 2.4: maps, landscapes, start money, bridges, neutral buildings, alliances, chat.)
- Orders: more than "go there and hunt": hold a spot, escort, pick a kind of target, leave later than the other groups. Probably the cheapest way to add skill to a game without unit control.
- Look: joined walls and gates, damage on vehicle sprites, infantry that aims and falls, craters and wrecks that stay between rounds.
- Søren's earlier pick was atmosphere first (done in v2.2-2.3); the suggestion after that was engineer + mobile construction yard.

## Conventions

- UI text is Danish; code and comments are English.
- All numbers that affect balance live in `public/shared/defs.js`.
- After changing the simulation, run `npm test` and check that "deterministisk: ja" still prints.
- Bump `?v=` in `index.html` when static files change.
- New art: build the model in `toon.js` from the kit's primitives, give parts a palette colour (the colour picks the material) and look at it in `galleri.html` in both palettes before trying it in the game.
