import 'dart:async';

import 'package:flutter/material.dart';

import '../../models/device_model.dart';
import '../../models/plant_model.dart';
import '../../models/zone_model.dart';
import '../../services/firestore/device_service.dart';
import '../../services/firestore/plant_service.dart';
import '../../services/firestore/zone_service.dart';

class DeviceDetailScreen extends StatefulWidget {
  final Device device;

  const DeviceDetailScreen({super.key, required this.device});

  @override
  State<DeviceDetailScreen> createState() => _DeviceDetailScreenState();
}

class _DeviceDetailScreenState extends State<DeviceDetailScreen> {
  late final TextEditingController _nameCtrl;
  late bool _hasLightingModule;
  late bool _hasFertilizerModule;
  bool _loading = false;

  // Live copy of the device doc, so connection status, last sync/photo and the zone stay
  // current while the screen is open. The editable fields above are only seeded once.
  late Device _device;
  StreamSubscription<Device?>? _deviceSub;
  bool _deviceMissing = false;
  bool _deleting = false;

  late Future<({Zone? zone, List<Plant> plants})> _zoneFuture;

  @override
  void initState() {
    super.initState();
    _device = widget.device;
    _nameCtrl = TextEditingController(text: _device.deviceName);
    _hasLightingModule = _device.hasLightingModule;
    _hasFertilizerModule = _device.hasFertilizerModule;
    _zoneFuture = _loadZoneInfo(_device.assignedZoneId);
    _deviceSub = DeviceService().watchDevice(_device.id).listen(
      (device) {
        if (!mounted || _deleting) return;
        setState(() {
          if (device == null) {
            _deviceMissing = true;
            return;
          }
          if (device.assignedZoneId != _device.assignedZoneId) {
            _zoneFuture = _loadZoneInfo(device.assignedZoneId);
          }
          _device = device;
          _deviceMissing = false;
        });
      },
      onError: (Object e) => debugPrint('Device ${_device.id} listener failed: $e'),
    );
  }

