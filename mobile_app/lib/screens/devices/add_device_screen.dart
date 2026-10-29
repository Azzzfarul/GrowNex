import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/device_model.dart';
import '../../services/firestore/device_service.dart';

class AddDeviceScreen extends StatefulWidget {
  const AddDeviceScreen({super.key});

  @override
  State<AddDeviceScreen> createState() => _AddDeviceScreenState();
}

class _AddDeviceScreenState extends State<AddDeviceScreen> {
  final _deviceIdCtrl = TextEditingController();
  late final Stream<List<Device>> _nearbyStream;
  Device? _foundDevice;
  bool _searching = false;
  String? _searchError;
  bool _claiming = false;
  String? _claimError;
  bool _showManual = false;
  bool _hasLightingModule = false;
  bool _hasFertilizerModule = false;

  @override
  void initState() {
    super.initState();
    _nearbyStream = DeviceService().watchUnclaimedDevices();
  }

  @override
  void dispose() {
    _deviceIdCtrl.dispose();
    super.dispose();
  }

  void _selectDevice(Device device) {
    setState(() {
      _foundDevice = device;
      _hasLightingModule = device.hasLightingModule;
      _hasFertilizerModule = device.hasFertilizerModule;
      _searchError = null;
      _claimError = null;
    });
  }

