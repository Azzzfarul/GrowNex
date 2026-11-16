import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/device_model.dart';
import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/device_service.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../utils/plant_diagnosis.dart';
import '../../../widgets/status_label.dart';
import '../../../services/firestore/zone_service.dart';
import '../../../services/photo_service.dart';
import '../../../services/zone_member_service.dart';

// The boards belong to the owner's account: only they assign or unassign them (security rules too).
bool _ownsZone(Zone zone) => zone.userId == FirebaseAuth.instance.currentUser?.uid;

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

  Stream<Device?>? _assignedDeviceStream;  // live, so Online/Offline stays current
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
      _assignedDeviceStream = DeviceService().watchDevice(zone.deviceId!);
      _availableDevicesFuture = null;
    } else {
      _assignedDeviceStream = null;
      _dropdownKey++;
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      _availableDevicesFuture = DeviceService().getAvailableDevices(userId);
    }
  }

  Future<void> _assign() async {
    // Local copy: the zone write below fires the zone listener at once, and didUpdateWidget
    // then clears _selectedDevice before the device write runs.
    final device = _selectedDevice;
    if (device == null) return;
    setState(() => _assignLoading = true);
    try {
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      await ZoneService().updateZoneDevice(
        widget.zone.id,
        device.id,
        hasFertilizer: device.hasFertilizerModule,
        hasLight: device.hasLightingModule,
      );
      await DeviceService().assignDeviceToZone(device.id, widget.zone.id, userId);
    } catch (e) {
      debugPrint('Failed to assign device: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to assign device. Please try again.')));
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
      debugPrint('Failed to remove device: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove device. Please try again.')));
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
        const SizedBox(height: 20),
        _MembersCard(zone: widget.zone),
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
                style: TextButton.styleFrom(foregroundColor: cs.error),
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
        final tt = Theme.of(context).textTheme;
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
                          style: tt.labelSmall?.copyWith(color: Colors.white),
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
      debugPrint('Failed to upload photo: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload photo. Please try again.')));
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
      debugPrint('Failed to remove photo: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove photo. Please try again.')));
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
      debugPrint('Failed to rename: $e');
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to rename. Please try again.')));
    } finally {
      if (mounted) setState(() => _renameLoading = false);
    }
  }

  Widget _buildInfoCard() {
    final cs = Theme.of(context).colorScheme;
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(widget.zone.zoneType.toUpperCase(),
              style: TextStyle(color: cs.primary, fontWeight: FontWeight.w500)),
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
                      icon: Icon(Icons.check_circle_outline, color: cs.primary),
                      tooltip: 'Save name',
                      onPressed: _zoneNameCtrl.text.trim() == widget.zone.zoneName ? null : _renameZone,
                    ),
            ],
          ),
          const SizedBox(height: 10),
          StreamBuilder<List<Plant>>(
            stream: _plantsStream,
            builder: (context, snapshot) {
              final tt = Theme.of(context).textTheme;
              final count = snapshot.data?.length ?? 0;
              return Text(
                'Plants: $count',
                style: tt.bodyLarge,
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildDeviceCard() {
    final tt = Theme.of(context).textTheme;
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Device', style: tt.titleSmall),
          const SizedBox(height: 14),
          if (widget.zone.deviceId != null)
            _buildAssignedDevice()
          else if (!_ownsZone(widget.zone))
            Text('No sensor node yet. The zone owner assigns one.',
                style: tt.bodyMedium?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant))
          else
            _buildAssignDropdown(),
        ],
      ),
    );
  }

  Widget _buildAssignedDevice() {
    return StreamBuilder<Device?>(
      stream: _assignedDeviceStream,
      builder: (context, snapshot) {
        final tt = Theme.of(context).textTheme;
        final cs = Theme.of(context).colorScheme;
        final deviceName = snapshot.data?.deviceName ?? widget.zone.deviceId ?? '...';
        final isOnline = snapshot.data?.status == 'online';

        return Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(deviceName, style: tt.titleSmall),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      CircleAvatar(radius: 4, backgroundColor: isOnline ? cs.primary : cs.onSurfaceVariant),
                      const SizedBox(width: 6),
                      Text(
                        isOnline ? 'Online' : 'Offline',
                        style: tt.bodySmall?.copyWith(color: isOnline ? cs.primary : cs.onSurfaceVariant),
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
            if (!_ownsZone(widget.zone))
              const SizedBox.shrink()
            else if (_removeLoading)
              const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            else
              TextButton.icon(
                    onPressed: _remove,
                    icon: const Icon(Icons.link_off, size: 18),
                    label: const Text('Remove'),
                    style: TextButton.styleFrom(foregroundColor: cs.error),
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
        final tt = Theme.of(context).textTheme;
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final devices = snapshot.data ?? [];

        if (devices.isEmpty) {
          return Text(
            'No available devices. Claim a device first from the Devices screen.',
            style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
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
            FilledButton.icon(
              onPressed: (_selectedDevice == null || _assignLoading) ? null : _assign,
              icon: _assignLoading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.link, size: 18),
              label: const Text('Assign device'),
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
      debugPrint('Failed to assign camera: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to assign camera. Please try again.')));
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
      debugPrint('Failed to remove camera: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove camera. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Camera', style: tt.titleSmall),
          const SizedBox(height: 4),
          Text(
            'Uploads a photo to the Camera feed every 4 hours.',
            style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
          ),
          const SizedBox(height: 14),
          if (_cameraStream != null && widget.zone.visualStatus != null) ...[
            _buildVisualCheck(tt, cs),
            const SizedBox(height: 14),
          ],
          if (_cameraStream != null)
            _buildAssignedCamera()
          else if (!_ownsZone(widget.zone))
            Text('No camera yet. The zone owner assigns one.', style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant))
          else
            _buildAssignDropdown(cs),
        ],
      ),
    );
  }

  // The server's AI check of the latest camera photo (zones.visualStatus). Web: CameraCard.
  Widget _buildVisualCheck(TextTheme tt, ColorScheme cs) {
    final zone = widget.zone;
    final at = zone.visualCheckedAt;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: cs.surfaceContainerHighest, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              StatusLabel('Looks ${zone.visualStatus}', tone: conditionTone(zone.visualStatus)),
              if (at != null)
                Text('Camera check · ${TimeOfDay.fromDateTime(at.toLocal()).format(context)}, ${at.toLocal().day}/${at.toLocal().month}',
                    style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
            ],
          ),
          if ((zone.visualSummary ?? '').isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(zone.visualSummary!, style: tt.bodyMedium),
          ],
          const SizedBox(height: 4),
          Text('AI estimate from the latest camera photo.', style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        ],
      ),
    );
  }

  Widget _buildAssignedCamera() {
    return StreamBuilder<Device?>(
      stream: _cameraStream,
      builder: (context, snapshot) {
        final tt = Theme.of(context).textTheme;
        final cs = Theme.of(context).colorScheme;
        if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
          return const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2));
        }
        final camera = snapshot.data;
        if (camera == null) {
          return Text('Camera not found.', style: TextStyle(color: cs.error));
        }

        final isOnline = camera.status == 'online';
        final statusColor = isOnline ? cs.primary : cs.error;
        return Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(camera.deviceName, style: tt.titleSmall),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      CircleAvatar(radius: 4, backgroundColor: statusColor),
                      const SizedBox(width: 6),
                      Text(
                        isOnline ? 'Online' : 'Offline',
                        style: tt.bodySmall?.copyWith(color: statusColor),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            if (!_ownsZone(widget.zone))
              const SizedBox.shrink()
            else if (_busy)
              const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            else
              TextButton.icon(
                    onPressed: _remove,
                    icon: const Icon(Icons.link_off, size: 18),
                    label: const Text('Remove'),
                    style: TextButton.styleFrom(foregroundColor: cs.error),
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
        final tt = Theme.of(context).textTheme;
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final cameras = snapshot.data ?? [];
        if (cameras.isEmpty) {
          return Text(
            'No available cameras. Register your ESP32-CAM (ID starts with ESP32CAM-) from the Devices screen.',
            style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
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
            FilledButton.icon(
              onPressed: (_selectedCamera == null || _busy) ? null : _assign,
              icon: _busy
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.link, size: 18),
              label: const Text('Assign camera'),
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
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: cs.secondaryContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: cs.onSecondaryContainer),
          const SizedBox(width: 4),
          Text(label, style: tt.labelSmall?.copyWith(color: cs.primary)),
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
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: child,
      ),
    );
  }
}

