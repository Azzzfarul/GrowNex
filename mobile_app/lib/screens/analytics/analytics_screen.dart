import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../../models/plant_model.dart';
import '../../models/sensor_reading_model.dart';
import '../../models/zone_model.dart';
import '../../services/ai_summary_service.dart';
import '../../services/firestore/zone_service.dart';
import '../../utils/analytics.dart';
import '../../utils/plant_health.dart';
import '../../theme.dart';

List<FlSpot> _toSpots(List<({String label, double? value})> entries) {
  final spots = <FlSpot>[];
  for (int i = 0; i < entries.length; i++) {
    if (entries[i].value != null) spots.add(FlSpot(i.toDouble(), entries[i].value!));
  }
  return spots;
}

List<String> _labels(List<({String label, double? value})> entries) =>
    entries.map((e) => e.label).toList();

// ── Moisture chart lines ──────────────────────────────────────────────────────

List<({int slot, String label, Color color})> _getMoistureLines(
  List<Plant> plants,
  List<SensorReading> readings,
  bool isAllZones,
  List<Color> colors,  // AppColors.series
) {
  if (isAllZones) return [(slot: 0, label: 'Avg Moisture', color: colors[0])];
  final lines = <({int slot, String label, Color color})>[];
  for (int s = 1; s <= 4; s++) {
    if (!readings.any((r) => r.moistureForSlot(s) != null)) continue;
    final match = plants.where((p) => p.slotNumber == s);
    lines.add((slot: s, label: match.isEmpty ? 'Slot $s' : match.first.plantName, color: colors[s - 1]));
  }
  return lines.isEmpty ? [(slot: 0, label: 'Moisture', color: colors[0])] : lines;
}

// ── Score utils ───────────────────────────────────────────────────────────────

