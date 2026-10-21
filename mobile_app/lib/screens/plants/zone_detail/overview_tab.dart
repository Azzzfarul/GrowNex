import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/device_model.dart';
import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/device_service.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../services/firestore/zone_service.dart';
import '../../../services/photo_service.dart';

class OverviewTab extends StatefulWidget {
  final Zone zone;

  const OverviewTab({super.key, required this.zone});

  @override
  State<OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends State<OverviewTab> {
  late final TextEditingController _zoneNameCtrl;
  bool _renameLoading = false;
  late final Stream<List<Plant>> _plantsStream;
  late final Stream<QuerySnapshot<Map<String, dynamic>>> _latestSnapshotStream;
  late String? _photoUrl;
  bool _photoBusy = false;

  Future<Device?>? _assignedDeviceFuture;
  bool _removeLoading = false;

  Device? _selectedDevice;
  Future<List<Device>>? _availableDevicesFuture;
  int _dropdownKey = 0;
  bool _assignLoading = false;

  @override
  void initState() {
    super.initState();
    _zoneNameCtrl = TextEditingController(text: widget.zone.zoneName);
    _plantsStream = PlantService().watchPlantsByZone(widget.zone.id);
    // Newest camera-feed photo (ESP32-CAM or manual), shown in the banner when there's no zone photo
    _latestSnapshotStream = FirebaseFirestore.instance
        .collection('zones')
        .doc(widget.zone.id)
        .collection('snapshots')
        .orderBy('capturedAt', descending: true)
        .limit(1)
        .snapshots();
    _photoUrl = widget.zone.zonePhotoUrl;
    _syncDeviceState(widget.zone);
  }

  @override
  void dispose() {
    _zoneNameCtrl.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(OverviewTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zone.zoneName != widget.zone.zoneName) {
      _zoneNameCtrl.text = widget.zone.zoneName;
    }
    if (oldWidget.zone.zonePhotoUrl != widget.zone.zonePhotoUrl) {
      _photoUrl = widget.zone.zonePhotoUrl;
    }
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
        totalPlantSlots: _selectedDevice!.totalSlots,
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
        _CameraCard(zone: widget.zone),
      ],
    );
  }

  Widget _buildPhotoCard() {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Stack(
          children: [
            Container(
              height: 180,
              width: double.infinity,
              decoration: BoxDecoration(
                color: cs.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(18),
              ),
              clipBehavior: Clip.antiAlias,
              child: _photoUrl != null
                  ? Image.network(_photoUrl!, fit: BoxFit.contain)
                  : _buildLatestSnapshot(cs),
            ),
            if (_photoBusy)
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Center(child: CircularProgressIndicator(color: Colors.white)),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            TextButton(
              onPressed: _photoBusy ? null : _pickZonePhoto,
              child: Text(_photoUrl != null ? 'Change photo' : 'Add photo'),
            ),
            if (_photoUrl != null)
              TextButton(
                onPressed: _photoBusy ? null : _removeZonePhoto,
                style: TextButton.styleFrom(foregroundColor: Colors.red[400]),
                child: const Text('Remove'),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildLatestSnapshot(ColorScheme cs) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: _latestSnapshotStream,
      builder: (context, snapshot) {
        final docs = snapshot.data?.docs ?? [];
        final data = docs.isEmpty ? null : docs.first.data();
        final imageUrl = data?['imageUrl'] as String?;
        if (imageUrl == null) {
          return Center(child: Icon(Icons.photo, size: 48, color: cs.onSurface.withValues(alpha: 0.38)));
        }

        final capturedAtValue = data?['capturedAt'];
        final capturedAt = capturedAtValue is Timestamp ? capturedAtValue.toDate() : null;
        return Stack(
          fit: StackFit.expand,
          children: [
            Image.network(imageUrl, fit: BoxFit.contain),
            Positioned(
              left: 8,
              right: 8,
              bottom: 8,
              child: Align(
                alignment: Alignment.centerLeft,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.camera_alt, size: 12, color: Colors.white),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          capturedAt != null
                              ? 'Latest camera photo · ${_formatDateTime(context, capturedAt)}'
                              : 'Latest camera photo',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 11, color: Colors.white, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  String _formatDateTime(BuildContext context, DateTime dt) {
    final loc = MaterialLocalizations.of(context);
    final time = loc.formatTimeOfDay(
      TimeOfDay.fromDateTime(dt),
      alwaysUse24HourFormat: MediaQuery.of(context).alwaysUse24HourFormat,
    );
    return '${loc.formatShortDate(dt)}, $time';
  }

  Future<void> _pickZonePhoto() async {
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

    setState(() => _photoBusy = true);
    try {
      final url = await PhotoService().uploadZonePhoto(widget.zone.id, file);
      if (mounted) setState(() => _photoUrl = url);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload photo: $e')));
      }
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _removeZonePhoto() async {
    setState(() => _photoBusy = true);
    try {
      await PhotoService().removeZonePhoto(widget.zone.id);
      if (mounted) setState(() => _photoUrl = null);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove photo: $e')));
      }
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _renameZone() async {
    final name = _zoneNameCtrl.text.trim();
    if (name.isEmpty || name == widget.zone.zoneName) return;
    setState(() => _renameLoading = true);
    try {
      await FirebaseFirestore.instance.collection('zones').doc(widget.zone.id).update({'zoneName': name});
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to rename: $e')));
    } finally {
      if (mounted) setState(() => _renameLoading = false);
    }
  }

  Widget _buildInfoCard() {
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.zone.zoneType.toUpperCase(),
              style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _zoneNameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Zone name',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
              ),
              const SizedBox(width: 10),
              _renameLoading
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : IconButton(
                      icon: const Icon(Icons.check_circle_outline, color: Colors.green),
                      tooltip: 'Save name',
                      onPressed: _zoneNameCtrl.text.trim() == widget.zone.zoneName ? null : _renameZone,
                    ),
            ],
          ),
          const SizedBox(height: 10),
          StreamBuilder<List<Plant>>(
            stream: _plantsStream,
            builder: (context, snapshot) {
              final count = snapshot.data?.length ?? 0;
              return Text(
                'Plants: $count of ${widget.zone.totalPlantSlots}',
                style: const TextStyle(fontSize: 16),
              );
            },
          ),
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

}

// ESP32-CAM node (firmware_cam/) that auto-uploads the zone's camera feed. Linked via
// zones.cameraDeviceId ⇄ devices.assignedZoneId, separate from the sensor node's zones.deviceId.
class _CameraCard extends StatefulWidget {
  final Zone zone;

  const _CameraCard({required this.zone});

  @override
  State<_CameraCard> createState() => _CameraCardState();
}

class _CameraCardState extends State<_CameraCard> {
  Stream<Device?>? _cameraStream;
  Future<List<Device>>? _availableCamerasFuture;
  Device? _selectedCamera;
  int _dropdownKey = 0;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _syncCameraState();
  }

  @override
  void didUpdateWidget(_CameraCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zone.cameraDeviceId != widget.zone.cameraDeviceId) {
      _selectedCamera = null;
      _syncCameraState();
    }
  }

  void _syncCameraState() {
    final cameraId = widget.zone.cameraDeviceId;
    if (cameraId != null) {
      _cameraStream = DeviceService().watchDevice(cameraId);
      _availableCamerasFuture = null;
    } else {
      _cameraStream = null;
      _dropdownKey++;
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      _availableCamerasFuture = DeviceService().getAvailableCameras(userId);
    }
  }

  Future<void> _assign() async {
    final camera = _selectedCamera;
    if (camera == null) return;
    setState(() => _busy = true);
    try {
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      await ZoneService().updateZoneCamera(widget.zone.id, camera.id);
      await DeviceService().assignDeviceToZone(camera.id, widget.zone.id, userId);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to assign camera: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    final cameraId = widget.zone.cameraDeviceId;
    if (cameraId == null) return;
    setState(() => _busy = true);
    try {
      await DeviceService().unassignDevice(cameraId);
      await ZoneService().updateZoneCamera(widget.zone.id, null);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove camera: $e')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Camera', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            'Uploads a photo to the Camera feed every 4 hours.',
            style: TextStyle(fontSize: 12, color: cs.onSurface.withValues(alpha: 0.45)),
          ),
          const SizedBox(height: 14),
          if (_cameraStream != null)
            _buildAssignedCamera()
          else
            _buildAssignDropdown(cs),
        ],
      ),
    );
  }

  Widget _buildAssignedCamera() {
    return StreamBuilder<Device?>(
      stream: _cameraStream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
          return const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2));
        }
        final camera = snapshot.data;
        if (camera == null) {
          return Text('Camera not found.', style: TextStyle(color: Colors.red[400]));
        }

        final isOnline = camera.status == 'online';
        final statusColor = isOnline ? Colors.green[700] : Colors.red[400];
        return Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(camera.deviceName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      CircleAvatar(radius: 4, backgroundColor: statusColor),
                      const SizedBox(width: 6),
                      Text(
                        isOnline ? 'Online' : 'Offline',
                        style: TextStyle(fontSize: 12, color: statusColor),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            _busy
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

  Widget _buildAssignDropdown(ColorScheme cs) {
    return FutureBuilder<List<Device>>(
      future: _availableCamerasFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final cameras = snapshot.data ?? [];
        if (cameras.isEmpty) {
          return Text(
            'No available cameras. Register your ESP32-CAM (ID starts with ESP32CAM-) from the Devices screen.',
            style: TextStyle(color: cs.onSurface.withValues(alpha: 0.45), fontSize: 13),
          );
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<Device>(
              key: ValueKey(_dropdownKey),
              initialValue: _selectedCamera,
              decoration: const InputDecoration(
                labelText: 'Select camera',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              items: cameras
                  .map((d) => DropdownMenuItem(
                        value: d,
                        child: Text(d.deviceName),
                      ))
                  .toList(),
              onChanged: (v) => setState(() => _selectedCamera = v),
            ),
            const SizedBox(height: 10),
            ElevatedButton.icon(
              onPressed: (_selectedCamera == null || _busy) ? null : _assign,
              icon: _busy
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.link, size: 18),
              label: const Text('Assign camera'),
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
