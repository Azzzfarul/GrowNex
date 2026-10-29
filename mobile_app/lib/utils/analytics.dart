import '../models/plant_model.dart';
import '../models/sensor_reading_model.dart';
import '../models/zone_model.dart';

// Pure analytics helpers for screens/analytics/analytics_screen.dart.
// Hand-ported from web client/src/lib/analytics.js — keep both passing the same test cases.

const _dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

double? _listAvg(List<num> vals) {
  if (vals.isEmpty) return null;
  return vals.map((v) => v.toDouble()).reduce((a, b) => a + b) / vals.length;
}

/// Buckets [readings] by local calendar hour ('today' = last 24 h) or calendar day ('7days'),
/// oldest first. Keyed by the full date, not just "14:00"/"Wed": the window spans 25 hours /
/// 8 days, so a label-only key merged the oldest partial bucket with the newest one. Every
/// selector gets the same buckets (value null where it has no data), so chart lines stay
/// aligned with the shared x-axis labels. Web: buildChartData in client/src/lib/analytics.js.
List<({String label, double? value})> groupByTime(
  List<SensorReading> readings,
  String timeRange,
  num? Function(SensorReading) selector,
) {
  String two(int n) => n.toString().padLeft(2, '0');
  final buckets = <String, ({String label, List<num> values})>{};
  for (final r in readings) {
    final t = r.timestamp?.toLocal();
    if (t == null) continue;
    final day = '${t.year}-${two(t.month)}-${two(t.day)}';
    final key = timeRange == 'today' ? '${day}T${two(t.hour)}' : day;
    final b = buckets.putIfAbsent(
      key,
      () => (
        label: timeRange == 'today'
            ? '${two(t.hour)}:00'
            : _dayLabels[t.weekday - 1],
        values: <num>[],
      ),
    );
    final v = selector(r);
    if (v != null) b.values.add(v);
  }
  final keys = buckets.keys.toList()..sort();
  return [
    for (final k in keys)
      (label: buckets[k]!.label, value: _listAvg(buckets[k]!.values)),
  ];
}

// ── Health / compliance helpers ───────────────────────────────────────────────

/// Live plant status (StatusLabel wording) from the zone's current readings; null until scorable.
String? plantStatus(Zone zone, Plant plant) {
  final s = healthScoreForPlant(zone, plant);
  if (s == null) return null;
  return s >= 80 ? 'healthy' : s >= 40 ? 'needs attention' : 'critical';
}

int? healthScoreForPlant(Zone zone, Plant plant) {
  final scores = <double>[];
  final moisture =
      switch (plant.slotNumber) {
        1 => zone.latestMoisture1,
        2 => zone.latestMoisture2,
        3 => zone.latestMoisture3,
        4 => zone.latestMoisture4,
        _ => null,
      } ??
      zone.latestMoisture;
  if (plant.preferredMoistureMin != null && plant.preferredMoistureMax != null && moisture != null) {
    scores.add(
      moisture >= plant.preferredMoistureMin! &&
              moisture <= plant.preferredMoistureMax!
          ? 1
          : 0,
    );
  }
  if (plant.preferredTemperatureMin != null && plant.preferredTemperatureMax != null && zone.latestTemp != null) {
    scores.add(
      zone.latestTemp! >= plant.preferredTemperatureMin! &&
              zone.latestTemp! <= plant.preferredTemperatureMax!
          ? 1
          : 0,
    );
  }
  if (plant.preferredHumidityMin != null && plant.preferredHumidityMax != null && zone.latestHumid != null) {
    scores.add(
      zone.latestHumid! >= plant.preferredHumidityMin! &&
              zone.latestHumid! <= plant.preferredHumidityMax!
          ? 1
          : 0,
    );
  }
  if (scores.isEmpty) return null;
  return (scores.reduce((a, b) => a + b) / scores.length * 100).round();
}

int? zoneHealthScore(Zone zone, List<Plant> plants) {
  final scores = plants
      .map((p) => healthScoreForPlant(zone, p))
      .whereType<int>()
      .toList();
  return scores.isEmpty
      ? null
      : (scores.reduce((a, b) => a + b) / scores.length).round();
}

