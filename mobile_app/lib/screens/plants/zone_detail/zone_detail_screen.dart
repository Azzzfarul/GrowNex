import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';
import '../../../services/firestore/device_service.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../services/firestore/zone_service.dart';
import '../../../services/photo_service.dart';
import '../../../widgets/status_label.dart';
import 'automation_tab.dart';
import 'monitoring_tab.dart';
import 'overview_tab.dart';
import 'plants_tab.dart';

class ZoneDetailScreen extends StatefulWidget {
  final String zoneId;

  const ZoneDetailScreen({super.key, required this.zoneId});

  @override
  State<ZoneDetailScreen> createState() => _ZoneDetailScreenState();
}

class _ZoneDetailScreenState extends State<ZoneDetailScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  late final Stream<Zone?> _zoneStream;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _zoneStream = ZoneService().watchZone(widget.zoneId);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _confirmDeleteZone(Zone zone) async {
    final cs = Theme.of(context).colorScheme;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete zone?'),
        content: Text(
          'This will permanently delete "${zone.zoneName}" and all its plants. This cannot be undone.',
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

    try {
      // Unassign the sensor node and camera first: while assigned, their next reading/photo
      // would recreate data under the zone being deleted
      for (final deviceId in [zone.deviceId, zone.cameraDeviceId].whereType<String>()) {
        try {
          await DeviceService().unassignDevice(deviceId);
        } catch (_) {
          // Best effort, as on the web: the device may already be deleted.
        }
      }
      // Storage files before their docs, so a failure leaves something to retry from
      final photos = PhotoService();
      final snapshots = await FirebaseFirestore.instance
          .collection('zones').doc(zone.id).collection('snapshots').get();
      for (final s in snapshots.docs) {
        final path = s.data()['storagePath'];
        if (path is String) await photos.deleteFile(path);
      }
      final plants = await PlantService().getPlantsByZone(zone.id);
      for (final plant in plants) {
        await photos.deletePlantPhotoFile(plant.id);
        await PlantService().deletePlant(plant.id);
      }
      await photos.deleteFile('zonePhotos/${zone.id}.jpg');
      await FirebaseFirestore.instance
          .collection('automationConfig')
          .doc(zone.id)
          .delete()
          .catchError((_) {});
      // Subcollections, then the zone doc last: it's how a retry finds everything above
      await ZoneService().deleteZone(zone.id);

      if (mounted) Navigator.pop(context);
    } catch (e) {
      debugPrint('Failed to delete zone: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete zone. Please try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Zone?>(
      stream: _zoneStream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: CircularProgressIndicator()),
          );
        }

        final zone = snapshot.data;
        if (zone == null) {
          return Scaffold(
            appBar: AppBar(),
            body: const Center(child: Text('Zone not found.')),
          );
        }

        return Scaffold(
          appBar: AppBar(
            title: Row(
              children: [
                Flexible(child: Text(zone.zoneName, overflow: TextOverflow.ellipsis)),
                const SizedBox(width: 8),
                StatusLabel(zone.status),
              ],
            ),
            actions: [
              IconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Delete zone',
                onPressed: () => _confirmDeleteZone(zone),
              ),
            ],
            bottom: TabBar(
              controller: _tabController,
              labelPadding: const EdgeInsets.symmetric(horizontal: 4),  // "Automation" fits a phone-width quarter
              tabs: const [
                Tab(text: 'Overview'),
                Tab(text: 'Plants'),
                Tab(text: 'Automation'),
                Tab(text: 'Monitoring'),
              ],
            ),
          ),
          body: TabBarView(
            controller: _tabController,
            children: [
              OverviewTab(zone: zone),
              PlantsTab(zone: zone),
              AutomationTab(zone: zone),
              MonitoringTab(zone: zone),
            ],
          ),
        );
      },
    );
  }
}
