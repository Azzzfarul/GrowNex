import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/device_model.dart';
import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/device_service.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../services/photo_service.dart';
import '../../../theme.dart';

class MonitoringTab extends StatefulWidget {
  final Zone zone;

  const MonitoringTab({super.key, required this.zone});

  @override
  State<MonitoringTab> createState() => _MonitoringTabState();
}

class _MonitoringTabState extends State<MonitoringTab> {
  Stream<Device?>? _deviceStream;
  Stream<Device?>? _cameraStream;
  late final Stream<List<Plant>> _plantsStream;
  late final Stream<QuerySnapshot<Map<String, dynamic>>> _snapshotsStream;
  bool _uploadingSnapshot = false;

  @override
  void initState() {
    super.initState();
    _plantsStream = PlantService().watchPlantsByZone(widget.zone.id);
    _snapshotsStream = FirebaseFirestore.instance
        .collection('zones')
        .doc(widget.zone.id)
        .collection('snapshots')
        .orderBy('capturedAt', descending: true)
        .limit(12)
        .snapshots();
    _syncStream(widget.zone.deviceId);
    _syncCameraStream(widget.zone.cameraDeviceId);
  }

  @override
  void didUpdateWidget(MonitoringTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zone.deviceId != widget.zone.deviceId) {
      _syncStream(widget.zone.deviceId);
    }
    if (oldWidget.zone.cameraDeviceId != widget.zone.cameraDeviceId) {
      _syncCameraStream(widget.zone.cameraDeviceId);
    }
  }

  // No setState needed: called from initState / didUpdateWidget, which are always followed by build.
  void _syncCameraStream(String? cameraId) {
    _cameraStream = cameraId != null ? DeviceService().watchDevice(cameraId) : null;
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: child,
      ),
    );
  }

  Widget _buildDeviceStatus() {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Device status', style: tt.titleMedium),
          const SizedBox(height: 12),
          if (_deviceStream == null)
            Text('No device connected',
                style: tt.bodyLarge?.copyWith(color: cs.onSurfaceVariant))
          else
            StreamBuilder<Device?>(
              stream: _deviceStream,
              builder: (context, snapshot) {
                final tt = Theme.of(context).textTheme;
                final device = snapshot.data;
                if (snapshot.connectionState == ConnectionState.waiting && device == null) {
                  return SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2));
                }
                if (device == null) {
                  return Text('Device not found', style: TextStyle(color: cs.error));
                }

                final isOnline = device.status == 'online';
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(device.deviceName, style: tt.titleMedium),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        CircleAvatar(radius: 5, backgroundColor: isOnline ? cs.primary : cs.error),
                        const SizedBox(width: 8),
                        Text(
                          isOnline ? 'Online' : 'Offline',
                          style: TextStyle(
                            color: isOnline ? cs.primary : cs.error,
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
        final tt = Theme.of(context).textTheme;
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
              Text('Latest readings', style: tt.titleMedium),
              const SizedBox(height: 14),
              if (_deviceStream != null)
                StreamBuilder<Device?>(
                  stream: _deviceStream,
                  builder: (context, deviceSnap) {
                    final app = AppColors.of(context);
                    final tt = Theme.of(context).textTheme;
                    final device = deviceSnap.data;
                    final isOffline = device != null && device.status != 'online';
                    if (!isOffline) return const SizedBox.shrink();
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        decoration: BoxDecoration(
                          color: app.warningContainer,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.warning_amber_rounded, size: 16, color: app.onWarningContainer),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Device is offline — readings may be outdated.',
                                style: tt.labelMedium?.copyWith(color: app.onWarningContainer),
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
              _sensorValue(cs, 'Light',       widget.zone.latestLight   != null ? '${widget.zone.latestLight}%' : '--'),
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
        final tt = Theme.of(context).textTheme;
        final plants = snapshot.data ?? [];
        return _card(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(Icons.eco, color: cs.primary, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text('Ideal zone conditions', style: tt.titleMedium),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                plants.isEmpty
                    ? 'Add plants with preferred conditions to see computed ideals.'
                    : 'Averaged from ${plants.length} plant${plants.length == 1 ? '' : 's'} in this zone. Edit at the plant level.',
                style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
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
    return valid.fold<double>(0, (total, v) => total + v.toDouble()) / valid.length;
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
        Text(label, style: TextStyle(color: cs.onSurfaceVariant)),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
      ],
    );
  }

  Widget _buildImagePreview() {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Camera feed', style: tt.titleMedium),
                    const SizedBox(height: 2),
                    Text('Last 48 hours · one photo per 4-hour window', style: tt.labelSmall),
                    if (_cameraStream != null)
                      StreamBuilder<Device?>(
                        stream: _cameraStream,
                        builder: (context, snapshot) {
                          final tt = Theme.of(context).textTheme;
                          final camera = snapshot.data;
                          if (camera == null) return const SizedBox.shrink();
                          final isOnline = camera.status == 'online';
                          return Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text.rich(
                              TextSpan(
                                text: 'Auto-captured by ${camera.deviceName} · ',
                                children: [
                                  TextSpan(
                                    text: isOnline ? 'Online' : 'Offline',
                                    style: TextStyle(color: isOnline ? cs.primary : cs.error),
                                  ),
                                ],
                              ),
                              style: tt.labelSmall,
                            ),
                          );
                        },
                      ),
                  ],
                ),
              ),
              TextButton(
                onPressed: _uploadingSnapshot ? null : _pickZoneSnapshot,
                child: Text(_uploadingSnapshot ? 'Uploading…' : '+ Add photo'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: _snapshotsStream,
            builder: (context, snapshot) {
              final tt = Theme.of(context).textTheme;
              final docs = snapshot.data?.docs ?? [];
              if (docs.isEmpty) {
                return SizedBox(
                  height: 96,
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.camera_alt, size: 36, color: cs.onSurface.withValues(alpha: 0.28)),
                        const SizedBox(height: 6),
                        Text('No photos yet', style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
                      ],
                    ),
                  ),
                );
              }
              return SizedBox(
                height: 96,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: docs.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final imageUrl = docs[i].data()['imageUrl'] as String?;
                    return GestureDetector(
                      onTap: () => imageUrl != null ? _showFullImage(imageUrl) : null,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: imageUrl != null
                            ? Image.network(imageUrl, width: 96, height: 96, fit: BoxFit.contain)
                            : Container(width: 96, height: 96, color: cs.surfaceContainerHigh),
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  void _showFullImage(String imageUrl) {
    showDialog(
      context: context,
      builder: (_) => Dialog(
        backgroundColor: Colors.transparent,
        child: InteractiveViewer(child: Image.network(imageUrl)),
      ),
    );
  }

  Future<void> _pickZoneSnapshot() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    final file = await ImagePicker().pickImage(source: source, maxWidth: 1280, imageQuality: 80);
    if (file == null || !mounted) return;

    setState(() => _uploadingSnapshot = true);
    try {
      await PhotoService().uploadZoneSnapshot(widget.zone.id, file);
    } catch (e) {
      debugPrint('Failed to upload photo: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload photo. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _uploadingSnapshot = false);
    }
  }

  Widget _sensorValue(ColorScheme cs, String label, String value, {double? min, double? max}) {
    final app = AppColors.of(context);
    final numVal  = double.tryParse(value.replaceAll(RegExp(r'[^0-9.]'), ''));
    final hasRange = min != null && max != null;
    final inRange  = hasRange && numVal != null && numVal >= min && numVal <= max;
    final tooLow   = hasRange && numVal != null && numVal < min;

    final Color valueColor = !hasRange || numVal == null
        ? cs.onSurface
        : inRange  ? cs.primary
        : tooLow   ? app.warning
        : cs.error;

    final IconData? icon = !hasRange || numVal == null
        ? null
        : inRange ? Icons.check_circle_outline
        : tooLow  ? Icons.arrow_downward
        : Icons.arrow_upward;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: cs.onSurfaceVariant)),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) Icon(icon, size: 16, color: valueColor),
            if (icon != null) const SizedBox(width: 4),
            Text(value, style: TextStyle(fontWeight: FontWeight.w500, color: valueColor)),
          ],
        ),
      ],
    );
  }
}
