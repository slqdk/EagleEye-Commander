// EagleEye Commander — all balance lives here. Shared by server, AI and client.

export const DEFS = {
  version: 2,
  tick: 0.1,             // seconds per simulation step
  roundSeconds: 150,     // battle time simulated per round
  startMoney: 4000,
  moneyChoices: [2000, 4000, 8000, 12000],   // the host picks one in the lobby
  hqIncome: 300,         // field supply per round, so a wrecked player can recover
  aid: 0.35,             // rebuilding aid: share of the price of buildings lost in the round
  peaceRounds: 2,        // nobody can shoot in the first rounds (scouting is allowed)
  maxOrders: 3,          // attack groups per round
  maxPts: 4,             // route points per attack group (last one is the target)
  unitCap: 60,
  padsPerAirfield: 4,
  buildGap: 2,           // new buildings must be this close to one of your own
  sellRate: 0.5,
  repairRate: 0.4,       // repairing full health costs this share of the price
  guardRange: 11,        // home units engage enemies this close to their post …
  homeRange: 6,          // … and any enemy this close to one of the base's buildings
  spyCost: 200,          // a radar station can spy on an enemy general: his camp as it is right now (mines stay hidden)
  mineCap: 10,           // minefields a general can have at one time
  mineGap: 5,            // a minefield must be this close to one of the base's buildings
  // The A-bomb: rounds of preparation (after the first silo and after every use), when in the battle it is launched and
  // lands (seconds), blast radius, the inner share where everything is destroyed, damage further out as a share of full health.
  nuke: { prep: 5, launch: 1, hit: 5, r: 4.5, core: 0.6, edge: 0.8 },
  startArmy: { inf: 5, rkt: 2 },
  ore: { value: 50, cellMax: 12, cap: 10, rate: 1, unload: 3, regrow: 1, spread: 0.03 },
  bridge: { name: 'Bro', hp: 3000, cost: 800 },   // only shot at on purpose: an attack group whose target is the bridge
  capRange: 8,           // an engineer walks into a neutral building this close to his group's target
  // Neutral buildings lie on the map from the start (2x2). Nobody can shoot them; an engineer takes them over.
  neutral: {
    depot: { name: 'Forsyningsdepot', w: 2, h: 2, sight: 4, income: 400, desc: 'Giver ejeren 400 ekstra efter hvert slag.' },
    tower: { name: 'Udkigstårn', w: 2, h: 2, sight: 13, desc: 'Ser langt ud over slagmarken for ejeren og hans allierede.' },
    shop:  { name: 'Feltværksted', w: 2, h: 2, sight: 4, heal: 0.04, range: 5, desc: 'Reparerer og plejer ejerens og de allieredes enheder i nærheden under slaget.' },
  },
  maps: { random: 'Tilfældigt', kors: 'Korsvejen', grav: 'Voldgraven', pas: 'Bjergpasset' },
  // Map size: how much longer each side is, and how long a battle lasts (the slow units must be able to get there).
  sizes: { normal: { name: 'Normalt', k: 1, seconds: 150 }, large: { name: 'Stort', k: 1.3, seconds: 180 }, huge: { name: 'Kæmpe', k: 1.6, seconds: 210 }, giant: { name: 'Enormt', k: 2, seconds: 250 } },
  themes: { grass: 'Grønt', snow: 'Sne', desert: 'Ørken' },
  diplo: { fixed: 'Faste hold', notice: 'Pagter med varsel', free: 'Pagter uden varsel' },

  factions: {
    A: { name: 'Alliancen', desc: 'Hurtige og præcise. Lang rækkevidde, lettere panser.' },
    P: { name: 'Pagten', desc: 'Tunge og brutale. Tykt panser og masser af ild.' },
  },
  colors: [
    { id: 'blå', main: '#2f7fe6', dark: '#1a4c96', light: '#93c4ff' },
    { id: 'rød', main: '#e0392c', dark: '#96211a', light: '#ff9a8a' },
    { id: 'grøn', main: '#35b34a', dark: '#1e7430', light: '#9ae6a4' },
    { id: 'gul', main: '#f2c21c', dark: '#a37b08', light: '#ffe98a' },
    { id: 'orange', main: '#f07f1e', dark: '#a04c0a', light: '#ffc08a' },
    { id: 'lilla', main: '#9a55e0', dark: '#5f2f96', light: '#d0a8ff' },
  ],

  // weapon type vs armour class (a missing class means the weapon cannot hit it; only mg, rocket and flak reach aircraft)
  dmg: {
    bullet: { inf: 1.0, light: 0.5, heavy: 0.15, bld: 0.1, wall: 0.05 },
    at:     { inf: 0.25, light: 1.0, heavy: 1.0, bld: 0.45, wall: 0.5 },
    cannon: { inf: 0.45, light: 1.0, heavy: 0.9, bld: 0.5, wall: 0.7 },
    he:     { inf: 1.2, light: 0.7, heavy: 0.45, bld: 0.8, wall: 1.0 },
    fire:   { inf: 1.5, light: 0.5, heavy: 0.25, bld: 0.7, wall: 0.2 },
    arc:    { inf: 1.5, light: 1.0, heavy: 1.0, bld: 0.3, wall: 0.2 },
    mg:     { inf: 1.0, light: 0.5, heavy: 0.15, bld: 0.1, wall: 0.05, air: 0.7 },
    rocket: { inf: 0.25, light: 1.0, heavy: 1.0, bld: 0.45, wall: 0.5, air: 1.0 },
    flak:   { air: 1.0 },
  },

  // f: which factions can build it. needs: buildings that must stand (and have power).
  buildings: {
    hq:   { name: 'Kommandocentral', f: 'AP', w: 3, h: 3, cost: 2500, hp: 7000, power: 0, sight: 8, only: 'nohq',
            desc: 'Hjertet af basen. Uden den kan du ikke opføre nye bygninger.' },
    pow:  { name: 'Kraftværk', f: 'AP', w: 2, h: 2, cost: 300, hp: 1400, power: 100, sight: 4,
            desc: 'Giver 100 strøm. Mangler der strøm, slukker de senest byggede bygninger.' },
    ref:  { name: 'Raffinaderi', f: 'AP', w: 3, h: 3, cost: 1400, hp: 2600, power: -30, sight: 5, needs: ['pow'],
            desc: 'Følger med en malmhøster, som kører malm hjem under kampen. Hold feltet syd for porten frit.' },
    bar:  { name: 'Kaserne', f: 'AP', w: 2, h: 2, cost: 300, hp: 1600, power: -10, sight: 5, needs: ['pow'],
            desc: 'Træner infanteri.' },
    fac:  { name: 'Kampvognsfabrik', f: 'AP', w: 3, h: 3, cost: 1500, hp: 3000, power: -30, sight: 5, needs: ['ref'],
            desc: 'Bygger køretøjer og ekstra malmhøstere.' },
    rad:  { name: 'Radarstation', f: 'AP', w: 2, h: 2, cost: 900, hp: 1700, power: -40, sight: 12, needs: ['ref'],
            desc: 'Tænder radarkortet og låser op for artilleri og spionage: find fjendens lejre, og angrib dem fra radaren.' },
    tech: { name: 'Teknologicenter', f: 'AP', w: 3, h: 2, cost: 1600, hp: 2000, power: -60, sight: 5, needs: ['rad', 'fac'],
            desc: 'Låser op for fraktionens tungeste våben.' },
    air:  { name: 'Flyveplads', f: 'AP', w: 3, h: 2, cost: 1300, hp: 1700, power: -40, sight: 6, needs: ['rad'],
            desc: 'Plads til fire fly. Flyene vender hjem hertil for at få ny ammunition.' },
    pill: { name: 'MG-bunker', f: 'A', w: 1, h: 1, cost: 400, hp: 950, power: -10, sight: 6, needs: ['bar'],
            weapon: { w: 'mg', dmg: 14, cd: 0.3, range: 5 },
            desc: 'Hurtig ild. Dødelig mod infanteri, svag mod panser. Kan også ramme fly.' },
    tur:  { name: 'Kanontårn', f: 'A', w: 1, h: 1, cost: 750, hp: 1200, power: -20, sight: 7, needs: ['fac'],
            weapon: { w: 'at', dmg: 75, cd: 1.8, range: 6.5 },
            desc: 'Drejeligt kanontårn. Stopper kampvogne på lang afstand.' },
    flt:  { name: 'Flammetårn', f: 'P', w: 1, h: 1, cost: 500, hp: 1000, power: -15, sight: 6, needs: ['bar'],
            weapon: { w: 'fire', dmg: 30, cd: 0.8, range: 4, splash: 0.9 },
            desc: 'Brænder alt tæt på. Rammer flere på én gang.' },
    coil: { name: 'Lyntårn', f: 'P', w: 1, h: 1, cost: 1300, hp: 1100, power: -75, sight: 7, needs: ['rad'],
            weapon: { w: 'arc', dmg: 190, cd: 3.5, range: 7 },
            desc: 'Sender lynnedslag mod alt, der nærmer sig. Sluger strøm.' },
    aag:  { name: 'Luftværnskanon', f: 'A', w: 1, h: 1, cost: 600, hp: 850, power: -20, sight: 8, needs: ['rad'],
            weapon: { w: 'flak', dmg: 22, cd: 0.35, range: 8 },
            desc: 'Skyder kun på fly. Hurtig ild i stor højde.' },
    sam:  { name: 'Luftværnsraketter', f: 'P', w: 1, h: 1, cost: 700, hp: 850, power: -25, sight: 9, needs: ['rad'],
            weapon: { w: 'flak', dmg: 120, cd: 2.2, range: 9 },
            desc: 'Skyder kun på fly. Langsom, men hvert træf gør ondt.' },
    wall: { name: 'Betonmur', f: 'AP', w: 1, h: 1, cost: 50, hp: 600, power: 0, sight: 1, wall: true, needs: ['bar'],
            desc: 'Tvinger fjenden til at bryde igennem eller gå udenom.' },
    mine: { name: 'Minefelt', f: 'AP', w: 1, h: 1, cost: 100, hp: 1, power: 0, sight: 0, mine: true, needs: ['bar'],
            boom: { w: 'he', dmg: 260, splash: 1.3 },
            desc: 'Usynligt for fjenden. Springer én gang, når en fjendtlig enhed på jorden kører eller går ind på feltet.' },
    silo: { name: 'Raketsilo', f: 'AP', w: 2, h: 2, cost: 3000, hp: 1500, power: -80, sight: 4, needs: ['tech'], only: 'one',
            desc: 'Gør en A-bombe klar på fem runder. Bomben sættes på et angreb mod en lejr og rammer den tætteste klynge af bygninger.' },
  },

  // cls: inf / light / heavy. from: where it is produced. r: body radius in cells.
  units: {
    inf:  { name: 'Riffelskytte', f: 'AP', cost: 100, hp: 50, speed: 1.0, cls: 'inf', r: 0.2, sight: 5, from: 'bar', needs: ['bar'],
            weapon: { w: 'bullet', dmg: 8, cd: 0.8, range: 3.5 }, desc: 'Billig og alsidig mod infanteri.' },
    rkt:  { name: 'Raketsoldat', f: 'AP', cost: 300, hp: 45, speed: 0.9, cls: 'inf', r: 0.2, sight: 5, from: 'bar', needs: ['bar'],
            weapon: { w: 'rocket', dmg: 45, cd: 2.4, range: 4.5 }, desc: 'Panserværn til fods. Kan også skyde fly ned.' },
    gren: { name: 'Grenadér', f: 'P', cost: 160, hp: 55, speed: 1.0, cls: 'inf', r: 0.2, sight: 5, from: 'bar', needs: ['bar'],
            weapon: { w: 'he', dmg: 28, cd: 1.6, range: 3, splash: 0.7 }, desc: 'Kaster håndgranater. God mod grupper og bygninger.' },
    flm:  { name: 'Flammekaster', f: 'P', cost: 300, hp: 65, speed: 0.9, cls: 'inf', r: 0.2, sight: 5, from: 'bar', needs: ['bar', 'ref'],
            weapon: { w: 'fire', dmg: 20, cd: 0.5, range: 2, splash: 0.8 }, desc: 'Kort rækkevidde. Rydder infanteri og bygninger.' },
    eng:  { name: 'Ingeniør', f: 'AP', cost: 500, hp: 45, speed: 1.0, cls: 'inf', r: 0.2, sight: 4, from: 'bar', needs: ['bar'], eng: true,
            desc: 'Ubevæbnet. Send ham med en angrebsgruppe: han går ind i en neutral bygning nær målet og overtager den.' },
    jeep: { name: 'Spejdervogn', f: 'A', cost: 500, hp: 150, speed: 2.6, cls: 'light', r: 0.4, sight: 9, from: 'fac', needs: ['fac'],
            weapon: { w: 'mg', dmg: 12, cd: 0.35, range: 4 }, desc: 'Lynhurtig med maskingevær. Ser langt og kan ramme fly.' },
    lt:   { name: 'Let kampvogn', f: 'A', cost: 700, hp: 300, speed: 2.0, cls: 'heavy', r: 0.42, sight: 6, from: 'fac', needs: ['fac'],
            weapon: { w: 'cannon', dmg: 28, cd: 1.2, range: 4.5 }, desc: 'Hurtig og billig kampvogn.' },
    mt:   { name: 'Kampvogn', f: 'A', cost: 900, hp: 450, speed: 1.5, cls: 'heavy', r: 0.46, sight: 6, from: 'fac', needs: ['fac'],
            weapon: { w: 'cannon', dmg: 42, cd: 1.5, range: 4.75 }, desc: 'Rygraden i en panserstyrke.' },
    art:  { name: 'Artilleri', f: 'A', cost: 800, hp: 110, speed: 1.0, cls: 'light', r: 0.42, sight: 6, from: 'fac', needs: ['fac', 'rad'],
            weapon: { w: 'he', dmg: 120, cd: 5, range: 9, minRange: 2.5, splash: 1.2 }, desc: 'Beskyder baser på lang afstand. Skrøbeligt tæt på.' },
    td:   { name: 'Panserjæger', f: 'A', cost: 1300, hp: 420, speed: 1.3, cls: 'heavy', r: 0.46, sight: 7, from: 'fac', needs: ['fac', 'tech'],
            weapon: { w: 'at', dmg: 150, cd: 3, range: 6.5 }, desc: 'Langtrækkende kanon, der knækker tungt panser.' },
    ht:   { name: 'Tung kampvogn', f: 'P', cost: 1100, hp: 620, speed: 1.2, cls: 'heavy', r: 0.5, sight: 6, from: 'fac', needs: ['fac'],
            weapon: { w: 'cannon', dmg: 70, cd: 1.8, range: 4.75 }, desc: 'Langsom panserknytnæve.' },
    kat:  { name: 'Raketkaster', f: 'P', cost: 900, hp: 130, speed: 1.3, cls: 'light', r: 0.44, sight: 6, from: 'fac', needs: ['fac', 'rad'],
            weapon: { w: 'he', dmg: 150, cd: 6, range: 9, minRange: 3, splash: 1.5 }, desc: 'Raketsalver over et stort område. Kan ikke skyde tæt på.' },
    kol:  { name: 'Kolos', f: 'P', cost: 2000, hp: 1400, speed: 0.8, cls: 'heavy', r: 0.6, sight: 6, from: 'fac', needs: ['fac', 'tech'],
            weapon: { w: 'cannon', dmg: 130, cd: 2.2, range: 5, splash: 0.4 }, desc: 'Supertung kampvogn. Næsten umulig at stoppe.' },
    jet:  { name: 'Jagerbomber', f: 'A', cost: 1200, hp: 240, speed: 5, cls: 'air', air: true, r: 0.45, sight: 8, from: 'air', needs: ['air'],
            ammo: 2, rearm: 9, weapon: { w: 'he', dmg: 260, cd: 0.4, range: 1.3, splash: 1.3 },
            desc: 'Flyver over alt, kaster to bomber og vender hjem efter flere. Kun luftværn kan ramme den.' },
    heli: { name: 'Kamphelikopter', f: 'P', cost: 1300, hp: 340, speed: 2.4, cls: 'air', air: true, hover: true, r: 0.45, sight: 8, from: 'air', needs: ['air'],
            ammo: 8, rearm: 10, weapon: { w: 'at', dmg: 55, cd: 0.9, range: 4.5 },
            desc: 'Svæver over målet og affyrer otte raketter, før den må hjem. Kun luftværn kan ramme den.' },
    harv: { name: 'Malmhøster', f: 'AP', cost: 1100, hp: 700, speed: 1.3, cls: 'heavy', r: 0.5, sight: 4, from: 'fac', needs: ['fac', 'ref'],
            harv: true, desc: 'Ekstra høster. Hver høster kører malm hjem for ca. 2.000 pr. runde.' },
  },
};

export const B = t => DEFS.buildings[t];
export const U = t => DEFS.units[t];
export const dmgMult = (w, cls) => DEFS.dmg[w][cls] ?? 0;
export const isCombat = t => !DEFS.units[t].harv;
// a building that makes up the base: walls and minefields do not count
export const isBase = t => !DEFS.buildings[t].wall && !DEFS.buildings[t].mine;
