import 'package:flutter/material.dart';

import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../utils/analytics.dart' show plantStatus;
import '../add_plant_screen.dart';
import '../../../widgets/status_label.dart';
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

        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            FilledButton.icon(
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => AddPlantScreen(
                    zoneId: widget.zone.id,
                    zoneType: widget.zone.zoneType,
                  ),
                ),
              ),
              icon: const Icon(Icons.add),
              label: const Text('Add plant'),
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
    final tt = Theme.of(context).textTheme;
    final cs       = Theme.of(context).colorScheme;
    final moisture = widget.zone.latestMoisture;

    return GestureDetector(
      onTap: () => Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => PlantDetailScreen(plant: plant, currentMoisture: moisture, zone: widget.zone),
        ),
      ),
      child: Card(
        margin: const EdgeInsets.only(bottom: 16),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    margin: const EdgeInsets.only(right: 12),
                    decoration: BoxDecoration(
                      color: cs.surfaceContainerHigh,
                      borderRadius: BorderRadius.circular(12),
                      image: plant.photoUrl != null
                          ? DecorationImage(image: NetworkImage(plant.photoUrl!), fit: BoxFit.cover)
                          : null,
                    ),
                    child: plant.photoUrl == null
                        ? Icon(Icons.local_florist, size: 22, color: cs.onSurface.withValues(alpha: 0.38))
                        : null,
                  ),
                  Expanded(child: Text(plant.plantName, style: tt.titleMedium)),
                  if (plantStatus(widget.zone, plant) case final status?) StatusLabel(status),
                ],
              ),
              const SizedBox(height: 10),
              Text(plant.species, style: TextStyle(color: cs.onSurfaceVariant)),
              if (plant.preferredLightCondition != null) ...[
                const SizedBox(height: 12),
                _InfoChip(label: 'Light', value: plant.preferredLightCondition!),
              ],
            ],
          ),
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
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(12)),
      child: Text('$label: $value', style: tt.bodySmall),
    );
  }
}
