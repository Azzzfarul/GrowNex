// Pure-logic tests for lib/utils (no Firebase, no widgets): `flutter test`.
// Same cases as web_dashboard/client/test/lib.test.js — the two ports must agree.
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/plant_model.dart';
import 'package:mobile_app/models/sensor_reading_model.dart';
import 'package:mobile_app/models/zone_model.dart';
import 'package:mobile_app/utils/analytics.dart';
import 'package:mobile_app/utils/plant_health.dart';
import 'package:mobile_app/utils/zone_fit.dart';

SensorReading reading(DateTime t, {num? temperature, num? moisture, num? s1, num? s2}) => SensorReading(
      id: t.toIso8601String(),
      timestamp: t,
      temperature: temperature,
      moisture: moisture,
      soilMoisture1: s1,
      soilMoisture2: s2,
    );

Zone zone({num? m1, num? m, num? temp, String? deviceId}) => Zone(
      id: 'z',
      userId: 'u',
      zoneName: 'Z',
      zoneType: 'indoor',
      status: 'healthy',
      totalPlantSlots: 4,
      latestMoisture1: m1,
      latestMoisture: m,
      latestTemp: temp,
      deviceId: deviceId,
    );

Plant plant({
  int slot = 1,
  num? mMin, num? mMax, num? tMin, num? tMax,
  String? light, String id = 'p',
}) =>
    Plant(
      id: id,
      zoneId: 'z',
      plantName: id,
      species: '',
      status: 'healthy',
      slotNumber: slot,
      preferredMoistureMin: mMin,
      preferredMoistureMax: mMax,
      preferredTemperatureMin: tMin,
      preferredTemperatureMax: tMax,
      preferredLightCondition: light,
    );

