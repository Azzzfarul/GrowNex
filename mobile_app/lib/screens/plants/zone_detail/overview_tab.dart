import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../../models/device_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/device_service.dart';
import '../../../services/firestore/zone_service.dart';

class OverviewTab extends StatefulWidget {
  final Zone zone;

  const OverviewTab({super.key, required this.zone});

  @override
  State<OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends State<OverviewTab> {
  Future<Device?>? _assignedDeviceFuture;
  bool _removeLoading = false;

  Device? _selectedDevice;
  Future<List<Device>>? _availableDevicesFuture;
  int _dropdownKey = 0;
  bool _assignLoading = false;

  @override
  void initState() {
    super.initState();
    _syncDeviceState(widget.zone);
  }

  @override
  void didUpdateWidget(OverviewTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zone.deviceId != widget.zone.deviceId) {
      setState(() {
        _selectedDevice = null;
        _syncDeviceState(widget.zone);
      });
    }
  }

  void _syncDeviceState(Zone zone) {
    if (zone.deviceId != null) {
      _assignedDeviceFuture = DeviceService().getDevice(zone.deviceId!);
      _availableDevicesFuture = null;
    } else {
      _assignedDeviceFuture = null;
      _dropdownKey++;
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      _availableDevicesFuture = DeviceService().getAvailableDevices(userId);
    }
  }

  Future<void> _assign() async {
    if (_selectedDevice == null) return;
    setState(() => _assignLoading = true);
    try {
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      await ZoneService().updateZoneDevice(
        widget.zone.id,
        _selectedDevice!.id,
        hasFertilizer: _selectedDevice!.hasFertilizerModule,
        hasLight: _selectedDevice!.hasLightingModule,
      );
      await DeviceService().assignDeviceToZone(_selectedDevice!.id, widget.zone.id, userId);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to assign device: $e')));
      }
    } finally {
      if (mounted) setState(() => _assignLoading = false);
    }
  }

  Future<void> _remove() async {
    final deviceId = widget.zone.deviceId;
    if (deviceId == null) return;
    setState(() => _removeLoading = true);
    try {
      await DeviceService().unassignDevice(deviceId);
      await ZoneService().updateZoneDevice(widget.zone.id, null);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove device: $e')));
      }
    } finally {
      if (mounted) setState(() => _removeLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _buildPhotoCard(),
        const SizedBox(height: 20),
        _buildInfoCard(),
        const SizedBox(height: 20),
        _buildDeviceCard(),
        const SizedBox(height: 20),
        _buildSensorCard(),
      ],
    );
  }

  Widget _buildPhotoCard() {
    final cs = Theme.of(context).colorScheme;
    return Container(
      height: 180,
      decoration: BoxDecoration(
        color: cs.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(18),
        image: widget.zone.zonePhotoUrl != null
            ? DecorationImage(image: NetworkImage(widget.zone.zonePhotoUrl!), fit: BoxFit.cover)
            : null,
      ),
      child: widget.zone.zonePhotoUrl == null
          ? Center(child: Icon(Icons.photo, size: 48, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)))
          : null,
    );
  }

  Widget _buildInfoCard() {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.zone.zoneType.toUpperCase(),
              style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text('Total plants: ${widget.zone.totalPlantSlots}', style: const TextStyle(fontSize: 16)),
        ],
      ),
    );
  }

  Widget _buildDeviceCard() {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Device', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 14),
          if (widget.zone.deviceId != null)
            _buildAssignedDevice()
          else
            _buildAssignDropdown(),
        ],
      ),
    );
  }

  Widget _buildAssignedDevice() {
    return FutureBuilder<Device?>(
      future: _assignedDeviceFuture,
      builder: (context, snapshot) {
        final deviceName = snapshot.data?.deviceName ?? widget.zone.deviceId ?? '...';
        final isOnline = snapshot.data?.status == 'online';

        return Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(deviceName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      CircleAvatar(radius: 4, backgroundColor: isOnline ? Colors.green[700] : Colors.grey),
                      const SizedBox(width: 6),
                      Text(
                        isOnline ? 'Online' : 'Offline',
                        style: TextStyle(fontSize: 12, color: isOnline ? Colors.green[700] : Colors.grey),
                      ),
                    ],
                  ),
                  if (widget.zone.hasFertilizer || widget.zone.hasLight) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      children: [
                        if (widget.zone.hasFertilizer)
                          _ModuleChip(label: 'Fertilizer', icon: Icons.grass),
                        if (widget.zone.hasLight)
                          _ModuleChip(label: 'Light', icon: Icons.wb_sunny),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            _removeLoading
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : TextButton.icon(
                    onPressed: _remove,
                    icon: const Icon(Icons.link_off, size: 18),
                    label: const Text('Remove'),
                    style: TextButton.styleFrom(foregroundColor: Colors.red[400]),
                  ),
          ],
        );
      },
    );
  }

  Widget _buildAssignDropdown() {
    final cs = Theme.of(context).colorScheme;
    return FutureBuilder<List<Device>>(
      future: _availableDevicesFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final devices = snapshot.data ?? [];

        if (devices.isEmpty) {
          return Text(
            'No available devices. Claim a device first from the Devices screen.',
            style: TextStyle(color: cs.onSurface.withValues(alpha: 0.45), fontSize: 13),
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<Device>(
              key: ValueKey(_dropdownKey),
              initialValue: _selectedDevice,
              decoration: const InputDecoration(
                labelText: 'Select device',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: devices
                  .map((d) => DropdownMenuItem(
                        value: d,
                        child: Text(d.deviceName),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _selectedDevice = v),
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              onPressed: (_selectedDevice == null || _assignLoading) ? null : _assign,
              icon: _assignLoading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.link, size: 18),
              label: const Text('Assign device'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green[700],
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildSensorCard() {
    final cs = Theme.of(context).colorScheme;
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Latest sensor readings', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 14),
          _sensorRow(cs, 'Temperature', widget.zone.latestTemp != null ? '${widget.zone.latestTemp}°C' : '--'),
          const SizedBox(height: 12),
          _sensorRow(cs, 'Humidity', widget.zone.latestHumid != null ? '${widget.zone.latestHumid}%' : '--'),
          const SizedBox(height: 12),
          _sensorRow(cs, 'Light', widget.zone.latestLight != null ? '${widget.zone.latestLight} lx' : '--'),
          const SizedBox(height: 12),
          _sensorRow(cs, 'Moisture', widget.zone.latestMoisture != null ? '${widget.zone.latestMoisture}%' : '--'),
        ],
      ),
    );
  }

  Widget _sensorRow(ColorScheme cs, String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55))),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}

class _ModuleChip extends StatelessWidget {
  final String label;
  final IconData icon;

  const _ModuleChip({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.green.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: Colors.green[700]),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 11, color: Colors.green[700], fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final Widget child;

  const _SectionCard({required this.child});

  @override
  Widget build(BuildContext context) {
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
}