// Container + on-container colors for a health score badge
({Color bg, Color fg}) _scoreTone(BuildContext context, int s) {
  final cs = Theme.of(context).colorScheme;
  final app = AppColors.of(context);
  if (s >= 80) return (bg: cs.primaryContainer, fg: cs.onPrimaryContainer);
  if (s >= 40) return (bg: app.warningContainer, fg: app.onWarningContainer);
  return (bg: cs.errorContainer, fg: cs.onErrorContainer);
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
  Map<String, String?> _aiSummaries    = {};
  String              _aiSource        = 'fallback';
  List<Advice>        _aiAdvice        = [];

  StreamSubscription<List<Zone>>? _zonesSub;
  int _fetchSeq = 0;  // latest _fetchData call; older responses are dropped

  @override
  void initState() {
    super.initState();
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    _zonesSub = ZoneService().watchZones(uid).listen((zones) {
      // The bridge rewrites every zone doc about once a minute. Refetch history (and re-ask
      // the AI) only when the set of zones changes, not on every live-value update.
      final idsChanged = zones.map((z) => z.id).join(',') != _zones.map((z) => z.id).join(',');
      setState(() {
        _zones = zones;
        _loadingZones = false;
      });
      if (idsChanged) _fetchData();
    });
  }

  @override
  void dispose() {
    _zonesSub?.cancel();
    super.dispose();
  }

  Future<void> _fetchData() async {
    if (_zones.isEmpty || !mounted) return;
    final seq = ++_fetchSeq;
    setState(() {
      _loadingReadings = true;
      _aiSummaries = {};  // don't show the previous zone's AI text while loading
      _aiSource = 'fallback';
      _aiAdvice = [];
    });

    final cutoff = _timeRange == 'today'
        ? DateTime.now().subtract(const Duration(hours: 24))
        : DateTime.now().subtract(const Duration(days: 7));
    final cutoffTs = Timestamp.fromDate(cutoff);

    final targets = _selectedZoneId == 'all'
        ? _zones
        : _zones.where((z) => z.id == _selectedZoneId).toList();

    try {
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

      if (!mounted || seq != _fetchSeq) return;
      setState(() {
        _readings        = readingResults.expand((l) => l).toList();
        _plants          = plantResults.expand((l) => l).toList();
        _loadingReadings = false;
      });
      _loadAiSummaries(seq);
    } catch (e) {
      debugPrint('Analytics load failed: $e');
      if (!mounted || seq != _fetchSeq) return;
      setState(() {
        _readings = [];
        _plants = [];
        _loadingReadings = false;
      });
    }
  }

  /// One server call for the whole AI summary. Any failure leaves the maps empty
  /// and the UI shows the rule-based describeTrend / buildOverviewSummary output.
  Future<void> _loadAiSummaries(int seq) async {
    if (_selectedZoneId == 'all') {
      if (mounted) setState(() { _aiSummaries = {}; _aiSource = 'fallback'; _aiAdvice = []; });
      return;
    }
    final zoneMatch = _zones.where((z) => z.id == _selectedZoneId);
    if (zoneMatch.isEmpty) return;
    final zone = zoneMatch.first;

    final tempEntries  = groupByTime(_readings, _timeRange, (r) => r.temperature);
    final humidEntries = groupByTime(_readings, _timeRange, (r) => r.humidity);
    final lightEntries = groupByTime(_readings, _timeRange, (r) => r.lightLevel);
    final moistSeries  = moistureBucketSeries(_readings, _timeRange);
    final tPref = avgPref(_plants, (p) => p.preferredMoistureMin, (p) => p.preferredMoistureMax);
    final tempP  = avgPref(_plants, (p) => p.preferredTemperatureMin, (p) => p.preferredTemperatureMax);
    final humidP = avgPref(_plants, (p) => p.preferredHumidityMin, (p) => p.preferredHumidityMax);
    final tRes = describeTrend(series: tempEntries.map((e) => e.value).toList(),  pref: tempP,  timeRange: _timeRange, label: 'temperature',   kind: 'temperature');
    final hRes = describeTrend(series: humidEntries.map((e) => e.value).toList(), pref: humidP, timeRange: _timeRange, label: 'humidity',      kind: 'humidity');
    final lRes = describeTrend(series: lightEntries.map((e) => e.value).toList(), pref: (min: null, max: null), timeRange: _timeRange, label: 'light', kind: 'light');
    final mRes = describeTrend(series: moistSeries, pref: tPref, timeRange: _timeRange, label: 'soil moisture', kind: 'moisture');
    final oRes = buildOverviewSummary(selectedZone: zone, plants: _plants, temperature: tRes, humidity: hRes, moisture: mRes);

    Map<String, num?> prefMap(({num? min, num? max}) p) => {'min': p.min, 'max': p.max};

    final payload = <String, dynamic>{
      'zoneId': _selectedZoneId,
      'timeRange': _timeRange,
      'labels': tempEntries.map((e) => e.label).toList(),
      'series': {
        'temperature': tempEntries.map((e) => e.value).toList(),
        'humidity': humidEntries.map((e) => e.value).toList(),
        'light': lightEntries.map((e) => e.value).toList(),
        'moisture': moistSeries,
      },
      'prefs': {'temperature': prefMap(tempP), 'humidity': prefMap(humidP), 'moisture': prefMap(tPref)},
      'latest': {
        'temp': zone.latestTemp,
        'humid': zone.latestHumid,
        'light': zone.latestLight,
        'moisture': zone.latestMoisture,
      },
      'plants': _plants
          .map((p) => {'name': p.plantName, 'species': p.species, 'slotNumber': p.slotNumber})
          .toList(),
      'ruleResults': {
        'overview': oRes.text,
        'temperature': tRes.text,
        'humidity': hRes.text,
        'light': lRes.text,
        'moisture': mRes.text,
      },
    };

    final result = await const AiSummaryService().fetchSummary(payload);
    if (!mounted || seq != _fetchSeq) return;
    setState(() {
      _aiSummaries = result.summaries ?? {};
      _aiSource = result.source;
      _aiAdvice = result.advice;
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
    final tt = Theme.of(context).textTheme;
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
      return zMatch.isEmpty ? null : healthScoreForPlant(zMatch.first, p);
    }).whereType<int>().toList();
    final healthyCount = plantScores.where((s) => s >= 70).length;

    // Zone-specific computations
    final score    = selectedZone != null ? zoneHealthScore(selectedZone, _plants) : null;
    final moistP   = avgPref(_plants, (p) => p.preferredMoistureMin, (p) => p.preferredMoistureMax);
    final tempP    = avgPref(_plants, (p) => p.preferredTemperatureMin, (p) => p.preferredTemperatureMax);
    final humidP   = avgPref(_plants, (p) => p.preferredHumidityMin, (p) => p.preferredHumidityMax);
    final compTemp  = selectedZone != null ? compliancePercent(_readings, (r) => r.temperature, tempP.min, tempP.max) : null;
    final compMoist = selectedZone != null ? compliancePercent(_readings, (r) => r.moisture, moistP.min, moistP.max) : null;
    final compHumid = selectedZone != null ? compliancePercent(_readings, (r) => r.humidity, humidP.min, humidP.max) : null;

    final ranking = selectedZone != null
        ? (_plants.map((p) => (plant: p, health: plantHealth(p, selectedZone, _readings))).where((x) => x.health.score != null).toList()
            ..sort((a, b) => b.health.score!.compareTo(a.health.score!)))
        : <({Plant plant, PlantHealthResult health})>[];

    final insights = selectedZone != null
        ? generateInsights(selectedZone, _plants, _readings)
        : <({bool? ok, String text})>[];

    final series = AppColors.of(context).series;
    final moistureLines = _getMoistureLines(_plants, _readings, isAllZones, series);

    // Per-graph + overview summaries (AI value preferred, rule-based fallback otherwise)
    final tempRes = describeTrend(
      series: groupByTime(_readings, _timeRange, (r) => r.temperature).map((e) => e.value).toList(),
      pref: tempP, timeRange: _timeRange, label: 'temperature', kind: 'temperature');
    final humidRes = describeTrend(
      series: groupByTime(_readings, _timeRange, (r) => r.humidity).map((e) => e.value).toList(),
      pref: humidP, timeRange: _timeRange, label: 'humidity', kind: 'humidity');
    final lightRes = describeTrend(
      series: groupByTime(_readings, _timeRange, (r) => r.lightLevel).map((e) => e.value).toList(),
      pref: (min: null, max: null), timeRange: _timeRange, label: 'light', kind: 'light');
    final moistRes = describeTrend(
      series: moistureBucketSeries(_readings, _timeRange),
      pref: moistP, timeRange: _timeRange, label: 'soil moisture', kind: 'moisture');
    final overviewRes = buildOverviewSummary(
      selectedZone: selectedZone, plants: _plants,
      temperature: tempRes, humidity: humidRes, moisture: moistRes);
    final graphRes = {
      'temperature': tempRes, 'humidity': humidRes, 'light': lightRes, 'moisture': moistRes,
    };

    final cs = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Text('Analytics', style: tt.titleLarge),
          const SizedBox(height: 4),
          Text(
            'Track plant health and growing conditions.',
            style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
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

          // Time range
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'today', label: Text('Today')),
                ButtonSegment(value: '7days', label: Text('7 Days')),
              ],
              selected: {_timeRange},
              onSelectionChanged: (s) => _onTimeRangeChanged(s.first),
            ),
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
              _MetricCard(label: 'Light',       value: liveLight != null ? '${liveLight.toStringAsFixed(0)}%' : null),
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

          // AI Summary
          _SectionCard(
            title: 'AI Summary',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _SummaryLine(
                  text: _aiSummaries['overview'] ?? overviewRes.text,
                  isAi: _aiSummaries['overview'] != null,
                ),
                if (_aiSource != 'fallback' && _aiAdvice.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ...List.generate(_aiAdvice.length, (i) => Padding(
                    padding: EdgeInsets.only(bottom: i < _aiAdvice.length - 1 ? 8 : 0),
                    child: _AdviceTile(advice: _aiAdvice[i]),
                  )),
                ] else if (selectedZone != null && insights.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  ...List.generate(insights.length, (i) => Padding(
                    padding: EdgeInsets.only(bottom: i < insights.length - 1 ? 8 : 0),
                    child: _InsightTile(insight: insights[i]),
                  )),
                ],
              ],
            ),
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
              caption: _SummaryLine(
                dense: true,
                text: _aiSummaries['temperature'] ?? graphRes['temperature']!.text,
                isAi: _aiSummaries['temperature'] != null,
              ),
              child: _buildSingleChart(groupByTime(_readings, _timeRange, (r) => r.temperature), series[1]),
            ),
            const SizedBox(height: 12),
            _ChartCard(
              title: 'Humidity (%)',
              caption: _SummaryLine(
                dense: true,
                text: _aiSummaries['humidity'] ?? graphRes['humidity']!.text,
                isAi: _aiSummaries['humidity'] != null,
              ),
              child: _buildSingleChart(groupByTime(_readings, _timeRange, (r) => r.humidity), series[2]),
            ),
            const SizedBox(height: 12),
            _ChartCard(
              title: 'Light (%)',
              caption: _SummaryLine(
                dense: true,
                text: _aiSummaries['light'] ?? graphRes['light']!.text,
                isAi: _aiSummaries['light'] != null,
              ),
              child: _buildSingleChart(groupByTime(_readings, _timeRange, (r) => r.lightLevel), series[3]),
            ),
            const SizedBox(height: 12),
            _ChartCard(
              title: 'Soil Moisture (%)',
              caption: _SummaryLine(
                dense: true,
                text: _aiSummaries['moisture'] ?? graphRes['moisture']!.text,
                isAi: _aiSummaries['moisture'] != null,
              ),
              child: _buildMoistureChart(moistureLines),
            ),
            const SizedBox(height: 20),

            // Zone-specific sections
            if (selectedZone != null) ...[
              _SectionCard(
                title: 'Zone Health Score',
                child: score == null
                    ? Text('Add plants with preferred conditions to compute a health score.',
                        style: TextStyle(color: cs.onSurfaceVariant))
                    : Row(children: [
                        Text('$score%', style: tt.displaySmall),
                        const SizedBox(width: 12),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: _scoreTone(context, score).bg,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(_scoreLabel(score),
                              style: tt.labelLarge?.copyWith(color: _scoreTone(context, score).fg)),
                        ),
                      ]),
              ),

              if (compTemp != null || compMoist != null || compHumid != null) ...[
                const SizedBox(height: 12),
                _SectionCard(
                  title: 'Compliance Analysis',
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('% of historical readings within the preferred range.',
                        style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
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
                    children: List.generate(ranking.length, (i) {
                      final r = ranking[i];
                      final s = r.health.score!;
                      return Padding(
                        padding: EdgeInsets.only(bottom: i < ranking.length - 1 ? 12 : 0),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            SizedBox(
                              width: 22,
                              child: Text('${i + 1}',
                                  textAlign: TextAlign.right,
                                  style: TextStyle(color: cs.onSurfaceVariant)),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Expanded(child: Text(r.plant.plantName, style: const TextStyle(fontWeight: FontWeight.w500))),
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                        decoration: BoxDecoration(
                                          color: _scoreTone(context, s).bg,
                                          borderRadius: BorderRadius.circular(8),
                                        ),
                                        child: Text('$s%',
                                            style: tt.labelMedium?.copyWith(color: _scoreTone(context, s).fg)),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(plantHealthSummary(r.health),
                                      style: tt.labelSmall?.copyWith(color: cs.onSurfaceVariant)),
                                ],
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
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
        gridData: _grid(),
        borderData: FlBorderData(show: false),
        lineTouchData: const LineTouchData(enabled: false),
      )),
    );
  }

  Widget _buildMoistureChart(List<({int slot, String label, Color color})> lines) {
    final tt = Theme.of(context).textTheme;
    final barData = lines.map((line) {
      final entries = line.slot == 0
          ? groupByTime(_readings, _timeRange, (r) => r.moisture)
          : groupByTime(_readings, _timeRange, (r) => r.moistureForSlot(line.slot));
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

    final baseEntries = groupByTime(_readings, _timeRange, (r) => r.moisture);
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
                Text(l.label, style: tt.labelSmall),
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
            gridData: _grid(),
            borderData: FlBorderData(show: false),
            lineTouchData: const LineTouchData(enabled: false),
          )),
        ),
      ],
    );
  }

  FlTitlesData _titlesData(List<String> labels) {
    final tt = Theme.of(context).textTheme;
    final step = (labels.length / 5).ceil().clamp(1, 99);
    return FlTitlesData(
      leftTitles: AxisTitles(
        sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 36,
          getTitlesWidget: (value, meta) => Text(meta.formattedValue,
              style: tt.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ),
      ),
      bottomTitles: AxisTitles(
        sideTitles: SideTitles(
          showTitles: true,
          reservedSize: 28,
          getTitlesWidget: (value, meta) {
            final idx = value.toInt();
            if (idx < 0 || idx >= labels.length || idx % step != 0) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(labels[idx], style: tt.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            );
          },
        ),
      ),
      topTitles:   const AxisTitles(sideTitles: SideTitles(showTitles: false)),
      rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
    );
  }

  Widget _emptyChart() => SizedBox(
        height: 80,
        child: Center(
          child: Text('No readings in this period.',
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ),
      );

  // Recessive grid lines in the theme's outline color
  FlGridData _grid() => FlGridData(
        show: true,
        drawVerticalLine: false,
        getDrawingHorizontalLine: (_) => FlLine(
          color: Theme.of(context).colorScheme.outlineVariant,
          strokeWidth: 1,
          dashArray: const [3, 3],
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
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: ChoiceChip(label: Text(label), selected: selected, onSelected: (_) => onTap()),
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
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Card(
      child: Container(
        width: fullWidth ? double.infinity : null,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: tt.labelSmall?.copyWith(color: cs.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(value ?? '—', style: tt.titleLarge),
            if (sub != null)
              Text(sub!, style: tt.labelSmall?.copyWith(color: cs.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }
}

class _ChartCard extends StatelessWidget {
  final String title;
  final Widget? caption;
  final Widget child;

  const _ChartCard({required this.title, this.caption, required this.child});

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: tt.titleSmall),
            if (caption != null) ...[
              const SizedBox(height: 4),
              caption!,
            ],
            const SizedBox(height: 12),
            child,
          ],
        ),
      ),
    );
  }
}

