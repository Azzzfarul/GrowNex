import 'package:flutter/material.dart';

import '../../../models/device_model.dart';
import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/device_service.dart';
import '../../../services/firestore/plant_service.dart';

class MonitoringTab extends StatefulWidget {
  final Zone zone;

  const MonitoringTab({super.key, required this.zone});

  @override
  State<MonitoringTab> createState() => _MonitoringTabState();
}

class _MonitoringTabState extends State<MonitoringTab> {
  Stream<Device?>? _deviceStream;
  late final Stream<List<Plant>> _plantsStream;

  @override
  void initState() {
    super.initState();
    _plantsStream = PlantService().watchPlantsByZone(widget.zone.id);
    _syncStream(widget.zone.deviceId);
  }

  @override
  void didUpdateWidget(MonitoringTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zone.deviceId != widget.zone.deviceId) {
      _syncStream(widget.zone.deviceId);
    }
  }

  void _syncStream(String? deviceId) {
    setState(() {
      _deviceStream = deviceId != null ? DeviceService().watchDevice(deviceId) : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _buildDeviceStatus(),
        const SizedBox(height: 20),
        _buildSensorOverview(),
        const SizedBox(height: 20),
        _buildIdealConditions(),
        const SizedBox(height: 20),
        _buildImagePreview(),
      ],
    );
  }

  Widget _card({required Widget child}) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: child,
    );
  }

  Widget _buildDeviceStatus() {
    final cs = Theme.of(context).colorScheme;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Device status', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          if (_deviceStream == null)
            Text('No device connected',
                style: TextStyle(fontSize: 16, color: cs.onSurface.withValues(alpha: 0.55)))
          else
            StreamBuilder<Device?>(
              stream: _deviceStream,
              builder: (context, snapshot) {
                final device = snapshot.data;
                if (snapshot.connectionState == ConnectionState.waiting && device == null) {
                  return const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2));
                }
                if (device == null) {
                  return const Text('Device not found', style: TextStyle(color: Colors.red));
                }

                final isOnline = device.status == 'online';
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(device.deviceName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        CircleAvatar(radius: 5, backgroundColor: isOnline ? Colors.green[700] : Colors.red[400]),
                        const SizedBox(width: 8),
                        Text(
                          isOnline ? 'Online' : 'Offline',
                          style: TextStyle(
                            color: isOnline ? Colors.green[700] : Colors.red[400],
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                );
              },
            ),
        ],
      ),
    );
  }

  Widget _buildSensorOverview() {
    return StreamBuilder<List<Plant>>(
      stream: _plantsStream,
      builder: (context, snapshot) {
        final plants  = snapshot.data ?? [];
        final tempMin  = _avg(plants.map((p) => p.preferredTemperatureMin));
        final tempMax  = _avg(plants.map((p) => p.preferredTemperatureMax));
        final humidMin = _avg(plants.map((p) => p.preferredHumidityMin));
        final humidMax = _avg(plants.map((p) => p.preferredHumidityMax));
        final moistMin = _avg(plants.map((p) => p.preferredMoistureMin));
        final moistMax = _avg(plants.map((p) => p.preferredMoistureMax));
        final cs = Theme.of(context).colorScheme;

        return _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Latest readings', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 14),
              if (_deviceStream != null)
                StreamBuilder<Device?>(
                  stream: _deviceStream,
                  builder: (context, deviceSnap) {
                    final device = deviceSnap.data;
                    final isOffline = device != null && device.status != 'online';
                    if (!isOffline) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.orange[50],
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: Colors.orange[100]!),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.warning_amber_rounded, size: 16, color: Colors.orange[700]),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Device is offline — readings may be outdated.',
                                style: TextStyle(fontSize: 12, color: Colors.orange[800], fontWeight: FontWeight.w500),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              _sensorValue(cs, 'Temperature', widget.zone.latestTemp    != null ? '${widget.zone.latestTemp}°C'    : '--', min: tempMin,  max: tempMax),
              const SizedBox(height: 10),
              _sensorValue(cs, 'Humidity',    widget.zone.latestHumid   != null ? '${widget.zone.latestHumid}%'   : '--', min: humidMin, max: humidMax),
              const SizedBox(height: 10),
              _sensorValue(cs, 'Light',       widget.zone.latestLight   != null ? '${widget.zone.latestLight} lx' : '--'),
              const SizedBox(height: 10),
              _sensorValue(cs, 'Moisture',    widget.zone.latestMoisture != null ? '${widget.zone.latestMoisture}%' : '--', min: moistMin, max: moistMax),
            ],
          ),
        );
      },
    );
  }

  Widget _buildIdealConditions() {
    final cs = Theme.of(context).colorScheme;
    return StreamBuilder<List<Plant>>(
      stream: _plantsStream,
      builder: (context, snapshot) {
        final plants = snapshot.data ?? [];
        return _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.eco, color: Colors.green[700], size: 20),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text('Ideal zone conditions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                plants.isEmpty
                    ? 'Add plants with preferred conditions to see computed ideals.'
                    : 'Averaged from ${plants.length} plant${plants.length == 1 ? '' : 's'} in this zone. Edit at the plant level.',
                style: TextStyle(fontSize: 12, color: cs.onSurface.withValues(alpha: 0.45)),
              ),
              const SizedBox(height: 14),
              if (plants.isEmpty)
                Text('No plants yet', style: TextStyle(color: cs.onSurface.withValues(alpha: 0.38)))
              else
                ..._buildIdealRows(cs, plants),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildIdealRows(ColorScheme cs, List<Plant> plants) {
    final moistureMin = _avg(plants.map((p) => p.preferredMoistureMin));
    final moistureMax = _avg(plants.map((p) => p.preferredMoistureMax));
    final humidityMin = _avg(plants.map((p) => p.preferredHumidityMin));
    final humidityMax = _avg(plants.map((p) => p.preferredHumidityMax));
    final tempMin = _avg(plants.map((p) => p.preferredTemperatureMin));
    final tempMax = _avg(plants.map((p) => p.preferredTemperatureMax));
    final dominantLight = _dominantLight(plants);

    return [
      _idealRow(cs, 'Moisture', _rangeStr(moistureMin, moistureMax, '%')),
      const SizedBox(height: 10),
      _idealRow(cs, 'Humidity', _rangeStr(humidityMin, humidityMax, '%')),
      const SizedBox(height: 10),
      _idealRow(cs, 'Temperature', _rangeStr(tempMin, tempMax, '°C')),
      const SizedBox(height: 10),
      _idealRow(cs, 'Light', dominantLight != null ? _capitalize(dominantLight) : '--'),
    ];
  }

  double? _avg(Iterable<num?> values) {
    final valid = values.whereType<num>().toList();
    if (valid.isEmpty) return null;
    return valid.fold<double>(0, (sum, v) => sum + v.toDouble()) / valid.length;
  }

  String _rangeStr(double? min, double? max, String unit) {
    if (min == null && max == null) return '--';
    if (min != null && max != null) return '${min.toStringAsFixed(1)} – ${max.toStringAsFixed(1)}$unit';
    if (min != null) return '≥ ${min.toStringAsFixed(1)}$unit';
    return '≤ ${max!.toStringAsFixed(1)}$unit';
  }

  String? _dominantLight(List<Plant> plants) {
    final counts = <String, int>{};
    for (final p in plants) {
      if (p.preferredLightCondition != null) {
        counts[p.preferredLightCondition!] = (counts[p.preferredLightCondition!] ?? 0) + 1;
      }
    }
    if (counts.isEmpty) return null;
    return counts.entries.reduce((a, b) => a.value >= b.value ? a : b).key;
  }

  String _capitalize(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  Widget _idealRow(ColorScheme cs, String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55))),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildImagePreview() {
    final cs = Theme.of(context).colorScheme;
    return Container(
      height: 200,
      decoration: BoxDecoration(color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(18)),
      child: Center(child: Icon(Icons.camera_alt, size: 44, color: cs.onSurface.withValues(alpha: 0.38))),
    );
  }

  Widget _sensorValue(ColorScheme cs, String label, String value, {double? min, double? max}) {
    final numVal  = double.tryParse(value.replaceAll(RegExp(r'[^0-9.]'), ''));
    final hasRange = min != null && max != null;
    final inRange  = hasRange && numVal != null && numVal >= min && numVal <= max;
    final tooLow   = hasRange && numVal != null && numVal < min;

    final Color valueColor = !hasRange || numVal == null
        ? cs.onSurface
        : inRange  ? Colors.green.shade700
        : tooLow   ? Colors.orange.shade700
        : Colors.red.shade600;

    final IconData? icon = !hasRange || numVal == null
        ? null
        : inRange ? Icons.check_circle_outline
        : tooLow  ? Icons.arrow_downward
        : Icons.arrow_upward;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55))),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) Icon(icon, size: 16, color: valueColor),
            if (icon != null) const SizedBox(width: 4),
            Text(value, style: TextStyle(fontWeight: FontWeight.bold, color: valueColor)),
          ],
        ),
      ],
    );
  }
}
