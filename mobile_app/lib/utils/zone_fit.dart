// Feature 2 — rule-based "this plant may fit another zone better". No AI.
// Mirror of web_dashboard/client/src/lib/zoneFit.js.
//
// Temperature, light and moisture are weighted higher than humidity: in GrowNex
// they are zone-wide (shared air, one grow light, one irrigation pump + one
// wateringThreshold per zone) and can't be tuned per plant slot, so a mismatch
// on any forces a "wrong zone" call. Humidity isn't actuated, so it only nudges.

import '../models/plant_model.dart';
import '../models/zone_model.dart';

const _weight = {'temperature': 2.0, 'light': 2.0, 'moisture': 2.0, 'humidity': 1.0};
const _starkMetrics = ['temperature', 'light', 'moisture'];

class _Range {
  final double min;
  final double max;
  const _Range(this.min, this.max);
}

_Range? _avgRange(List<Plant> plants, num? Function(Plant) minG, num? Function(Plant) maxG) {
  final mins = plants.map(minG).whereType<num>().toList();
  final maxs = plants.map(maxG).whereType<num>().toList();
  if (mins.isEmpty || maxs.isEmpty) return null;
  return _Range(
    mins.reduce((a, b) => a + b) / mins.length,
    maxs.reduce((a, b) => a + b) / maxs.length,
  );
}

double? _overlap(_Range? a, _Range? b) {
  if (a == null || b == null) return null;
  final width = a.max - a.min;
  if (width <= 0) return null;
  final lo = a.min > b.min ? a.min : b.min;
  final hi = a.max < b.max ? a.max : b.max;
  return ((hi - lo) / width).clamp(0.0, 1.0);
}

typedef PlantPrefs = ({
  num? moistureMin, num? moistureMax,
  num? humidityMin, num? humidityMax,
  num? temperatureMin, num? temperatureMax,
  String? lightCondition,
});

typedef ZoneFit = ({double fit, Map<String, double> byMetric, String worst});

ZoneFit? plantZoneFit(PlantPrefs plant, List<Plant> plants) {
  if (plants.isEmpty) return null;
  final byMetric = <String, double>{};

  void metric(String name, num? aMin, num? aMax, num? Function(Plant) minG, num? Function(Plant) maxG) {
    final a = (aMin != null && aMax != null) ? _Range(aMin.toDouble(), aMax.toDouble()) : null;
    final o = _overlap(a, _avgRange(plants, minG, maxG));
    if (o != null) byMetric[name] = o;
  }

  metric('moisture', plant.moistureMin, plant.moistureMax, (p) => p.preferredMoistureMin, (p) => p.preferredMoistureMax);
  metric('humidity', plant.humidityMin, plant.humidityMax, (p) => p.preferredHumidityMin, (p) => p.preferredHumidityMax);
  metric('temperature', plant.temperatureMin, plant.temperatureMax, (p) => p.preferredTemperatureMin, (p) => p.preferredTemperatureMax);

  if (plant.lightCondition != null) {
    final counts = <String, int>{};
    for (final p in plants) {
      final c = p.preferredLightCondition;
      if (c != null) counts[c] = (counts[c] ?? 0) + 1;
    }
    if (counts.isNotEmpty) {
      final dominant = counts.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
      byMetric['light'] = dominant == plant.lightCondition ? 1.0 : 0.2;
    }
  }

  if (byMetric.isEmpty) return null;
  var wsum = 0.0, wtot = 0.0;
  byMetric.forEach((m, v) {
    wsum += v * _weight[m]!;
    wtot += _weight[m]!;
  });
  final worst = byMetric.entries.reduce((a, b) => b.value < a.value ? b : a).key;
  return (fit: wsum / wtot, byMetric: byMetric, worst: worst);
}

class ZoneSuggestion {
  final String kind;   // 'move' | 'new'
  final Zone? zone;    // set only for 'move'
  final double currentFit;
  final String reason; // 'temperature' | 'light' | 'moisture' | 'humidity'
  const ZoneSuggestion({required this.kind, this.zone, required this.currentFit, required this.reason});
}

/// Returns a 'move' suggestion when another zone fits clearly better, a 'new'
/// suggestion when the plant is a poor fit here and nowhere else fits either,
/// or null when the plant fits the current zone fine.
ZoneSuggestion? zoneFitHint({
  required num? moistureMin, required num? moistureMax,
  required num? humidityMin, required num? humidityMax,
  required num? temperatureMin, required num? temperatureMax,
  required String? lightCondition,
  required String currentZoneId,
  required Map<String, ({Zone zone, List<Plant> plants})> zonesById,
}) {
  final plant = (
    moistureMin: moistureMin, moistureMax: moistureMax,
    humidityMin: humidityMin, humidityMax: humidityMax,
    temperatureMin: temperatureMin, temperatureMax: temperatureMax,
    lightCondition: lightCondition,
  );

  final cur = plantZoneFit(plant, zonesById[currentZoneId]?.plants ?? []);
  if (cur == null) return null;

  String? stark;
  for (final m in _starkMetrics) {
    if ((cur.byMetric[m] ?? 1.0) < 0.15) { stark = m; break; }
  }
  if (cur.fit >= 0.45 && stark == null) return null;
  final reason = stark ?? cur.worst;

  ({Zone zone, double fit, Map<String, double> byMetric})? best;
  zonesById.forEach((zid, entry) {
    if (zid == currentZoneId) return;
    final f = plantZoneFit(plant, entry.plants);
    if (f == null) return;
    if (best == null || f.fit > best!.fit) {
      best = (zone: entry.zone, fit: f.fit, byMetric: f.byMetric);
    }
  });

  if (best != null) {
    final overallBetter = best!.fit >= cur.fit + 0.2;
    final starkBetter = stark != null && (best!.byMetric[stark] ?? 0.0) >= 0.5;
    if (overallBetter || starkBetter) {
      return ZoneSuggestion(kind: 'move', zone: best!.zone, currentFit: cur.fit, reason: reason);
    }
  }
  return ZoneSuggestion(kind: 'new', currentFit: cur.fit, reason: reason);
}