// Who can use this zone. The owner adds people by email and removes them; a member can leave.
// Web: MembersCard in client/src/pages/zones/MembersCard.jsx.
class _MembersCard extends StatefulWidget {
  final Zone zone;

  const _MembersCard({required this.zone});

  @override
  State<_MembersCard> createState() => _MembersCardState();
}

class _MembersCardState extends State<_MembersCard> {
  final _emailCtrl = TextEditingController();
  String? _busy;  // 'add', or the uid being removed
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final email = _emailCtrl.text.trim();
    if (email.isEmpty) return;
    setState(() { _busy = 'add'; _error = null; });
    final error = await ZoneMemberService().addMember(widget.zone.id, email);
    if (!mounted) return;
    setState(() { _busy = null; _error = error; });
    if (error == null) _emailCtrl.clear();
  }

  Future<void> _remove(String uid) async {
    final me = FirebaseAuth.instance.currentUser?.uid;
    if (uid == me) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Leave zone?'),
          content: Text("You'll lose access to \"${widget.zone.zoneName}\" until the owner adds you again."),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            TextButton(
              onPressed: () => Navigator.pop(ctx, true),
              style: TextButton.styleFrom(foregroundColor: Theme.of(ctx).colorScheme.error),
              child: const Text('Leave'),
            ),
          ],
        ),
      );
      if (ok != true || !mounted) return;
    }
    setState(() { _busy = uid; _error = null; });
    final error = await ZoneMemberService().removeMember(widget.zone.id, uid);
    if (!mounted) return;
    setState(() { _busy = null; _error = error; });
    // Left: the zone screen switches to "not available" by itself; go back to the list.
    if (error == null && uid == me) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final zone = widget.zone;
    final me = FirebaseAuth.instance.currentUser;
    final isOwner = _ownsZone(zone);
    String emailOf(String uid) => zone.members[uid]?.isNotEmpty == true
        ? zone.members[uid]!
        : uid == me?.uid ? (me?.email ?? 'You') : 'Unknown user';

    return _SectionCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Members', style: tt.titleSmall),
          const SizedBox(height: 4),
          Text(
            isOwner
                ? 'People you add can see this zone, edit its plants and automation, and switch its pumps and light.'
                : 'Shared with you by the owner.',
            style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: tt.bodyMedium?.copyWith(color: cs.error)),
          ],
          const SizedBox(height: 8),
          for (final uid in zone.allMemberIds)
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Icon(uid == zone.userId ? Icons.admin_panel_settings_outlined : Icons.person_outline),
              title: Text(emailOf(uid), overflow: TextOverflow.ellipsis),
              subtitle: Text('${uid == zone.userId ? 'Owner' : 'Member'}${uid == me?.uid ? ' · You' : ''}'),
              trailing: _busy == uid
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : (isOwner && uid != zone.userId) || (!isOwner && uid == me?.uid)
                      ? TextButton(
                          onPressed: _busy == null ? () => _remove(uid) : null,
                          style: TextButton.styleFrom(foregroundColor: cs.error),
                          child: Text(isOwner ? 'Remove' : 'Leave'),
                        )
                      : null,
            ),
          if (isOwner) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    autocorrect: false,
                    decoration: const InputDecoration(labelText: 'Add by email', border: OutlineInputBorder(), isDense: true),
                    onSubmitted: (_) => _add(),
                  ),
                ),
                const SizedBox(width: 8),
                FilledButton.tonal(
                  onPressed: _busy == null ? _add : null,
                  child: Text(_busy == 'add' ? 'Adding…' : 'Add'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
