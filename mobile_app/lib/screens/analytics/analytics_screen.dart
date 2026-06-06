import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../models/plant_model.dart';
import '../../models/sensor_reading_model.dart';
import '../../models/zone_model.dart';
import '../../services/firestore/zone_service.dart';

// ── Pure helpers ──────────────────────────────────────────────────────────────

const _dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

double? _listAvg(List<num> vals) {
  if (vals.isEmpty) return null;
  return vals.map((v) => v.toDouble()).reduce((a, b) => a + b) / vals.length;
}

List<({String label, double? value})> _groupByTime(
  List<SensorReading> readings,
  String timeRange,
  num? Function(SensorReading) selector,
) {
  final buckets = <String, List<num>>{};
  for (final r in readings) {
    if (r.timestamp == null) continue;
    final label = timeRange == 'today'
        ? '${r.timestamp!.hour.toString().padLeft(2, '0')}:00'
        : _dayLabels[r.timestamp!.weekday - 1];
    final v = selector(r);
    if (v != null) buckets.putIfAbsent(label, () => []).add(v);
  }
  return buckets.entries
      .map((e) => (label: e.key, value: _listAvg(e.value)))
      .toList();
}

List<FlSpot> _toSpots(List<({String label, double? value})> entries) {
  final spots = <FlSpot>[];
  for (int i = 0; i < entries.length; i++) {
    if (entries[i].value != null) spots.add(FlSpot(i.toDouble(), entries[i].value!));
  }
  return spots;
}

List<String> _labels(List<({String label, double? value})> entries) =>
    entries.map((e) => e.label).toList();

// ── Health / compliance helpers ───────────────────────────────────────────────

int? _healthScoreForPlant(Zone zone, Plant plant) {
  final scores = <double>[];
  final moisture = switch (plant.slotNumber) {
    1 => zone.latestMoisture1,
    2 => zone.latestMoisture2,
    3 => zone.latestMoisture3,
    4 => zone.latestMoisture4,
    _ => null,
  } ??
      zone.latestMoisture;
  if (plant.preferredMoistureMin != null && moisture != null) {
    scores.add(moisture >= plant.preferredMoistureMin! && moisture <= plant.preferredMoistureMax! ? 1 : 0);
  }
  if (plant.preferredTemperatureMin != null && zone.latestTemp != null) {
    scores.add(zone.latestTemp! >= plant.preferredTemperatureMin! && zone.latestTemp! <= plant.preferredTemperatureMax! ? 1 : 0);
  }
  if (plant.preferredHumidityMin != null && zone.latestHumid != null) {
    scores.add(zone.latestHumid! >= plant.preferredHumidityMin! && zone.latestHumid! <= plant.preferredHumidityMax! ? 1 : 0);
  }
  if (scores.isEmpty) return null;
  return (scores.reduce((a, b) => a + b) / scores.length * 100).round();
}

int? _zoneHealthScore(Zone zone, List<Plant> plants) {
  final scores = plants.map((p) => _healthScoreForPlant(zone, p)).whereType<int>().toList();
  return scores.isEmpty ? null : (scores.reduce((a, b) => a + b) / scores.length).round();
}

