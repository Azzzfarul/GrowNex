import 'package:flutter/material.dart';

import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/plant_service.dart';
import '../add_plant_screen.dart';
import '../plant_detail/plant_detail_screen.dart';

class PlantsTab extends StatefulWidget {
  final Zone zone;

  const PlantsTab({super.key, required this.zone});

  @override
  State<PlantsTab> createState() => _PlantsTabState();
}

class _PlantsTabState extends State<PlantsTab> {
  late final Stream<List<Plant>> _plantsStream;

  @override
  void initState() {
    super.initState();
    _plantsStream = PlantService().watchPlantsByZone(widget.zone.id);
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<List<Plant>>(
      stream: _plantsStream,
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return Center(child: Text('Error loading plants: ${snapshot.error}'));
        }

        final plants = snapshot.data ?? [];
        const maxPlants = 4;
        final isFull = plants.length >= maxPlants;
        final takenSlots = plants.map((p) => p.slotNumber).toSet();

        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            ElevatedButton.icon(
              onPressed: isFull
                  ? null
                  : () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddPlantScreen(
                            zoneId: widget.zone.id,
                            takenSlots: takenSlots,
                          ),
                        ),
                      ),
              icon: Icon(isFull ? Icons.block : Icons.add),
              label: Text(isFull ? 'Zone full (${plants.length}/$maxPlants)' : 'Add plant'),
              style: ElevatedButton.styleFrom(
                backgroundColor: isFull ? Colors.grey[400] : Colors.green[700],
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
            ),
            const SizedBox(height: 20),
            if (plants.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: Text('No plants in this zone yet.')),
              )
            else
              ...plants.map((plant) => _buildPlantCard(context, plant)),
          ],
        );
      },
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
                  decoration: BoxDecoration(color: Colors.green.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(12)),
                  child: Text(plant.status, style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(plant.species, style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 12),
            Row(
              children: [
                _InfoChip(label: 'Slot', value: plant.slotNumber.toString()),
                const SizedBox(width: 8),
                if (plant.preferredLightCondition != null)
                  _InfoChip(label: 'Light', value: plant.preferredLightCondition!),
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
      decoration: BoxDecoration(color: Colors.grey[100], borderRadius: BorderRadius.circular(12)),
      child: Text('$label: $value', style: const TextStyle(fontSize: 12)),
    );
  }
}
