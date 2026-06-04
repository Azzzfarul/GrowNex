import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';
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
            bottom: TabBar(
              controller: _tabController,
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