void main() {
  // Local midday, so "6 days 22 hours ago" never crosses midnight onto a different weekday.
  final today = DateTime.now();
  final now = DateTime(today.year, today.month, today.day, 12);

  group('groupByTime', () {
    test('24h: the hour from yesterday and the current hour are separate points, oldest first', () {
      final rs = [
        reading(now.subtract(const Duration(minutes: 23 * 60 + 54)), temperature: 10),
        reading(now.subtract(const Duration(hours: 12)), temperature: 20),
        reading(now, temperature: 30),
      ];
      final g = groupByTime(rs, 'today', (r) => r.temperature);
      expect(g.map((e) => e.value), [10, 20, 30]);
      expect(g.every((e) => RegExp(r'^\d\d:00$').hasMatch(e.label)), isTrue);
    });

    test('7 days: last week’s weekday and today are separate points, oldest first', () {
      final rs = [
        reading(now.subtract(const Duration(hours: 6 * 24 + 22)), temperature: 10),
        reading(now.subtract(const Duration(days: 3)), temperature: 20),
        reading(now, temperature: 30),
      ];
      final g = groupByTime(rs, '7days', (r) => r.temperature);
      expect(g.map((e) => e.value), [10, 20, 30]);
      expect(g.first.label, g.last.label);
    });

    test('averages within a bucket and sorts readings from several zones', () {
      final t = DateTime(now.year, now.month, now.day, now.hour, 30);
      final zoneA = [reading(t.subtract(const Duration(hours: 1)), temperature: 20), reading(t, temperature: 22)];
      final zoneB = [reading(t.subtract(const Duration(hours: 2)), temperature: 18), reading(t, temperature: 24)];
      expect(groupByTime([...zoneA, ...zoneB], 'today', (r) => r.temperature).map((e) => e.value), [18, 20, 23]);
    });

    test('every series gets the same buckets, so chart lines stay aligned', () {
      final t = DateTime(now.year, now.month, now.day, now.hour, 30);
      final rs = [
        reading(t.subtract(const Duration(hours: 1)), s1: 40),      // slot 2 missing this hour
        reading(t, s1: 42, s2: 60),
      ];
      expect(groupByTime(rs, 'today', (r) => r.soilMoisture2).map((e) => e.value), [null, 60]);
      expect(groupByTime(rs, 'today', (r) => r.soilMoisture1).map((e) => e.value), [40, 42]);
    });
  });

  group('describeTrend / buildOverviewSummary', () {
    ({String level, String text}) d(List<double?> series) => describeTrend(
        series: series, pref: (min: 20, max: 30), timeRange: 'today', label: 'temperature', kind: 'temperature');

    test('reports in-range, drifting and out-of-range series', () {
      expect(d([25, 25, 25, 25]).level, 'ok');
      expect(d([22, 24, 26, 28, 29, 29]).text, 'Temperature climbing toward the high end');
      expect(d([25, 25, 25, 31]).text, 'Temperature mostly fine — briefly out of range for about an hour');
      expect(d([32, 33, 34, 25]).text, 'Too hot — above 30°C for about 3 hours');
      expect(d([35, 35]).text, 'Too hot — above 30°C for the whole period');
      expect(d([25]).level, 'none');
    });

    test('light gets a trend-only summary', () {
      ({String level, String text}) l(List<double?> series) => describeTrend(
          series: series, pref: (min: null, max: null), timeRange: 'today', label: 'light', kind: 'light');
      expect(l([30, 30, 31, 30]).text, 'Averaging 30% and steady');
      expect(l([10, 20, 40, 60, 70, 80]).text, 'Averaging 47% and rising');
      expect(l([10, 90]).text, 'Averaging 50%'); // two points: no direction claimed
      expect(l([30]).text, 'Not enough readings yet to summarise light.');
    });

    test('overview without enough readings blames the readings, not a missing device', () {
      const none = (level: 'none', text: '');
      final plants = [plant(mMin: 40, mMax: 60)];
      expect(buildOverviewSummary(selectedZone: zone(deviceId: 'd'), plants: plants, temperature: none, humidity: none, moisture: none).text,
          'Not enough readings yet for a summary.');
      expect(buildOverviewSummary(selectedZone: zone(), plants: plants, temperature: none, humidity: none, moisture: none).text,
          contains('connect a device'));
    });

    test('plant status follows the live health score', () {
      final p = plant(mMin: 40, mMax: 60, tMin: 20, tMax: 30);
      expect(plantStatus(zone(m1: 50, temp: 25), p), 'healthy');
      expect(plantStatus(zone(m1: 90, temp: 25), p), 'needs attention');
      expect(plantStatus(zone(m1: 90, temp: 40), p), 'critical');
      expect(plantStatus(zone(), p), null);
    });

    test('overview leads with the worst metric', () {
      const ok = (level: 'ok', text: 'fine');
      const bad = (level: 'bad', text: 'Soil too dry');
      final plants = [plant(mMin: 40, mMax: 60)];
      expect(buildOverviewSummary(selectedZone: zone(), plants: plants, temperature: ok, humidity: ok, moisture: bad).text,
          'Soil too dry');
      expect(buildOverviewSummary(selectedZone: zone(), plants: plants, temperature: ok, humidity: ok, moisture: ok).level,
          'ok');
      expect(buildOverviewSummary(selectedZone: null, plants: plants, temperature: ok, humidity: ok, moisture: ok).level,
          'none');
    });

    test('a range missing its max is skipped, not scored or crashed on', () {
      final p = plant(mMin: 40, mMax: 60, tMin: 20);
      final z = zone(m1: 50, m: 50, temp: 25);
      expect(healthScoreForPlant(z, p), 100);
      expect(generateInsights(z, [p], []).map((i) => i.ok), [true]);
      // Only half ranges: nothing was checked, so it must not claim everything is fine.
      final half = plant(mMin: 40, tMin: 20);
      expect(generateInsights(z, [half], [reading(now, temperature: 25, moisture: 50)]).map((i) => i.ok), [null]);
    });
  });

  group('plantHealth', () {
    final basil = plant(mMin: 40, mMax: 60, tMin: 20, tMax: 30);

    test('perfect conditions score 100', () {
      final h = plantHealth(basil, zone(m1: 50, m: 10, temp: 25), [reading(now, s1: 50, temperature: 25)]);
      expect(h.score, 100);
      expect(h.metrics['humidity']!.state, 'no-range');
      expect(plantHealthSummary(h), 'All conditions in range.');
    });

    test('dry soil drags the score down (moisture counts double)', () {
      final h = plantHealth(basil, zone(m1: 20, temp: 25), [reading(now, s1: 20, temperature: 25)]);
      expect(h.metrics['moisture']!.state, 'low');
      expect(h.score, 33);
      expect(plantHealthSummary(h), startsWith('Soil moisture below range — 20% vs 40–60%'));
    });

    test('a slot without its own probe falls back to the zone average', () {
      final slot2 = plant(slot: 2, mMin: 40, mMax: 60);
      final h = plantHealth(slot2, zone(m: 50), [reading(now, moisture: 50), reading(now, moisture: 10)]);
      expect(h.metrics['moisture']!.compliance, 50);
    });

    test('no readings means waiting', () {
      expect(plantHealthSummary(plantHealth(basil, zone(), [])), 'Waiting for readings.');
    });
  });

  group('zoneFit', () {
    final tropical = plant(id: 'tropical', tMin: 24, tMax: 32, mMin: 50, mMax: 70, light: 'high');
    final cactus = plant(id: 'cactus', tMin: 5, tMax: 15, mMin: 5, mMax: 20, light: 'high');
    final zones = {
      'hot': (zone: zone(), plants: [tropical]),
      'cold': (zone: zone(), plants: [cactus]),
    };
    ZoneSuggestion? hint(String current, Map<String, ({Zone zone, List<Plant> plants})> zs) => zoneFitHint(
          moistureMin: 50, moistureMax: 70, humidityMin: null, humidityMax: null,
          temperatureMin: 24, temperatureMax: 32, lightCondition: 'high',
          currentZoneId: current, zonesById: zs);

    test('fits its own zone', () => expect(hint('hot', zones), isNull));
    test('suggests the better zone', () => expect(hint('cold', zones)?.kind, 'move'));
    test('suggests a new zone when nothing fits', () => expect(hint('cold', {'cold': zones['cold']!})?.kind, 'new'));
  });
}