({num? min, num? max}) avgPref(
  List<Plant> plants,
  num? Function(Plant) minGetter,
  num? Function(Plant) maxGetter,
) {
  final mins = plants.map(minGetter).whereType<num>().toList();
  final maxs = plants.map(maxGetter).whereType<num>().toList();
  return (
    min: mins.isEmpty ? null : mins.reduce((a, b) => a + b) / mins.length,
    max: maxs.isEmpty ? null : maxs.reduce((a, b) => a + b) / maxs.length,
  );
}

double? compliancePercent(
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

// ── Insights ──────────────────────────────────────────────────────────────────

List<({bool? ok, String text})> generateInsights(
  Zone zone,
  List<Plant> plants,
  List<SensorReading> readings,
) {
  if (plants.isEmpty) {
    return [
      (ok: null, text: 'Add plants with preferred conditions to see insights.'),
    ];
  }

  final hasLatest =
      zone.latestTemp != null ||
      zone.latestHumid != null ||
      zone.latestMoisture != null;
  if (!hasLatest && readings.isEmpty) {
    return [
      (
        ok: null,
        text:
            'No sensor readings for this zone yet. Connect a device to start monitoring.',
      ),
    ];
  }

  final moist = avgPref(
    plants,
    (p) => p.preferredMoistureMin,
    (p) => p.preferredMoistureMax,
  );
  final temp = avgPref(
    plants,
    (p) => p.preferredTemperatureMin,
    (p) => p.preferredTemperatureMax,
  );
  final humid = avgPref(
    plants,
    (p) => p.preferredHumidityMin,
    (p) => p.preferredHumidityMax,
  );
  final out = <({bool? ok, String text})>[];

  if (moist.min != null && moist.max != null && zone.latestMoisture != null) {
    if (zone.latestMoisture! < moist.min!) {
      out.add((
        ok: false,
        text:
            'Soil moisture (${zone.latestMoisture}%) is below the preferred minimum of ${moist.min!.toStringAsFixed(0)}%. Consider increasing watering frequency.',
      ));
    } else if (zone.latestMoisture! > moist.max!) {
      out.add((
        ok: false,
        text:
            'Soil moisture (${zone.latestMoisture}%) exceeds the preferred maximum of ${moist.max!.toStringAsFixed(0)}%. Reduce watering frequency.',
      ));
    }
  }
  if (temp.min != null && temp.max != null && zone.latestTemp != null) {
    if (zone.latestTemp! < temp.min! || zone.latestTemp! > temp.max!) {
      out.add((
        ok: false,
        text:
            'Temperature (${zone.latestTemp}°C) is outside the preferred range of ${temp.min!.toStringAsFixed(0)}–${temp.max!.toStringAsFixed(0)}°C.',
      ));
    }
  }
  if (humid.min != null && humid.max != null && zone.latestHumid != null) {
    if (zone.latestHumid! < humid.min! || zone.latestHumid! > humid.max!) {
      out.add((
        ok: false,
        text:
            'Humidity (${zone.latestHumid}%) is outside the preferred range of ${humid.min!.toStringAsFixed(0)}–${humid.max!.toStringAsFixed(0)}%.',
      ));
    }
  }

  final tC = compliancePercent(
    readings,
    (r) => r.temperature,
    temp.min,
    temp.max,
  );
  final mC = compliancePercent(
    readings,
    (r) => r.moisture,
    moist.min,
    moist.max,
  );
  final hC = compliancePercent(
    readings,
    (r) => r.humidity,
    humid.min,
    humid.max,
  );
  if (tC != null && tC < 70) {
    out.add((
      ok: false,
      text:
          'Temperature was outside the preferred range ${(100 - tC).round()}% of the time.',
    ));
  }
  if (mC != null && mC < 70) {
    out.add((
      ok: false,
      text:
          'Soil moisture was outside the preferred range ${(100 - mC).round()}% of the time.',
    ));
  }
  if (hC != null && hC < 70) {
    out.add((
      ok: false,
      text:
          'Humidity was outside the preferred range ${(100 - hC).round()}% of the time.',
    ));
  }

  // "All fine" only if at least one complete range was actually compared.
  final checked = [
        (moist, zone.latestMoisture),
        (temp, zone.latestTemp),
        (humid, zone.latestHumid),
      ].any((e) => e.$1.min != null && e.$1.max != null && e.$2 != null) ||
      [tC, mC, hC].any((c) => c != null);
  if (out.isEmpty) {
    out.add(checked
        ? (
            ok: true,
            text:
                'All conditions are within preferred ranges. Your plants are doing well.',
          )
        : (
            ok: null,
            text:
                'Set a minimum and maximum preferred range on your plants to see insights.',
          ));
  }
  return out;
}

// ── AI summary fallback (rule-based, trend-aware) ─────────────────────────────

String formatOutOfRangeDuration(int n, String timeRange, int totalBuckets) {
  if (n >= totalBuckets) return 'the whole period';
  if (timeRange == 'today') return n <= 1 ? 'about an hour' : 'about $n hours';
  return n <= 1 ? 'about a day' : 'about $n days';
}

double? _meanOf(List<double> v) =>
    v.isEmpty ? null : v.reduce((a, b) => a + b) / v.length;

String _seriesDirection(List<double?> series, ({num? min, num? max}) pref) {
  final v = series.whereType<double>().toList();
  if (v.length < 3) return 'flat';
  final third = (v.length / 3).floor().clamp(1, v.length);
  final firstMean = _meanOf(v.sublist(0, third));
  final lastMean = _meanOf(v.sublist(v.length - third));
  if (firstMean == null || lastMean == null) return 'flat';
  final span = (pref.min != null && pref.max != null)
      ? (pref.max! - pref.min!).toDouble().abs()
      : (firstMean.abs() == 0 ? 1.0 : firstMean.abs());
  final eps = (span * 0.02) < 0.3 ? 0.3 : span * 0.02;
  final delta = lastMean - firstMean;
  if (delta > eps) return 'rising';
  if (delta < -eps) return 'falling';
  return 'flat';
}

String _trendWarnEdge(String kind, bool rising) => switch (kind) {
  'temperature' =>
    rising
        ? 'Temperature climbing toward the high end'
        : 'Temperature drifting down, near the low end',
  'humidity' =>
    rising
        ? 'Humidity climbing toward the high end'
        : 'Humidity drifting down, near the low end',
  'moisture' =>
    rising
        ? 'Soil getting wet, near the high end'
        : 'Soil drying out, near the low end',
  _ => 'Trending toward the edge of the ideal range',
};

String _trendBrief(String kind, String dur) => switch (kind) {
  'temperature' => 'Temperature mostly fine — briefly out of range for $dur',
  'humidity' => 'Humidity mostly fine — briefly out of range for $dur',
  'moisture' => 'Soil moisture mostly fine — briefly out of range for $dur',
  _ => 'Mostly fine — briefly out of range for $dur',
};

String _trendBad(String kind, bool high, int bound, String dur) =>
    switch (kind) {
      'temperature' =>
        high
            ? 'Too hot — above $bound°C for $dur'
            : 'Too cold — below $bound°C for $dur',
      'humidity' =>
        high
            ? 'Too humid — above $bound% for $dur'
            : 'Air too dry — below $bound% for $dur',
      'moisture' =>
        high
            ? 'Soil too wet — above $bound% for $dur'
            : 'Soil too dry — below $bound% for $dur',
      _ =>
        high
            ? 'Above the ideal range for $dur'
            : 'Below the ideal range for $dur',
    };

/// [series] is the ordered list of bucketed averages for one metric.
/// [timeRange] 'today' => 1 bucket = 1h; '7days' => 1 bucket = 1 day.
({String level, String text}) describeTrend({
  required List<double?> series,
  required ({num? min, num? max}) pref,
  required String timeRange,
  required String label,
  required String kind,
}) {
  final nonNull = series.whereType<double>().toList();
  if (nonNull.length < 2) {
    return (
      level: 'none',
      text: 'Not enough readings yet to summarise $label.',
    );
  }
  // Plants store light only as low/medium/high, so there's no % range to judge: trend only
  if (kind == 'light') {
    final dir = switch (_seriesDirection(series, (min: 0, max: 100))) {
      'rising' => 'rising',
      'falling' => 'falling',
      _ => 'steady',
    };
    return (level: 'none', text: 'Averaging ${_meanOf(nonNull)!.round()}% and $dir');
  }
  if (pref.min == null || pref.max == null) {
    return (
      level: 'none',
      text: 'Set plant preferred $label range to get a summary.',
    );
  }

  final min = pref.min!.toDouble();
  final max = pref.max!.toDouble();
  final above = nonNull.where((v) => v > max).length;
  final below = nonNull.where((v) => v < min).length;
  final out = above + below;
  final total = nonNull.length;
  final dir = _seriesDirection(series, pref);

  if (out == 0) {
    if (dir == 'falling') {
      return (level: 'warn', text: _trendWarnEdge(kind, false));
    }
    if (dir == 'rising') {
      return (level: 'warn', text: _trendWarnEdge(kind, true));
    }
    return (level: 'ok', text: 'Stable and within the ideal range');
  }
  if (out < total / 2) {
    return (
      level: 'warn',
      text: _trendBrief(kind, formatOutOfRangeDuration(out, timeRange, total)),
    );
  }
  final highSide = above >= below;
  final count = highSide ? above : below;
  final dur = formatOutOfRangeDuration(count, timeRange, total);
  return (
    level: 'bad',
    text: highSide
        ? _trendBad(kind, true, max.round(), dur)
        : _trendBad(kind, false, min.round(), dur),
  );
}

/// Combined moisture series: per bucket, mean of moisture + soilMoisture1..4.
List<double?> moistureBucketSeries(
  List<SensorReading> readings,
  String timeRange,
) {
  final base = groupByTime(readings, timeRange, (r) {
    final vals = [
      r.moisture,
      r.soilMoisture1,
      r.soilMoisture2,
      r.soilMoisture3,
      r.soilMoisture4,
    ].whereType<num>().map((v) => v.toDouble()).toList();
    return vals.isEmpty ? null : vals.reduce((a, b) => a + b) / vals.length;
  });
  return base.map((e) => e.value).toList();
}

({String level, String text}) buildOverviewSummary({
  required Zone? selectedZone,
  required List<Plant> plants,
  required ({String level, String text}) temperature,
  required ({String level, String text}) humidity,
  required ({String level, String text}) moisture,
}) {
  if (selectedZone == null) {
    return (
      level: 'none',
      text: 'Showing all zones. Pick a single zone for a detailed summary.',
    );
  }
  if (plants.isEmpty) {
    return (
      level: 'none',
      text: 'Add plants with preferred conditions to see insights.',
    );
  }
  const rank = {'bad': 3, 'warn': 2, 'ok': 1, 'none': 0};
  final ranked =
      [temperature, humidity, moisture].where((r) => r.level != 'none').toList()
        ..sort((a, b) => rank[b.level]!.compareTo(rank[a.level]!));
  if (ranked.isEmpty) {
    final hasPrefs = plants.any(
      (p) =>
          p.preferredTemperatureMin != null ||
          p.preferredHumidityMin != null ||
          p.preferredMoistureMin != null,
    );
    if (!hasPrefs) {
      return (level: 'none', text: 'Add plants with preferred conditions to see insights.');
    }
    return selectedZone.deviceId != null
        ? (level: 'none', text: 'Not enough readings yet for a summary.')
        : (
            level: 'none',
            text: 'No sensor readings for this zone yet — connect a device to start monitoring.',
          );
  }
  if (ranked.first.level == 'ok') {
    return (
      level: 'ok',
      text:
          'Stable and within the ideal range across temperature, humidity and soil moisture.',
    );
  }
  return ranked.first;
}
