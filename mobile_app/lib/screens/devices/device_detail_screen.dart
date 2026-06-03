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

  late final Future<({Zone? zone, List<Plant> plants})> _zoneFuture;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.device.deviceName);
    _hasLightingModule = widget.device.hasLightingModule;
    _hasFertilizerModule = widget.device.hasFertilizerModule;
    _zoneFuture = _loadZoneInfo();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<({Zone? zone, List<Plant> plants})> _loadZoneInfo() async {
    if (widget.device.assignedZoneId == null) return (zone: null, plants: <Plant>[]);
    final zone = await ZoneService().getZone(widget.device.assignedZoneId!);
    final plants = zone != null ? await PlantService().getPlantsByZone(zone.id) : <Plant>[];
    return (zone: zone, plants: plants);
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      final updated = Device(
        id: widget.device.id,
        userId: widget.device.userId,
        assignedZoneId: widget.device.assignedZoneId,
        deviceName: _nameCtrl.text.trim(),
        deviceType: widget.device.deviceType,
        status: widget.device.status,
        hasLightingModule: _hasLightingModule,
        hasFertilizerModule: _hasFertilizerModule,
        lastSync: widget.device.lastSync,
      );
      await DeviceService().updateDevice(updated);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Device updated.')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to save: $e')));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  bool get _sensorAvailable {
    final lastSync = widget.device.lastSync;
    if (lastSync == null) return false;
    return DateTime.now().difference(lastSync) <= const Duration(minutes: 10);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.device.deviceName),
        backgroundColor: Colors.green[700],
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
                  trailing: const Text('Built-in', style: TextStyle(color: Colors.green, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FutureBuilder<({Zone? zone, List<Plant> plants})>(
            future: _zoneFuture,
            builder: (context, snapshot) {
              final zone = snapshot.data?.zone;
              final plants = snapshot.data?.plants ?? [];
              final slotsLeft = widget.device.totalSlots - plants.length;

              return _buildSection(
                title: 'Zone assignment',
                child: Column(
                  children: [
                    _buildInfoRow('Assigned zone', zone?.zoneName ?? 'Not assigned'),
                    const SizedBox(height: 10),
                    _buildInfoRow(
                      'Plant slots',
                      snapshot.connectionState == ConnectionState.waiting
                          ? '...'
                          : '${plants.length} used · ${slotsLeft.clamp(0, widget.device.totalSlots)} left (of ${widget.device.totalSlots})',
                    ),
                  ],
                ),
              );
            },
          ),
          const SizedBox(height: 16),
          _buildSection(
            title: 'Sensor status',
            child: Column(
              children: [
                _buildInfoRow(
                  'Availability',
                  _sensorAvailable ? 'Available' : 'Unavailable',
                  valueColor: _sensorAvailable ? Colors.green[700] : Colors.red[400],
                ),
                const SizedBox(height: 10),
                _buildInfoRow(
                  'Last sync',
                  widget.device.lastSync != null
                      ? _formatLastSync(widget.device.lastSync!)
                      : 'Never',
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _loading ? null : _save,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green[700],
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Save changes'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection({required String title, required Widget child}) {
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
          Text(title, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }

  Widget _buildField(String label, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54, fontSize: 13)),
        const SizedBox(height: 6),
        TextField(controller: controller, decoration: const InputDecoration(border: OutlineInputBorder(), isDense: true)),
      ],
    );
  }

  Widget _buildModuleToggle({required IconData icon, required String label, required bool value, required ValueChanged<bool> onChanged}) {
    return Row(
      children: [
        Icon(icon, color: Colors.green[700], size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(label)),
        Switch(value: value, onChanged: onChanged, activeThumbColor: Colors.green[700]),
      ],
    );
  }

  Widget _buildReadOnlyRow({required IconData icon, required String label, required Widget trailing}) {
    return Row(
      children: [
        Icon(icon, color: Colors.green[700], size: 20),
        const SizedBox(width: 10),
        Expanded(child: Text(label)),
        trailing,
      ],
    );
  }

  Widget _buildInfoRow(String label, String value, {Color? valueColor}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54)),
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
