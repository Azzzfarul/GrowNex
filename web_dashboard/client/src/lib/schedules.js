// Automation schedule lists. Hand-ported to mobile utils/schedules.dart — change both together.
// Entries use the formats the bridge's parsers accept (server/src/services/mqttBridge.js).
const T = '([01]?\\d|2[0-3]):[0-5]\\d'
const FORMATS = {
  water: { re: new RegExp(`^${T}$`),                   error: 'Watering time must look like 07:00 (24-hour).' },
  light: { re: new RegExp(`^${T}\\s*[–-]\\s*${T}$`),    error: 'Lighting schedule must look like 08:00–18:00.' },
  fert:  { re: new RegExp(`^(MON|TUE|WED|THU|FRI|SAT|SUN)\\s+${T}$`), error: 'Fertilizing schedule must look like MON 06:00.' },
}
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

// Configs saved before lists hold one string (or nothing).
export const scheduleList = (v) => (Array.isArray(v) ? v : v ? [v] : [])

// "7:00" → "07:00", "8:00 - 18:00" → "08:00–18:00", "mon  6:00" → "MON 06:00"
const canonical = (v) => v.trim().toUpperCase()
  .replace(/\s*[–-]\s*/, '–').replace(/\s+/, ' ').replace(/(^|\D)(\d):/g, '$10$2:')

const minutes = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m }
// A light window as minute ranges, split in two when it runs past midnight
const ranges = (w) => {
  const [s, e] = w.split(/[–-]/).map(minutes)  // older saved entries may use a hyphen
  return s < e ? [[s, e]] : [[s, 1440], [0, e]]
}
// Touching counts: the bridge would fire one window's "off" and the next one's "on" in the same
// minute, in no set order, so the light could stay off for the second window.
const clashes = (a, b) => ranges(a).some(([s1, e1]) => ranges(b).some(([s2, e2]) => s1 <= e2 && s2 <= e1))
const sortKey = (v) => (/^[A-Z]{3} \d/.test(v) ? `${DAYS.indexOf(v.slice(0, 3))} ${v.slice(4)}` : v)

// Adds `raw` to `list` (or replaces list[editIndex]). Returns { list } (sorted) or { error }.
export function upsertSchedule(list, kind, raw, editIndex = -1) {
  const v = canonical(raw)
  if (!FORMATS[kind].re.test(v)) return { error: FORMATS[kind].error }
  const others = list.filter((_, i) => i !== editIndex)
  // Older saved entries may be written "7:00".
  if (others.some((x) => canonical(x) === v)) return { error: `${v} is already in the list.` }
  if (kind === 'light') {
    const [s, e] = v.split('–')
    if (s === e) return { error: 'The light must turn off at a different time than it turns on.' }
    // The earlier window's "off" would end an overlapping one early.
    // Early app versions saved free text (e.g. "6am-8pm"): such entries can't be compared, so skip them.
    const clash = others.find((w) => FORMATS.light.re.test(canonical(w)) && clashes(canonical(w), v))
    if (clash) return { error: `${v} overlaps or touches ${clash}. Leave at least a minute between windows.` }
  }
  return { list: [...others, v].sort((a, b) => sortKey(a).localeCompare(sortKey(b))) }
}