({num? min, num? max}) _avgPref(
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

// ── Moisture chart lines ──────────────────────────────────────────────────────

List<({int slot, String label, Color color})> _getMoistureLines(
  List<Plant> plants,
  List<SensorReading> readings,
  bool isAllZones,
) {
  if (isAllZones) return [(slot: 0, label: 'Avg Moisture', color: Colors.blue)];
  const colors = [Colors.blue, Colors.green, Colors.orange, Colors.purple];
  final lines = <({int slot, String label, Color color})>[];
  for (int s = 1; s <= 4; s++) {
    if (!readings.any((r) => r.moistureForSlot(s) != null)) continue;
    final match = plants.where((p) => p.slotNumber == s);
    lines.add((slot: s, label: match.isEmpty ? 'Slot $s' : match.first.plantName, color: colors[s - 1]));
  }
  return lines.isEmpty ? [(slot: 0, label: 'Moisture', color: Colors.blue)] : lines;
}

// ── Insights ──────────────────────────────────────────────────────────────────

List<({bool? ok, String text})> _generateInsights(
  Zone zone,
  List<Plant> plants,
  List<SensorReading> readings,
) {
  if (plants.isEmpty) return [(ok: null, text: 'Add plants with preferred conditions to see insights.')];
  final moist = _avgPref(plants, (p) => p.preferredMoistureMin, (p) => p.preferredMoistureMax);
  final temp  = _avgPref(plants, (p) => p.preferredTemperatureMin, (p) => p.preferredTemperatureMax);
  final humid = _avgPref(plants, (p) => p.preferredHumidityMin, (p) => p.preferredHumidityMax);
  final out = <({bool? ok, String text})>[];

  if (moist.min != null && zone.latestMoisture != null) {
    if (zone.latestMoisture! < moist.min!) {
      out.add((ok: false, text: 'Soil moisture (${zone.latestMoisture}%) is below the preferred minimum of ${moist.min!.toStringAsFixed(0)}%. Consider increasing watering frequency.'));
    } else if (zone.latestMoisture! > moist.max!) {
      out.add((ok: false, text: 'Soil moisture (${zone.latestMoisture}%) exceeds the preferred maximum of ${moist.max!.toStringAsFixed(0)}%. Reduce watering frequency.'));
    }
  }
  if (temp.min != null && zone.latestTemp != null) {
    if (zone.latestTemp! < temp.min! || zone.latestTemp! > temp.max!) {
      out.add((ok: false, text: 'Temperature (${zone.latestTemp}°C) is outside the preferred range of ${temp.min!.toStringAsFixed(0)}–${temp.max!.toStringAsFixed(0)}°C.'));
    }
  }
  if (humid.min != null && zone.latestHumid != null) {
    if (zone.latestHumid! < humid.min! || zone.latestHumid! > humid.max!) {
      out.add((ok: false, text: 'Humidity (${zone.latestHumid}%) is outside the preferred range of ${humid.min!.toStringAsFixed(0)}–${humid.max!.toStringAsFixed(0)}%.'));
    }
  }

  final tC = _compliancePercent(readings, (r) => r.temperature, temp.min, temp.max);
  final mC = _compliancePercent(readings, (r) => r.moisture, moist.min, moist.max);
  final hC = _compliancePercent(readings, (r) => r.humidity, humid.min, humid.max);
  if (tC != null && tC < 70) out.add((ok: false, text: 'Temperature was outside the preferred range ${(100 - tC).round()}% of the time.'));
  if (mC != null && mC < 70) out.add((ok: false, text: 'Soil moisture was outside the preferred range ${(100 - mC).round()}% of the time.'));
  if (hC != null && hC < 70) out.add((ok: false, text: 'Humidity was outside the preferred range ${(100 - hC).round()}% of the time.'));

  if (out.isEmpty) out.add((ok: true, text: 'All conditions are within preferred ranges. Your plants are doing well.'));
  return out;
}

// ── Score utils ───────────────────────────────────────────────────────────────

Color _scoreColor(int s) {
  if (s >= 80) return Colors.green;
  if (s >= 60) return Colors.amber;
  if (s >= 40) return Colors.orange;
  return Colors.red;
}

String _scoreLabel(int s) {
  if (s >= 80) return 'Excellent';
  if (s >= 60) return 'Good';
  if (s >= 40) return 'Fair';
  return 'Poor';
}

// ── Screen ────────────────────────────────────────────────────────────────────

class AnalyticsScreen extends StatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  State<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends State<AnalyticsScreen> {
  final _db = FirebaseFirestore.instance;

  List<Zone>          _zones           = [];
  String              _selectedZoneId  = 'all';
  String              _timeRange       = '7days';
  List<SensorReading> _readings        = [];
  List<Plant>         _plants          = [];
  bool                _loadingZones    = true;
  bool                _loadingReadings = false;

  StreamSubscription<List<Zone>>? _zonesSub;

  @override
  void initState() {
    super.initState();
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    _zonesSub = ZoneService().watchZones(uid).listen((zones) {
      setState(() {
        _zones = zones;
        _loadingZones = false;
      });
      _fetchData();
    });
  }

  @override
  void dispose() {
    _zonesSub?.cancel();
    super.dispose();
  }

  Future<void> _fetchData() async {
    if (_zones.isEmpty || !mounted) return;
    setState(() => _loadingReadings = true);

    final cutoff = _timeRange == 'today'
        ? DateTime.now().subtract(const Duration(hours: 24))
        : DateTime.now().subtract(const Duration(days: 7));
    final cutoffTs = Timestamp.fromDate(cutoff);

    final targets = _selectedZoneId == 'all'
        ? _zones
        : _zones.where((z) => z.id == _selectedZoneId).toList();

    final readingResults = await Future.wait(targets.map((z) => _db
        .collection('zones')
        .doc(z.id)
        .collection('stats')
        .where('timestamp', isGreaterThanOrEqualTo: cutoffTs)
        .orderBy('timestamp')
        .get()
        .then((s) => s.docs.map((d) => SensorReading.fromMap(d.id, d.data())).toList())));

    final plantResults = await Future.wait(targets.map((z) => _db
        .collection('plants')
        .where('zoneId', isEqualTo: z.id)
        .get()
        .then((s) => s.docs.map((d) => Plant.fromMap(d.id, d.data())).toList())));

    if (!mounted) return;
    setState(() {
      _readings        = readingResults.expand((l) => l).toList();
      _plants          = plantResults.expand((l) => l).toList();
      _loadingReadings = false;
    });
  }

  void _onZoneChanged(String id) {
    setState(() => _selectedZoneId = id);
    _fetchData();
  }

  void _onTimeRangeChanged(String range) {
    setState(() => _timeRange = range);
    _fetchData();
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_loadingZones) return const Center(child: CircularProgressIndicator());

    final isAllZones   = _selectedZoneId == 'all';
    final zoneMatches  = _zones.where((z) => z.id == _selectedZoneId);
    final selectedZone = zoneMatches.isEmpty ? null : zoneMatches.first;
    final activeZones  = isAllZones ? _zones : zoneMatches.toList();

    // Live summary values
    num? liveAvg(num? Function(Zone) f) {
      final vals = activeZones.map(f).whereType<num>().toList();
      return vals.isEmpty ? null : vals.reduce((a, b) => a + b) / vals.length;
    }

    final liveTemp     = liveAvg((z) => z.latestTemp);
    final liveHumid    = liveAvg((z) => z.latestHumid);
    final liveLight    = liveAvg((z) => z.latestLight);
    final liveMoisture = liveAvg((z) => z.latestMoisture);

    // Plants healthy
    final plantScores = _plants.map((p) {
      final zMatch = _zones.where((z) => z.id == p.zoneId);
      return zMatch.isEmpty ? null : _healthScoreForPlant(zMatch.first, p);
    }).whereType<int>().toList();
    final healthyCount = plantScores.where((s) => s >= 70).length;

    // Zone-specific computations
    final score    = selectedZone != null ? _zoneHealthScore(selectedZone, _plants) : null;
    final moistP   = _avgPref(_plants, (p) => p.preferredMoistureMin, (p) => p.preferredMoistureMax);
    final tempP    = _avgPref(_plants, (p) => p.preferredTemperatureMin, (p) => p.preferredTemperatureMax);
    final humidP   = _avgPref(_plants, (p) => p.preferredHumidityMin, (p) => p.preferredHumidityMax);
    final compTemp  = selectedZone != null ? _compliancePercent(_readings, (r) => r.temperature, tempP.min, tempP.max) : null;
    final compMoist = selectedZone != null ? _compliancePercent(_readings, (r) => r.moisture, moistP.min, moistP.max) : null;
    final compHumid = selectedZone != null ? _compliancePercent(_readings, (r) => r.humidity, humidP.min, humidP.max) : null;

    final ranking = selectedZone != null
        ? (_plants.map((p) => (plant: p, score: _healthScoreForPlant(selectedZone, p))).where((x) => x.score != null).toList()
            ..sort((a, b) => b.score!.compareTo(a.score!)))
        : <({Plant plant, int? score})>[];

    final insights = selectedZone != null
        ? _generateInsights(selectedZone, _plants, _readings)
        : <({bool? ok, String text})>[];

    final moistureLines = _getMoistureLines(_plants, _readings, isAllZones);

    final cs = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          const Text('Analytics', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            'Track plant health and growing conditions.',
            style: TextStyle(fontSize: 14, color: cs.onSurface.withValues(alpha: 0.55)),
          ),
          const SizedBox(height: 20),

          // Zone chips
          SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _ZoneChip(label: 'All Zones', selected: isAllZones, onTap: () => _onZoneChanged('all')),
                ..._zones.map((z) => _ZoneChip(
                      label: z.zoneName,
                      selected: _selectedZoneId == z.id,
                      onTap: () => _onZoneChanged(z.id),
                    )),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Time range toggle
          Row(
            children: ['today', '7days'].map((t) {
              final sel = _timeRange == t;
              return Expanded(
                child: GestureDetector(
                  onTap: () => _onTimeRangeChanged(t),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      color: sel ? Colors.green[700] : cs.surfaceContainerHigh,
                      borderRadius: BorderRadius.horizontal(
                        left:  t == 'today' ? const Radius.circular(10) : Radius.zero,
                        right: t == '7days' ? const Radius.circular(10) : Radius.zero,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      t == 'today' ? 'Today' : '7 Days',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: sel ? Colors.white : cs.onSurface.withValues(alpha: 0.7),
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 20),

          // Summary cards
          GridView.count(
            crossAxisCount: 2,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            crossAxisSpacing: 12,
            mainAxisSpacing: 12,
            childAspectRatio: 1.7,
            children: [
              _MetricCard(label: 'Temperature', value: liveTemp  != null ? '${liveTemp.toStringAsFixed(1)}°C'  : null),
              _MetricCard(label: 'Humidity',    value: liveHumid != null ? '${liveHumid.toStringAsFixed(1)}%'  : null),
              _MetricCard(label: 'Light',       value: liveLight != null ? '${liveLight.toStringAsFixed(0)} lx' : null),
              _MetricCard(label: 'Moisture',    value: liveMoisture != null ? '${liveMoisture.toStringAsFixed(1)}%' : null),
            ],
          ),
          const SizedBox(height: 12),
          _MetricCard(
            label: 'Plants Healthy',
            value: plantScores.isNotEmpty ? '$healthyCount / ${plantScores.length}' : null,
            sub: plantScores.isEmpty ? 'Set plant preferences first' : null,
            fullWidth: true,
          ),
          const SizedBox(height: 20),

          // Loading / charts
          if (_loadingReadings)
            const Center(
              child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()),
            )
          else ...[
            _ChartCard(
              title: 'Temperature (°C)',
              child: _buildSingleChart(_groupByTime(_readings, _timeRange, (r) => r.temperature), Colors.orange),
            ),
            const SizedBox(height: 12),
            _ChartCard(
              title: 'Humidity (%)',
              child: _buildSingleChart(_groupByTime(_readings, _timeRange, (r) => r.humidity), Colors.green),
            ),
            const SizedBox(height: 12),
            _ChartCard(
              title: 'Light (lx)',
              child: _buildSingleChart(_groupByTime(_readings, _timeRange, (r) => r.lightLevel), Colors.amber),
            ),
            const SizedBox(height: 12),
            _ChartCard(title: 'Soil Moisture (%)', child: _buildMoistureChart(moistureLines)),
            const SizedBox(height: 20),

            // Zone-specific sections
            if (selectedZone != null) ...[
              _SectionCard(
                title: 'Zone Health Score',
                child: score == null
                    ? Text('Add plants with preferred conditions to compute a health score.',
                        style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55)))
                    : Row(children: [
                        Text('$score%',
                            style: TextStyle(fontSize: 44, fontWeight: FontWeight.bold, color: _scoreColor(score))),
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: _scoreColor(score).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text(_scoreLabel(score),
                              style: TextStyle(color: _scoreColor(score), fontWeight: FontWeight.w600)),
                        ),
                      ]),
              ),

              if (compTemp != null || compMoist != null || compHumid != null) ...[
                const SizedBox(height: 12),
                _SectionCard(
                  title: 'Compliance Analysis',
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('% of historical readings within the preferred range.',
                        style: TextStyle(fontSize: 12, color: cs.onSurface.withValues(alpha: 0.5))),
                    const SizedBox(height: 14),
                    if (compTemp  != null) _ComplianceBar(label: 'Temperature',   value: compTemp),
                    if (compHumid != null) _ComplianceBar(label: 'Humidity',       value: compHumid),
                    if (compMoist != null) _ComplianceBar(label: 'Soil Moisture',  value: compMoist),
                  ]),
                ),
              ],

              if (ranking.isNotEmpty) ...[
                const SizedBox(height: 12),
                _SectionCard(
                  title: 'Plant Ranking',
                  child: Column(
                    children: List.generate(ranking.length, (i) => Padding(
                      padding: EdgeInsets.only(bottom: i < ranking.length - 1 ? 10 : 0),
                      child: Row(children: [
                        SizedBox(
                          width: 22,
                          child: Text('${i + 1}',
                              textAlign: TextAlign.right,
                              style: TextStyle(color: cs.onSurface.withValues(alpha: 0.45))),
                        ),
                        const SizedBox(width: 10),
                        Expanded(child: Text(ranking[i].plant.plantName, style: const TextStyle(fontWeight: FontWeight.w500))),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: _scoreColor(ranking[i].score!).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text('${ranking[i].score}%',
                              style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                  color: _scoreColor(ranking[i].score!))),
                        ),
                      ]),
                    )),
                  ),
                ),
              ],

              if (insights.isNotEmpty) ...[
                const SizedBox(height: 12),
                _SectionCard(
                  title: 'Insights & Recommendations',
                  child: Column(
                    children: List.generate(insights.length, (i) => Padding(
                      padding: EdgeInsets.only(bottom: i < insights.length - 1 ? 8 : 0),
                      child: _InsightTile(insight: insights[i]),
                    )),
                  ),
                ),
              ],

              const SizedBox(height: 20),
            ],
          ],
        ],
      ),
    );
  }

  // ── Chart builders ────────────────────────────────────────────────────────

  Widget _buildSingleChart(List<({String label, double? value})> entries, Color color) {
    final spots  = _toSpots(entries);
    final labels = _labels(entries);
    if (spots.isEmpty) return _emptyChart();
    return SizedBox(
      height: 160,
      child: LineChart(LineChartData(
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            color: color,
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(show: true, color: color.withValues(alpha: 0.08)),
          ),
        ],
        titlesData: _titlesData(labels),
        gridData: const FlGridData(show: true, drawVerticalLine: false),
        borderData: FlBorderData(show: false),
        lineTouchData: const LineTouchData(enabled: false),
      )),
    );
  }

  Widget _buildMoistureChart(List<({int slot, String label, Color color})> lines) {
    final barData = lines.map((line) {
      final entries = line.slot == 0
          ? _groupByTime(_readings, _timeRange, (r) => r.moisture)
          : _groupByTime(_readings, _timeRange, (r) => r.moistureForSlot(line.slot));
      return LineChartBarData(
        spots: _toSpots(entries),
        isCurved: true,
        color: line.color,
        barWidth: 2,
        dotData: const FlDotData(show: false),
        belowBarData: BarAreaData(show: false),
      );
    }).toList();

    if (barData.every((b) => b.spots.isEmpty)) return _emptyChart();

    final baseEntries = _groupByTime(_readings, _timeRange, (r) => r.moisture);
    final labels = _labels(baseEntries);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (lines.length > 1) ...[
          Wrap(
            spacing: 12,
            runSpacing: 6,
            children: lines.map((l) => Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(width: 10, height: 10, decoration: BoxDecoration(color: l.color, shape: BoxShape.circle)),
                const SizedBox(width: 4),
                Text(l.label, style: const TextStyle(fontSize: 11)),
              ],
            )).toList(),
          ),
          const SizedBox(height: 8),
        ],
        SizedBox(
          height: 160,
          child: LineChart(LineChartData(
            lineBarsData: barData,
            titlesData: _titlesData(labels),
            gridData: const FlGridData(show: true, drawVerticalLine: false),
            borderData: FlBorderData(show: false),
            lineTouchData: const LineTouchData(enabled: false),
          )),
        ),
      ],
    );
  }

  FlTitlesData _titlesData(List<String> labels) {
    final step = (labels.length / 5).ceil().clamp(1, 99);
    return FlTitlesData(
      leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: true, reservedSize: 36)),
      bottomTitles: AxisTitles(
        sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 28,
          getTitlesWidget: (value, meta) {
            final idx = value.toInt();
            if (idx < 0 || idx >= labels.length || idx % step != 0) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(labels[idx], style: const TextStyle(fontSize: 9)),
            );
          },
        ),
      ),
      topTitles:   const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
    );
  }

  Widget _emptyChart() => const SizedBox(
        height: 80,
        child: Center(
          child: Text('No readings in this period.', style: TextStyle(color: Colors.grey, fontSize: 13)),
        ),
      );
}

