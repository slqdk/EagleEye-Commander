// EagleEye Commander — the player's own settings (sound, graphics, controls), kept in the browser.
const DEFAULTS = {
  // sound
  sfx: true, sfxVol: 0.8, voice: true, voiceVol: 0.9, unitVoice: true, music: true, musicVol: 0.6,
  track: 'auto',         // 'auto' = the songs take turns, or the number of one song ('0', '1', ...)
  // graphics
  detail: 'high',        // 'high' = materials, soft shading and small parts; 'low' = the plain cartoon look
  palette: 'military',   // 'military' = dusty field colours; 'cartoon' = bright
  outline: 'thick',      // 'thick' | 'thin'
  sharp: 'auto',         // sprite resolution: 'auto' | 'high' | 'normal'
  shadows: true, damage: true, anim: true,
  particles: 1,          // smoke and dust: 0.4 little, 1 normal, 1.8 a lot
  // controls
  leftDrag: 'select',    // dragging with the left mouse button: 'select' = a selection box, 'pan' = moves the map
  edgeScroll: false,
  replaySpeed: 'auto',   // speed a battle starts at: 'auto' | '1' | '4'
};
const CHOICES = { track: ['auto', '0', '1', '2'], detail: ['high', 'low'], palette: ['cartoon', 'military'], outline: ['thick', 'thin'], sharp: ['auto', 'high', 'normal'],
  particles: [0.4, 1, 1.8], leftDrag: ['select', 'pan'], replaySpeed: ['auto', '1', '4'] };
const valid = (k, v) => typeof v === typeof DEFAULTS[k] && (CHOICES[k] ? CHOICES[k].includes(v) : typeof v !== 'number' || (v >= 0 && v <= 1));

export const cfg = { ...DEFAULTS };
const listeners = [];
try {
  const s = JSON.parse(localStorage.getItem('jf2-settings') || 'null');
  if (s) {
    for (const k in DEFAULTS) if (valid(k, s[k])) cfg[k] = s[k];
    if (!s.v && s.palette === 'cartoon') cfg.palette = DEFAULTS.palette;   // 2.3.0 stored every value, so its old default was never a choice
  } else {      // settings from before version 2.3 only knew about sound
    const old = JSON.parse(localStorage.getItem('jf2-sound') || '{}');
    for (const k of ['sfx', 'voice', 'music']) if (old[k] === false) cfg[k] = false;
    if (valid('musicVol', old.musicVol)) cfg.musicVol = old.musicVol;
  }
} catch {}
// Only what differs from the defaults is stored: whoever never chose follows the defaults, also when they change.
function save() {
  const own = { v: 2 }; for (const k in DEFAULTS) if (cfg[k] !== DEFAULTS[k]) own[k] = cfg[k];
  try { localStorage.setItem('jf2-settings', JSON.stringify(own)); } catch {}
}
export function setCfg(k, v) { if (!(k in DEFAULTS) || cfg[k] === v || !valid(k, v)) return; cfg[k] = v; save(); for (const fn of listeners) fn(k, v); }
export function resetCfg(keys = Object.keys(DEFAULTS)) { for (const k of keys) setCfg(k, DEFAULTS[k]); }
export function onCfg(fn) { listeners.push(fn); }
