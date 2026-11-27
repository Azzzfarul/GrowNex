// Pure-logic tests for lib/utils (no Firebase, no widgets): `flutter test`.
// Same cases as web_dashboard/client/test/lib.test.js — the two ports must agree.
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/plant_model.dart';
import 'package:mobile_app/models/sensor_reading_model.dart';
import 'package:mobile_app/models/zone_model.dart';
import 'package:mobile_app/utils/analytics.dart';
import 'package:mobile_app/utils/plant_diagnosis.dart';
import 'package:mobile_app/utils/plant_health.dart';
import 'package:mobile_app/utils/schedules.dart';
import 'package:mobile_app/utils/zone_fit.dart';

SensorReading reading(DateTime t, {num? temperature, num? moisture}) => SensorReading(
      id: t.toIso8601String(),
      timestamp: t,
      temperature: temperature,
      moisture: moisture,
    );

Zone zone({num? m, num? temp, String? deviceId}) => Zone(
      id: 'z',
      userId: 'u',
      zoneName: 'Z',
      zoneType: 'indoor',
      status: 'healthy',
      latestMoisture: m,
      latestTemp: temp,
      deviceId: deviceId,
    );

Plant plant({
  num? mMin, num? mMax, num? tMin, num? tMax,
  String? light, String id = 'p',
}) =>
    Plant(
      id: id,
      zoneId: 'z',
      plantName: id,
      species: '',
      status: 'healthy',
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

  group('flattenDailyStats', () {
    test('turns daily docs into hourly readings, oldest first, from the cutoff on', () {
      final t0 = DateTime.utc(2026, 1, 1, 22);
      Map<String, dynamic> r(DateTime t, num temp) => {'timestamp': t, 'temperature': temp};
      final days = <String, Map<String, dynamic>>{
        '2026-01-02': {'hours': {'00': r(t0.add(const Duration(hours: 2)), 21), '23': r(t0.add(const Duration(hours: 1)), 23)}},
        '2026-01-01': {'hours': {'22': r(t0, 22), '21': r(t0.subtract(const Duration(hours: 1)), 99)}},
        '2026-01-03': {'hours': {'05': {'temperature': 1}}},  // no timestamp: skipped
        '2026-01-04': {},                                       // no hours at all
      };
      expect(flattenDailyStats(days, t0).map((x) => x.temperature).toList(), [22, 23, 21]);
      expect(flattenDailyStats({}, t0), isEmpty);
    });

    test('ignores the camera check fields the server adds to an hour', () {
      final t0 = DateTime.utc(2026, 1, 1, 22);
      final days = <String, Map<String, dynamic>>{
        '2026-01-01': {'hours': {
          '22': {'timestamp': t0, 'temperature': 22, 'visualStatus': 'stressed', 'visualConfidence': 0.7, 'sensorStatus': 'healthy'},
          '23': {'visualStatus': 'healthy', 'visualConfidence': 0.9, 'sensorStatus': 'healthy'},  // camera only: no reading
        }},
      };
      expect(flattenDailyStats(days, t0).map((x) => x.temperature).toList(), [22]);
    });
  });

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
        reading(t.subtract(const Duration(hours: 1)), moisture: 40),  // no temperature this hour
        reading(t, moisture: 42, temperature: 25),
      ];
      expect(groupByTime(rs, 'today', (r) => r.temperature).map((e) => e.value), [null, 25]);
      expect(groupByTime(rs, 'today', (r) => r.moisture).map((e) => e.value), [40, 42]);
    });

    test('moisture series is the zone reading; old per-slot fields are not counted again', () {
      final t = DateTime(now.year, now.month, now.day, now.hour, 30);
      final old = SensorReading.fromMap('h', {'moisture': 40, 'soilMoisture1': 50, 'timestamp': t});
      expect(old.moisture, 40);
      expect(moistureBucketSeries([old], 'today'), [40]);
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
      expect(plantStatus(zone(m: 50, temp: 25), p), 'healthy');
      expect(plantStatus(zone(m: 90, temp: 25), p), 'needs attention');
      expect(plantStatus(zone(m: 90, temp: 40), p), 'critical');
      // A zone doc from before the change still carries a stale slot value: ignored.
      final old = Zone.fromMap('z', {'latestMoisture': 50, 'latestMoisture1': 90, 'latestTemp': 25});
      expect(plantStatus(old, p), 'healthy');
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
      final z = zone(m: 50, temp: 25);
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
      final h = plantHealth(basil, zone(m: 50, temp: 25), [reading(now, moisture: 50, temperature: 25)]);
      expect(h.score, 100);
      expect(h.metrics['humidity']!.state, 'no-range');
      expect(plantHealthSummary(h), 'All conditions in range.');
    });

    test('dry soil drags the score down (moisture counts double)', () {
      final h = plantHealth(basil, zone(m: 20, temp: 25), [reading(now, moisture: 20, temperature: 25)]);
      expect(h.metrics['moisture']!.state, 'low');
      expect(h.score, 33);
      expect(plantHealthSummary(h), startsWith('Soil moisture below range — 20% vs 40–60%'));
    });

    test('old slot fields on plants, zones and history are ignored', () {
      final old = Plant.fromMap('p', {'zoneId': 'z', 'slotNumber': 2, 'preferredMoistureMin': 40, 'preferredMoistureMax': 60});
      final z = Zone.fromMap('z', {'latestMoisture': 50, 'latestMoisture2': 90});
      final rs = [
        SensorReading.fromMap('a', {'moisture': 50, 'soilMoisture2': 90, 'timestamp': now}),
        SensorReading.fromMap('b', {'moisture': 10, 'soilMoisture2': 90, 'timestamp': now}),
      ];
      final h = plantHealth(old, z, rs);
      expect(h.metrics['moisture']!.compliance, 50);
      expect(h.metrics['moisture']!.latest, 50);
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

  // Same cases as the web's "plant diagnosis labels" tests.
  group('plant diagnosis labels', () {
    test('every diagnosis condition has a readable label', () {
      expect(diagnosisConditions.length, 10);
      for (final c in diagnosisConditions) {
        expect(conditionLabel(c), matches(RegExp(r'^[A-Z][a-z /]+$')), reason: c);
      }
      expect(conditionLabel('fungal_disease'), 'Fungal disease');
      expect(conditionLabel('light_heat_stress'), 'Light / heat stress');
      expect(conditionLabel('something_new'), 'Unclear');
    });

    test('conditionTone maps a diagnosis onto the status colours', () {
      expect(conditionTone('healthy', 'none'), 'healthy');
      expect(conditionTone('unclear', 'none'), 'unknown');
      expect(conditionTone('not_plant', 'none'), 'unknown');
      expect(conditionTone('pest_damage', 'mild'), 'attention');
      expect(conditionTone('pest_damage', 'moderate'), 'attention');
      expect(conditionTone('fungal_disease', 'severe'), 'critical');
      expect(conditionTone('stressed'), 'attention');
      expect(conditionTone('unhealthy'), 'critical');
    });

    test('diagnosisError explains each way a diagnosis can fail', () {
      expect(diagnosisError('limit'), 'Daily diagnosis limit reached. Try again tomorrow.');
      expect(diagnosisError('image'), 'Use a JPEG photo under 1.5 MB.');
      expect(diagnosisError('disabled'), 'Diagnosis unavailable right now.');
      expect(diagnosisError('error'), 'Diagnosis unavailable right now.');
      expect(diagnosisError(null), 'Diagnosis unavailable right now.');
    });
  });

  // ── schedules ──────────────────────────────────────────────────────────────

  group('schedules', () {
    List<String>? ok(List<String> l, String k, String v, [int i = -1]) {
      final r = upsertSchedule(l, k, v, i);
      expect(r.error, isNull);
      return r.list;
    }
    String err(List<String> l, String k, String v, [int i = -1]) => upsertSchedule(l, k, v, i).error!;

    test('scheduleList reads old single-string configs and new lists', () {
      expect(scheduleList('07:00'), ['07:00']);
      expect(scheduleList(['07:00', '18:00']), ['07:00', '18:00']);
      expect(scheduleList(null), isEmpty);
      expect(scheduleList(''), isEmpty);
    });

    test('upsertSchedule adds, normalizes and sorts entries', () {
      expect(ok(['18:00'], 'water', ' 7:30 '), ['07:30', '18:00']);
      expect(ok([], 'light', '8:00 - 18:00'), ['08:00–18:00']);
      expect(ok(['MON 06:00', 'SUN 06:00'], 'fert', 'wed  7:00'), ['MON 06:00', 'WED 07:00', 'SUN 06:00']);
    });

    test('upsertSchedule edits in place without flagging the entry as its own duplicate', () {
      expect(ok(['07:00', '18:00'], 'water', '07:00', 0), ['07:00', '18:00']);
      expect(ok(['07:00', '18:00'], 'water', '20:00', 0), ['18:00', '20:00']);
      expect(err(['07:00', '18:00'], 'water', '18:00', 0), contains('already'));
    });

    test('upsertSchedule rejects bad formats and duplicates', () {
      expect(err([], 'water', '7am'), contains('07:00'));
      expect(err([], 'water', '24:00'), contains('07:00'));
      expect(err([], 'light', '08:00'), contains('08:00–18:00'));
      expect(err([], 'fert', 'monday 6'), contains('MON 06:00'));
      expect(err(['07:00'], 'water', '7:00'), contains('already'));
      expect(err(['7:00'], 'water', '07:00'), contains('already'));
    });

    test('upsertSchedule rejects light windows that overlap, touch or have no length', () {
      expect(err([], 'light', '08:00–08:00'), contains('different time'));
      expect(err(['08:00–12:00'], 'light', '11:00–14:00'), contains('overlaps or touches 08:00–12:00'));
      expect(err(['22:00–02:00'], 'light', '01:00–03:00'), contains('overlaps'));
      expect(err(['08:00-12:00'], 'light', '09:00–10:00'), contains('overlaps'));
      expect(err(['08:00–12:00'], 'light', '12:00–14:00'), contains('touches'));
      expect(err(['22:00–02:00'], 'light', '02:00–06:00'), contains('touches'));
      expect(err(['20:00–00:00'], 'light', '00:00–05:00'), contains('touches'));
      expect(ok(['08:00–12:00'], 'light', '12:01–14:00'), ['08:00–12:00', '12:01–14:00']);
      expect(ok(['22:00–02:00'], 'light', '02:01–06:00'), ['02:01–06:00', '22:00–02:00']);
      expect(ok(['20:00–00:00'], 'light', '06:00–10:00'), ['06:00–10:00', '20:00–00:00']);
      expect(ok(['08:00–12:00'], 'light', '09:00–13:00', 0), ['09:00–13:00']);
    });
  });
}