// ── Reusable sub-widgets ──────────────────────────────────────────────────────

class _ZoneChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _ZoneChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? Colors.green[700] : Theme.of(context).colorScheme.surfaceContainerHigh,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: selected ? Colors.white : Theme.of(context).colorScheme.onSurface,
          ),
        ),
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  final String label;
  final String? value;
  final String? sub;
  final bool fullWidth;

  const _MetricCard({required this.label, this.value, this.sub, this.fullWidth = false});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: fullWidth ? double.infinity : null,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.07), blurRadius: 8, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: TextStyle(fontSize: 11, color: cs.onSurface.withValues(alpha: 0.5))),
          const SizedBox(height: 4),
          Text(value ?? '—', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          if (sub != null)
            Text(sub!, style: TextStyle(fontSize: 11, color: cs.onSurface.withValues(alpha: 0.45))),
        ],
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _ChartCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.07), blurRadius: 8, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.07), blurRadius: 8, offset: const Offset(0, 4))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

class _ComplianceBar extends StatelessWidget {
  final String label;
  final double value;

  const _ComplianceBar({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final cs  = Theme.of(context).colorScheme;
    final pct = value.round();
    final color = pct >= 80 ? Colors.green : pct >= 60 ? Colors.amber : Colors.red;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: TextStyle(color: cs.onSurface.withValues(alpha: 0.6))),
              Text('$pct%', style: TextStyle(fontWeight: FontWeight.w600, color: color)),
            ],
          ),
          const SizedBox(height: 6),
          LinearProgressIndicator(
            value: value / 100,
            color: color,
            backgroundColor: cs.surfaceContainerHigh,
            minHeight: 7,
            borderRadius: BorderRadius.circular(4),
          ),
        ],
      ),
    );
  }
}

class _InsightTile extends StatelessWidget {
  final ({bool? ok, String text}) insight;

  const _InsightTile({required this.insight});

  @override
  Widget build(BuildContext context) {
    final isOk   = insight.ok == true;
    final isWarn = insight.ok == false;
    final bg = isOk   ? Colors.green.withValues(alpha: 0.1)
             : isWarn ? Colors.orange.withValues(alpha: 0.1)
             : Theme.of(context).colorScheme.surfaceContainerHigh;
    final fg = isOk   ? Colors.green[800]
             : isWarn ? Colors.orange[800]
             : Theme.of(context).colorScheme.onSurface;
    final icon = isOk ? '✅' : isWarn ? '⚠️' : 'ℹ️';

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(icon, style: const TextStyle(fontSize: 14)),
          const SizedBox(width: 8),
          Expanded(child: Text(insight.text, style: TextStyle(color: fg, fontSize: 13))),
        ],
      ),
    );
  }
}
