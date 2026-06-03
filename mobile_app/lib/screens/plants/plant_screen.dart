import 'package:flutter/material.dart';

import '../../models/zone_model.dart';
import 'widgets/zone_summary_card.dart';
import 'zone_detail/zone_detail_screen.dart';
import 'add_zone_screen.dart';

class PlantScreen extends StatefulWidget {
  static const routeName = '/plants';

  const PlantScreen({super.key});

  @override
  State<PlantScreen> createState() => _PlantScreenState();
}

class _PlantScreenState extends State<PlantScreen> {
  String _selectedFilter = 'All';

  final List<Zone> _zones = [
    Zone(
      id: 'zone1',
      userId: 'user1',
      zoneName: 'Indoor Zone',
      zoneType: 'indoor',
      status: 'healthy',
      totalPlantSlots: 5,
      zonePhotoUrl: null,
      deviceId: 'ESP32-01',
      latestTemp: 24,
      latestHumid: 62,
      latestLight: 480,
      latestMoisture: 56,
      latestTimestamp: DateTime.now(),
      alertSummary: 'Conditions are stable.',
      createdAt: DateTime.now(),
    ),
    Zone(
      id: 'zone2',
      userId: 'user1',
      zoneName: 'Outdoor Patch',
      zoneType: 'outdoor',
      status: 'needs attention',
      totalPlantSlots: 4,
      zonePhotoUrl: null,
      deviceId: null,
      latestTemp: 28,
      latestHumid: 70,
      latestLight: 900,
      latestMoisture: 42,
      latestTimestamp: DateTime.now(),
      alertSummary: 'Moisture is low.',
      createdAt: DateTime.now(),
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final filteredZones = _selectedFilter == 'All'
        ? _zones
        : _zones.where((zone) => zone.zoneType.toLowerCase() == _selectedFilter.toLowerCase()).toList();

    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text('Plant zones', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.grey[100],
        elevation: 0,
        foregroundColor: Colors.black,
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        children: [
          Row(
            children: [
              const Expanded(child: Text('Filter zones by type', style: TextStyle(color: Colors.black54))),
              ElevatedButton.icon(
                onPressed: () async {
                  final result = await Navigator.push(context, MaterialPageRoute(builder: (_) => const AddZoneScreen()));
                  if (result != null && result is Map<String, dynamic>) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Zone "${result['zoneName']}" created')));
                  }
                },
                icon: const Icon(Icons.add),
                label: const Text('Add zone'),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700]),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              _buildFilterButton('All'),
              const SizedBox(width: 10),
              _buildFilterButton('Indoor'),
              const SizedBox(width: 10),
              _buildFilterButton('Outdoor'),
            ],
          ),
          const SizedBox(height: 22),
          if (filteredZones.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('No zones found for this filter.')),
            )
          else
            ...filteredZones.map((zone) => ZoneSummaryCard(
                  zone: zone,
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => ZoneDetailScreen(zone: zone)),
                  ),
                )),
        ],
      ),
    );
  }

  Widget _buildFilterButton(String label) {
    final bool isSelected = label == _selectedFilter;
    return Expanded(
      child: OutlinedButton(
        onPressed: () => setState(() => _selectedFilter = label),
        style: OutlinedButton.styleFrom(
          backgroundColor: isSelected ? Colors.green[700] : Colors.white,
          foregroundColor: isSelected ? Colors.white : Colors.black87,
          side: BorderSide(color: isSelected ? Colors.green[700]! : Colors.grey.shade300),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: Text(label),
      ),
    );
  }
}
