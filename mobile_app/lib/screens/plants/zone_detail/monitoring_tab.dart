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

  Widget _buildDeviceStatus() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Device status', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          if (_deviceStream == null)
            const Text('No device connected', style: TextStyle(fontSize: 16, color: Colors.black54))
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
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Latest readings', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 14),
          _sensorValue('Temperature', widget.zone.latestTemp != null ? '${widget.zone.latestTemp}°C' : '--'),
          const SizedBox(height: 10),
          _sensorValue('Humidity', widget.zone.latestHumid != null ? '${widget.zone.latestHumid}%' : '--'),
          const SizedBox(height: 10),
          _sensorValue('Light', widget.zone.latestLight != null ? '${widget.zone.latestLight} lx' : '--'),
          const SizedBox(height: 10),
          _sensorValue('Moisture', widget.zone.latestMoisture != null ? '${widget.zone.latestMoisture}%' : '--'),
        ],
      ),
    );
  }

  Widget _buildIdealConditions() {
    return StreamBuilder<List<Plant>>(
      stream: _plantsStream,
      builder: (context, snapshot) {
        final plants = snapshot.data ?? [];
        return Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
          ),
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
                style: const TextStyle(fontSize: 12, color: Colors.black45),
              ),
              const SizedBox(height: 14),
              if (plants.isEmpty)
                const Text('No plants yet', style: TextStyle(color: Colors.black38))
              else
                ..._buildIdealRows(plants),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _buildIdealRows(List<Plant> plants) {
    final moistureMin = _avg(plants.map((p) => p.preferredMoistureMin));
    final moistureMax = _avg(plants.map((p) => p.preferredMoistureMax));
    final humidityMin = _avg(plants.map((p) => p.preferredHumidityMin));
    final humidityMax = _avg(plants.map((p) => p.preferredHumidityMax));
    final tempMin = _avg(plants.map((p) => p.preferredTemperatureMin));
    final tempMax = _avg(plants.map((p) => p.preferredTemperatureMax));
    final dominantLight = _dominantLight(plants);

    return [
      _idealRow('Moisture', _rangeStr(moistureMin, moistureMax, '%')),
      const SizedBox(height: 10),
      _idealRow('Humidity', _rangeStr(humidityMin, humidityMax, '%')),
      const SizedBox(height: 10),
      _idealRow('Temperature', _rangeStr(tempMin, tempMax, '°C')),
      const SizedBox(height: 10),
      _idealRow('Light', dominantLight != null ? _capitalize(dominantLight) : '--'),
    ];
  }

  double? _avg(Iterable<num?> values) {
    final valid = values.whereType<num>().toList();
    if (valid.isEmpty) return null;
    return valid.fold<double>(0, (sum, v) => sum + v.toDouble()) / valid.length;
  }

  String _rangeStr(double? min, double? max, String unit) {
    if (min == null && max == null) return '--';
    if (min != null && max != null) {
      return '${min.toStringAsFixed(1)} – ${max.toStringAsFixed(1)}$unit';
    }
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

  Widget _idealRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildImagePreview() {
    return Container(
      height: 200,
      decoration: BoxDecoration(color: Colors.grey[200], borderRadius: BorderRadius.circular(18)),
      child: const Center(child: Icon(Icons.camera_alt, size: 44, color: Colors.black38)),
    );
  }

  Widget _sensorValue(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}
