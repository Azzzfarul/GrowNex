import 'package:flutter/material.dart';

import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../plant_detail/plant_detail_screen.dart';
import '../add_plant_screen.dart';

class PlantsTab extends StatelessWidget {
  final Zone zone;

  const PlantsTab({super.key, required this.zone});

  List<Plant> get _plants => [
        Plant(
          id: 'plant1',
          zoneId: zone.id,
          plantName: 'Orchid',
          species: 'Phalaenopsis',
          status: 'Healthy',
          slotNumber: 1,
          preferredLightCondition: 'Medium',
          preferredMoistureMin: 40,
          preferredMoistureMax: 70,
          preferredHumidityMin: 45,
          preferredHumidityMax: 65,
          preferredTemperatureMin: 22,
          preferredTemperatureMax: 28,
          notes: 'Give bright, indirect sunlight.',
          createdAt: DateTime.now(),
        ),
        Plant(
          id: 'plant2',
          zoneId: zone.id,
          plantName: 'Basil',
          species: 'Ocimum basilicum',
          status: 'Needs water',
          slotNumber: 2,
          preferredLightCondition: 'High',
          preferredMoistureMin: 50,
          preferredMoistureMax: 80,
          preferredHumidityMin: 50,
          preferredHumidityMax: 70,
          preferredTemperatureMin: 20,
          preferredTemperatureMax: 26,
          notes: 'Water when topsoil is dry.',
          createdAt: DateTime.now(),
        ),
      ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        ElevatedButton.icon(
          onPressed: () async {
            final result = await Navigator.push(context, MaterialPageRoute(builder: (_) => AddPlantScreen(zoneId: zone.id)));
            if (result != null && result is Map<String, dynamic>) {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Plant "${result['species']}" added')));
            }
          },
          icon: const Icon(Icons.add),
          label: const Text('Add plant'),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700], shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
        ),
        const SizedBox(height: 20),
        ..._plants.map((plant) => _buildPlantCard(context, plant)),
      ],
    );
  }

  Widget _buildPlantCard(BuildContext context, Plant plant) {
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PlantDetailScreen(plant: plant))),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(plant.plantName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(color: Colors.green.withOpacity(0.16), borderRadius: BorderRadius.circular(12)),
                  child: Text(plant.status, style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(plant.species, style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 12),
            Row(
              children: [
                _InfoChip(label: 'Moisture', value: '55%'),
                const SizedBox(width: 8),
                _InfoChip(label: 'Slot', value: plant.slotNumber.toString()),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoChip extends StatelessWidget {
  final String label;
  final String value;

  const _InfoChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey[100],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text('$label: $value', style: const TextStyle(fontSize: 12)),
    );
  }
}
