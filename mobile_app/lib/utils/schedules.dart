// Automation schedule lists. Hand-ported from web client/src/lib/schedules.js — change both together.
// Entries use the formats the bridge's parsers accept (web_dashboard/server/src/services/mqttBridge.js).
const _t = r'([01]?\d|2[0-3]):[0-5]\d';
final _formats = <String, (RegExp, String)>{
  'water': (RegExp('^$_t\$'), 'Watering time must look like 07:00 (24-hour).'),
  'light': (RegExp('^$_t\\s*[–-]\\s*$_t\$'), 'Lighting schedule must look like 08:00–18:00.'),
  'fert': (RegExp('^(MON|TUE|WED|THU|FRI|SAT|SUN)\\s+$_t\$'), 'Fertilizing schedule must look like MON 06:00.'),
};
const _days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

/// Configs saved before lists hold one string (or nothing).
List<String> scheduleList(dynamic v) =>
    v is List ? v.whereType<String>().toList() : (v is String && v.isNotEmpty ? [v] : []);

// "7:00" → "07:00", "8:00 - 18:00" → "08:00–18:00", "mon  6:00" → "MON 06:00"
String _canonical(String v) => v
    .trim()
    .toUpperCase()
    .replaceFirst(RegExp(r'\s*[–-]\s*'), '–')
    .replaceFirst(RegExp(r'\s+'), ' ')
    .replaceAllMapped(RegExp(r'(^|\D)(\d):'), (m) => '${m[1]}0${m[2]}:');

int _minutes(String hm) {
  final p = hm.split(':').map(int.parse).toList();
  return p[0] * 60 + p[1];
}

// A light window as minute ranges, split in two when it runs past midnight
List<(int, int)> _ranges(String w) {
  final p = w.split(RegExp('[–-]')).map(_minutes).toList();  // older saved entries may use a hyphen
  return p[0] < p[1] ? [(p[0], p[1])] : [(p[0], 1440), (0, p[1])];
}

// Touching counts: the bridge would fire one window's "off" and the next one's "on" in the same
// minute, in no set order, so the light could stay off for the second window.
bool _clashes(String a, String b) =>
    _ranges(a).any((x) => _ranges(b).any((y) => x.$1 <= y.$2 && y.$1 <= x.$2));

String _sortKey(String v) =>
    RegExp('^[A-Z]').hasMatch(v) ? '${_days.indexOf(v.substring(0, 3))} ${v.substring(4)}' : v;

/// Adds [raw] to [list] (or replaces list[editIndex]). Returns the sorted list, or an error.
({List<String>? list, String? error}) upsertSchedule(List<String> list, String kind, String raw,
    [int editIndex = -1]) {
  final v = _canonical(raw);
  final (re, formatError) = _formats[kind]!;
  if (!re.hasMatch(v)) return (list: null, error: formatError);
  final others = [for (var i = 0; i < list.length; i++) if (i != editIndex) list[i]];
  if (others.contains(v)) return (list: null, error: '$v is already in the list.');
  if (kind == 'light') {
    final p = v.split('–');
    if (p[0] == p[1]) {
      return (list: null, error: 'The light must turn off at a different time than it turns on.');
    }
    // The earlier window's "off" would end an overlapping one early.
    for (final w in others) {
      if (_clashes(w, v)) {
        return (list: null, error: '$v overlaps or touches $w. Leave at least a minute between windows.');
      }
    }
  }
  return (list: [...others, v]..sort((a, b) => _sortKey(a).compareTo(_sortKey(b))), error: null);
}
