import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/zone_model.dart';
import '../../services/firestore/zone_service.dart';
import 'add_zone_screen.dart';
import 'widgets/zone_summary_card.dart';
import 'zone_detail/zone_detail_screen.dart';

class PlantScreen extends StatefulWidget {
  static const routeName = '/plants';

  const PlantScreen({super.key});

  @override
  State<PlantScreen> createState() => _PlantScreenState();
}

class _PlantScreenState extends State<PlantScreen> {
  String _selectedFilter = 'All';
  late final Stream<List<Zone>> _zonesStream;

  @override
  void initState() {
    super.initState();
    final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
    _zonesStream = ZoneService().watchZones(userId);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Plant zones', style: TextStyle(fontWeight: FontWeight.bold)),
        elevation: 0,
      ),
      body: StreamBuilder<List<Zone>>(
        stream: _zonesStream,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error loading zones: ${snapshot.error}'));
          }

          final allZones = snapshot.data ?? [];
          final filteredZones = _selectedFilter == 'All'
              ? allZones
              : allZones.where((z) => z.zoneType.toLowerCase() == _selectedFilter.toLowerCase()).toList();

          return ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            children: [
              Row(
                children: [
                  Expanded(child: Text('Filter zones by type',
                      style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55)))),
                  ElevatedButton.icon(
                    onPressed: () {
                      Navigator.push(context, MaterialPageRoute(builder: (_) => const AddZoneScreen()));
                    },
                    icon: const Icon(Icons.add),
                    label: const Text('Add zone'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green[700],
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  _buildFilterButton(cs, 'All'),
                  const SizedBox(width: 10),
                  _buildFilterButton(cs, 'Indoor'),
                  const SizedBox(width: 10),
                  _buildFilterButton(cs, 'Outdoor'),
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
                        MaterialPageRoute(builder: (_) => ZoneDetailScreen(zoneId: zone.id)),
                      ),
                    )),
            ],
          );
        },
      ),
    );
  }

  Widget _buildFilterButton(ColorScheme cs, String label) {
    final bool isSelected = label == _selectedFilter;
    return Expanded(
      child: OutlinedButton(
        onPressed: () => setState(() => _selectedFilter = label),
        style: OutlinedButton.styleFrom(
          backgroundColor: isSelected ? Colors.green[700] : cs.surfaceContainer,
          foregroundColor: isSelected ? Colors.white : cs.onSurface,
          side: BorderSide(color: isSelected ? Colors.green[700]! : cs.outline),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: Text(label),
      ),
    );
  }
}