  Future<void> _search() async {
    final id = _deviceIdCtrl.text.trim();
    if (id.isEmpty) return;
    setState(() { _searching = true; _searchError = null; _claimError = null; _foundDevice = null; });
    try {
      final device = await DeviceService().getDevice(id);
      if (!mounted) return;
      if (device == null) {
        setState(() => _searchError = 'Device not found. Check the ID and try again.');
      } else {
        final currentUserId = FirebaseAuth.instance.currentUser?.uid ?? '';
        final alreadyClaimed = device.userId.isNotEmpty && device.userId != currentUserId;
        if (alreadyClaimed) {
          setState(() => _searchError = 'This device is already registered to another account.');
        } else {
          _selectDevice(device);
        }
      }
    } catch (e) {
      if (mounted) setState(() => _searchError = 'Search failed: $e');
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _claim() async {
    final device = _foundDevice;
    if (device == null) return;
    setState(() { _claiming = true; _claimError = null; });
    try {
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      await DeviceService().claimDevice(
        device.id, userId,
        hasLightingModule: _hasLightingModule,
        hasFertilizerModule: _hasFertilizerModule,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on DeviceClaimException catch (e) {
      if (mounted) setState(() => _claimError = e.message);
    } catch (e) {
      debugPrint('Failed to claim device ${device.id}: $e');
      if (mounted) setState(() => _claimError = 'Failed to claim device. Please try again.');
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Device'),
      ),
      body: StreamBuilder<List<Device>>(
        stream: _nearbyStream,
        builder: (context, snapshot) {
          final tt = Theme.of(context).textTheme;
          // If discovery fails, typing the ID is the only way left, so show it straight away.
          final showManual = _showManual || snapshot.hasError;
          // Keep the nearby list and the ID field one child each, so the field doesn't move
          // (and lose focus) when devices come and go.
          return ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Text(
                "Select a device that's powered on and connected, or enter its ID.",
                style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 16),
              _buildNearbyDevices(snapshot),
              _buildManualEntry(showManual),
              if (_searchError != null) ...[
                const SizedBox(height: 10),
                Text(_searchError!, style: tt.bodyMedium?.copyWith(color: cs.error)),
              ],
              if (_foundDevice != null) ...[
                const SizedBox(height: 16),
                _buildFoundCard(_foundDevice!),
                if (_claimError != null) ...[
                  const SizedBox(height: 10),
                  Text(_claimError!, style: tt.bodyMedium?.copyWith(color: cs.error)),
                ],
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _claiming ? null : _claim,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: _claiming
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Text('Claim device'),
                    ),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _buildNearbyDevices(AsyncSnapshot<List<Device>> snapshot) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final muted = cs.onSurfaceVariant;

    if (snapshot.hasError) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          "Couldn't search for devices. Enter the device ID instead.",
          style: tt.bodyMedium?.copyWith(color: cs.error),
        ),
      );
    }

    final devices = snapshot.data; // null until the first snapshot arrives
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'New devices nearby',
            style: tt.labelMedium?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 8),
          if (devices == null)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text('Searching…', style: tt.bodyMedium?.copyWith(color: muted)),
            )
          else if (devices.isEmpty)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: cs.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                'No new devices found. Power on your device and keep the server running — '
                'it appears here within a few seconds of connecting.',
                style: tt.bodyMedium?.copyWith(color: muted),
              ),
            )
          else
            ...devices.map(_buildNearbyTile),
        ],
      ),
    );
  }

  Widget _buildNearbyTile(Device device) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final selected = _foundDevice?.id == device.id;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: selected ? cs.secondaryContainer : cs.surfaceContainerLow,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: InkWell(
          onTap: () => _selectDevice(device),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                Icon(
                  device.isCamera ? Icons.camera_alt : Icons.developer_board,
                  color: cs.primary,
                  size: 22,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        device.deviceName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tt.titleSmall,
                      ),
                      const SizedBox(height: 2),
                      Text.rich(
                        TextSpan(
                          text: device.typeLabel,
                          children: [
                            // A new device is named after its ID; show the ID once it's renamed.
                            if (device.deviceName != device.id)
                              TextSpan(
                                text: ' · ${device.id}',
                                style: const TextStyle(fontFamily: 'monospace'),
                              ),
                          ],
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                CircleAvatar(radius: 3, backgroundColor: cs.primary),
                const SizedBox(width: 4),
                Text(
                  'Online',
                  style: tt.labelMedium?.copyWith(color: cs.primary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildManualEntry(bool showManual) {
    if (!showManual) {
      return Align(
        alignment: Alignment.centerLeft,
        child: TextButton(
          onPressed: () => setState(() => _showManual = true),
          style: TextButton.styleFrom(padding: EdgeInsets.zero),
          child: Text("Can't see your device? Enter its ID"),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _deviceIdCtrl,
              // Focus only when the user asked for the field, not when discovery failed.
              autofocus: _showManual,
              decoration: const InputDecoration(
                labelText: 'Device ID',
                hintText: 'e.g. ESP32-ABCD1234',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              onSubmitted: (_) => _search(),
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            height: 48,
            child: FilledButton(
              onPressed: _searching ? null : _search,
              child: _searching
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Find'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFoundCard(Device device) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final isOnline = device.status == 'online';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.secondaryContainer,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.primaryContainer),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.check_circle, color: cs.primary, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(device.deviceName,
                    style: tt.titleSmall),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              CircleAvatar(radius: 4, backgroundColor: isOnline ? cs.primary : cs.onSurfaceVariant),
              const SizedBox(width: 6),
              Text(
                '${device.typeLabel} · ${isOnline ? 'Online' : 'Offline'}',
                style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
              ),
            ],
          ),
          // Cameras have no relay modules.
          if (!device.isCamera) ...[
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 10),
            Text('Modules', style: tt.labelMedium?.copyWith(color: cs.onSurfaceVariant)),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(Icons.science_outlined, color: cs.primary, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text('Fertilizer module', style: tt.bodyMedium)),
                Switch(
                  value: _hasFertilizerModule,
                  onChanged: (v) => setState(() => _hasFertilizerModule = v),
                  activeTrackColor: cs.primary,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ],
            ),
            Row(
              children: [
                Icon(Icons.wb_sunny_outlined, color: cs.primary, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text('Light module', style: tt.bodyMedium)),
                Switch(
                  value: _hasLightingModule,
                  onChanged: (v) => setState(() => _hasLightingModule = v),
                  activeTrackColor: cs.primary,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }

}
