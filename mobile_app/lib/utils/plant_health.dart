// Rule-based per-plant health — used by the Analytics "Plant Ranking" box and
// the plant detail "Condition" block. No AI.
// Score per metric = 0.7·(compliance % over the window) + 0.3·(closeness of the
// latest value). Weighted mean: soil moisture ×2, temperature/humidity ×1.

import '../models/plant_model.dart';
import '../models/sensor_reading_model.dart';
import '../models/zone_model.dart';

typedef MetricHealth = ({
  double? score, int? compliance, String state,
  num? latest, num? min, num? max, String label, String unit,
});
typedef PlantHealthResult = ({int? score, Map<String, MetricHealth> metrics});

double? _compliancePercent(
  List<SensorReading> readings,
  num? Function(SensorReading) selector,
  num? min,
  num? max,
) {
  if (min == null || max == null) return null;
  final valid = readings.map(selector).whereType<num>().toList();
  if (valid.isEmpty) return null;
  return valid.where((v) => v >= min && v <= max).length / valid.length * 100;
}

int? _metricNowScore(num? value, num? min, num? max) {
  if (value == null || min == null || max == null) return null;
  if (value >= min && value <= max) return 100;
  final width = (max - min) < 5 ? 5.0 : (max - min).toDouble();
  final dist = value < min ? (min - value) : (value - max);
  final s = (100 * (1 - dist / width)).round();
  return s < 0 ? 0 : s;
}

num? _zoneSlotMoisture(Zone z, int slot) => switch (slot) {
      1 => z.latestMoisture1,
      2 => z.latestMoisture2,
      3 => z.latestMoisture3,
      4 => z.latestMoisture4,
      _ => null,
    };

PlantHealthResult plantHealth(Plant plant, Zone zone, List<SensorReading> readings) {
  final slot = plant.slotNumber;
  final defs = <({
    String key, num? Function(SensorReading) sel, num? latest,
    num? min, num? max, double weight, String label, String unit,
  })>[
    (key: 'moisture', sel: (r) => r.moistureForSlot(slot) ?? r.moisture,
     latest: _zoneSlotMoisture(zone, slot) ?? zone.latestMoisture,
     min: plant.preferredMoistureMin, max: plant.preferredMoistureMax,
     weight: 2, label: 'Soil moisture', unit: '%'),
    (key: 'temperature', sel: (r) => r.temperature, latest: zone.latestTemp,
     min: plant.preferredTemperatureMin, max: plant.preferredTemperatureMax,
     weight: 1, label: 'Temperature', unit: '°C'),
    (key: 'humidity', sel: (r) => r.humidity, latest: zone.latestHumid,
     min: plant.preferredHumidityMin, max: plant.preferredHumidityMax,
     weight: 1, label: 'Humidity', unit: '%'),
  ];

  final metrics = <String, MetricHealth>{};
  var wsum = 0.0, wtot = 0.0;
  for (final d in defs) {
    if (d.min == null || d.max == null) {
      metrics[d.key] = (score: null, compliance: null, state: 'no-range',
          latest: null, min: null, max: null, label: d.label, unit: d.unit);
      continue;
    }
    final compliance = _compliancePercent(readings, d.sel, d.min, d.max)?.round();
    final now = _metricNowScore(d.latest, d.min, d.max);
    if (compliance == null && now == null) {
      metrics[d.key] = (score: null, compliance: null, state: 'no-data',
          latest: null, min: d.min, max: d.max, label: d.label, unit: d.unit);
      continue;
    }
    final score = 0.7 * (compliance ?? now!) + 0.3 * (now ?? compliance!);
    final state = d.latest == null
        ? 'no-data'
        : d.latest! < d.min!
            ? 'low'
            : d.latest! > d.max!
                ? 'high'
                : 'ok';
    metrics[d.key] = (score: score, compliance: compliance, state: state,
        latest: d.latest, min: d.min, max: d.max, label: d.label, unit: d.unit);
    wsum += score * d.weight;
    wtot += d.weight;
  }
  return (score: wtot > 0 ? (wsum / wtot).round() : null, metrics: metrics);
}

String plantHealthSummary(PlantHealthResult h) {
  if (h.score == null) {
    return h.metrics.values.any((m) => m.state == 'no-data')
        ? 'Waiting for readings.'
        : 'No readings for this plant yet.';
  }
  final problems = h.metrics.values.where((m) => m.state == 'low' || m.state == 'high').toList()
    ..sort((a, b) => (a.score ?? 0).compareTo(b.score ?? 0));
  if (problems.isEmpty) return 'All conditions in range.';
  final parts = problems.take(2).map((m) {
    final dir = m.state == 'low' ? 'below' : 'above';
    final now = ((m.latest ?? 0) * 10).round() / 10;
    final comp = m.compliance != null ? ', in range ${m.compliance}% of the period' : '';
    return '${m.label} $dir range — $now${m.unit} vs '
        '${m.min!.toStringAsFixed(0)}–${m.max!.toStringAsFixed(0)}${m.unit}$comp';
  });
  return '${parts.join('. ')}.';
}
