import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';
import '../../../services/firestore/device_service.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../services/firestore/zone_service.dart';
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
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      // Delete plants in this zone
      final plants = await PlantService().getPlantsByZone(zone.id);
      for (final plant in plants) {
        await PlantService().deletePlant(plant.id);
      }
      // Delete automationConfig
      await FirebaseFirestore.instance
          .collection('automationConfig')
          .doc(zone.id)
          .delete()
          .catchError((_) {});
      // Unassign connected device
      if (zone.deviceId != null) {
        await DeviceService().unassignDevice(zone.deviceId!);
      }
      // Delete zone document
      await ZoneService().deleteZone(zone.id);

      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to delete zone: $e')),
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
            appBar: AppBar(backgroundColor: Colors.green[700]),
            body: const Center(child: CircularProgressIndicator()),
          );
        }

        final zone = snapshot.data;
        if (zone == null) {
          return Scaffold(
            appBar: AppBar(backgroundColor: Colors.green[700]),
            body: const Center(child: Text('Zone not found.')),
          );
        }

        return Scaffold(
          appBar: AppBar(
            title: Text(zone.zoneName),
            backgroundColor: Colors.green[700],
            foregroundColor: Colors.white,
            actions: [
              IconButton(
                icon: const Icon(Icons.delete_outline),
                tooltip: 'Delete zone',
                onPressed: () => _confirmDeleteZone(zone),
              ),
            ],
            bottom: TabBar(
              controller: _tabController,
              labelColor: Colors.white,
              unselectedLabelColor: Colors.white70,
              indicatorColor: Colors.white,
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