  @override
  void dispose() {
    _deviceSub?.cancel();
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<({Zone? zone, List<Plant> plants})> _loadZoneInfo(String? zoneId) async {
    if (zoneId == null || zoneId.isEmpty) return (zone: null, plants: <Plant>[]);
    final zone = await ZoneService().getZone(zoneId);
    // Cameras don't use plant slots.
    final plants = zone != null && !widget.device.isCamera
        ? await PlantService().getPlantsByZone(zone.id)
        : <Plant>[];
    return (zone: zone, plants: plants);
  }

  Future<void> _confirmDelete() async {
    final cs = Theme.of(context).colorScheme;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete device?'),
        content: Text(
          'This will permanently remove "${_device.deviceName}". '
          'If it is assigned to a zone, it will be unassigned first.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: cs.error),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    // Stops the listener swapping in "Device not found." while this screen closes.
    _deleting = true;
    try {
      await DeviceService().deleteDevice(
        _device.id,
        assignedZoneId: _device.assignedZoneId,
        isCamera: _device.isCamera,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      _deleting = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete device: $e')),
        );
      }
    }
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      await DeviceService().updateDeviceInfo(
        _device.id,
        deviceName: _nameCtrl.text.trim(),
        hasLightingModule: _hasLightingModule,
        hasFertilizerModule: _hasFertilizerModule,
        assignedZoneId: _device.assignedZoneId,
        isCamera: _device.isCamera,
      );
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Device updated.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to save: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _sensorAvailable {
    final lastSync = _device.lastSync;
    if (lastSync == null) return false;
    return DateTime.now().difference(lastSync) <= const Duration(minutes: 10);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    if (_deviceMissing) {
      return Scaffold(
        appBar: AppBar(),
        body: const Center(child: Text('Device not found.')),
      );
    }

    final device = _device;
    final isCamera = device.isCamera;
    final isOnline = device.status == 'online';

    return Scaffold(
      appBar: AppBar(
        title: Text(device.deviceName),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Delete device',
            onPressed: _confirmDelete,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildSection(
            title: 'Device info',
            child: Column(
              children: [
                _buildField('Device name', _nameCtrl),
                const SizedBox(height: 14),
                if (isCamera)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.camera_alt_outlined, color: cs.primary, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          "Camera node — uploads a photo to its zone's Camera feed every 4 hours.",
                          style: TextStyle(color: cs.onSurfaceVariant),
                        ),
                      ),
                    ],
                  )
                else ...[
                  _buildModuleToggle(
                    icon: Icons.wb_sunny_outlined,
                    label: 'Light module',
                    value: _hasLightingModule,
                    onChanged: (v) => setState(() => _hasLightingModule = v),
                  ),
                  const SizedBox(height: 10),
                  _buildModuleToggle(
                    icon: Icons.science_outlined,
                    label: 'Fertilizer module',
                    value: _hasFertilizerModule,
                    onChanged: (v) => setState(() => _hasFertilizerModule = v),
                  ),
                  const SizedBox(height: 10),
                  _buildReadOnlyRow(
                    icon: Icons.camera_alt_outlined,
                    label: 'Camera module',
                    trailing: Text('Built-in', style: TextStyle(color: cs.primary, fontWeight: FontWeight.w600)),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          FutureBuilder<({Zone? zone, List<Plant> plants})>(
            future: _zoneFuture,
            builder: (context, snapshot) {
              final zone = snapshot.data?.zone;
              final plants = snapshot.data?.plants ?? [];
              final slotsLeft = device.totalSlots - plants.length;

              return _buildSection(
                title: 'Zone assignment',
                child: Column(
                  children: [
                    _buildInfoRow('Assigned zone', zone?.zoneName ?? 'Not assigned'),
                    if (!isCamera) ...[
                      const SizedBox(height: 10),
                      _buildInfoRow(
                        'Plant slots',
                        snapshot.connectionState == ConnectionState.waiting
                            ? '...'
                            : '${plants.length} used · ${slotsLeft.clamp(0, device.totalSlots)} left (of ${device.totalSlots})',
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          _buildSection(
            title: isCamera ? 'Camera status' : 'Sensor status',
            child: Column(
              children: [
                // A camera only syncs when it sends a photo (every 4 h), so show its
                // connection instead of the 10-minute sensor availability.
                if (isCamera)
                  _buildInfoRow(
                    'Connection',
                    isOnline ? 'Online' : 'Offline',
                    valueColor: isOnline ? cs.primary : cs.error,
                  )
                else
                  _buildInfoRow(
                    'Availability',
                    _sensorAvailable ? 'Available' : 'Unavailable',
                    valueColor: _sensorAvailable ? cs.primary : cs.error,
                  ),
                const SizedBox(height: 10),
                _buildInfoRow(
                  isCamera ? 'Last photo' : 'Last sync',
                  device.lastSync != null
                      ? _formatLastSync(device.lastSync!)
                      : 'Never',
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _loading ? null : _save,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Save changes'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection({required String title, required Widget child}) {
    final tt = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
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

  Widget _buildField(String label, TextEditingController controller) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
        const SizedBox(height: 6),
        TextField(controller: controller, decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true)),
      ],
    );
  }

  Widget _buildModuleToggle({required IconData icon, required String label, required bool value, required ValueChanged<bool> onChanged}) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(icon, color: cs.primary, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(label)),
        Switch(value: value, onChanged: onChanged),
      ],
    );
  }

  Widget _buildReadOnlyRow({required IconData icon, required String label, required Widget trailing}) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(icon, color: cs.primary, size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(label)),
        trailing,
      ],
    );
  }

  Widget _buildInfoRow(String label, String value, {Color? valueColor}) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: cs.onSurfaceVariant)),
        Text(value, style: TextStyle(fontWeight: FontWeight.w600, color: valueColor)),
      ],
    );
  }

  String _formatLastSync(DateTime lastSync) {
    final diff = DateTime.now().difference(lastSync);
    if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
