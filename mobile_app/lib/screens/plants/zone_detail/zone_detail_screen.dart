import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';
import 'automation_tab.dart';
import 'monitoring_tab.dart';
import 'overview_tab.dart';
import 'plants_tab.dart';

class ZoneDetailScreen extends StatelessWidget {
  final Zone zone;

  const ZoneDetailScreen({super.key, required this.zone});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(zone.zoneName),
          backgroundColor: Colors.green[700],
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Plants'),
              Tab(text: 'Automation'),
              Tab(text: 'Monitoring'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            OverviewTab(zone: zone),
            PlantsTab(zone: zone),
            AutomationTab(zone: zone),
            MonitoringTab(zone: zone),
          ],
        ),
      ),
    );
  }
}