class _SummaryLine extends StatelessWidget {
  final String text;
  final bool isAi;
  final bool dense;

  const _SummaryLine({required this.text, required this.isAi, this.dense = false});

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          margin: const EdgeInsets.only(top: 1),
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: isAi ? cs.primaryContainer : cs.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            isAi ? 'AI' : 'Auto',
            style: tt.labelSmall?.copyWith(color: isAi ? cs.onPrimaryContainer : cs.onSurfaceVariant),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: (dense ? tt.bodySmall : tt.bodyMedium)?.copyWith(color: cs.onSurfaceVariant),
          ),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final Widget child;

  const _SectionCard({required this.title, required this.child});

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    return Card(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: tt.titleSmall),
            const SizedBox(height: 14),
            child,
          ],
        ),
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
    final app = AppColors.of(context);
    final cs  = Theme.of(context).colorScheme;
    final pct = value.round();
    final color = pct >= 80 ? cs.primary : pct >= 60 ? app.warning : cs.error;
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: TextStyle(color: cs.onSurfaceVariant)),
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
    final cs = Theme.of(context).colorScheme;
    final app = AppColors.of(context);
    final tt = Theme.of(context).textTheme;
    final isOk   = insight.ok == true;
    final isWarn = insight.ok == false;
    final bg = isOk   ? cs.primaryContainer
             : isWarn ? app.warningContainer
             : cs.surfaceContainerHigh;
    final fg = isOk   ? cs.onPrimaryContainer
             : isWarn ? app.onWarningContainer
             : cs.onSurface;
    final icon = isOk ? Icons.check_circle_outline : isWarn ? Icons.warning_amber_rounded : Icons.info_outline;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: fg),
          const SizedBox(width: 8),
          Expanded(child: Text(insight.text, style: tt.bodyMedium?.copyWith(color: fg))),
        ],
      ),
    );
  }
}

class _AdviceTile extends StatelessWidget {
  final Advice advice;

  const _AdviceTile({required this.advice});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final app = AppColors.of(context);
    final tt = Theme.of(context).textTheme;
    final isCritical = advice.severity == 'critical';
    final isWarn = advice.severity == 'warn';
    final bg = isCritical ? cs.errorContainer
             : isWarn     ? app.warningContainer
             : cs.surfaceContainerHigh;
    final fg = isCritical ? cs.onErrorContainer
             : isWarn     ? app.onWarningContainer
             : cs.onSurface;
    final icon = isCritical ? Icons.error_outline : isWarn ? Icons.warning_amber_rounded : Icons.info_outline;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: fg),
          const SizedBox(width: 8),
          Expanded(child: Text(advice.text, style: tt.bodyMedium?.copyWith(color: fg))),
        ],
      ),
    );
  }
}
