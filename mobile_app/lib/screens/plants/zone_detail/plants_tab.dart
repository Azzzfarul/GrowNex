import 'package:flutter/material.dart';

import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../utils/analytics.dart' show plantStatus;
import '../add_plant_screen.dart';
import '../../../widgets/status_label.dart';
import '../plant_detail/plant_detail_screen.dart';
import '../../../theme.dart';

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
            FilledButton.icon(
              onPressed: isFull
                  ? null
                  : () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) => AddPlantScreen(
                            zoneId: widget.zone.id,
                            takenSlots: takenSlots,
                            zoneType: widget.zone.zoneType,
                            userId: widget.zone.userId,
                          ),
                        ),
                      ),
              icon: Icon(isFull ? Icons.block : Icons.add),
              label: Text(isFull ? 'Zone full (${plants.length}/$maxPlants)' : 'Add plant'),
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

  num? _slotMoisture(int slot) {
    switch (slot) {
      case 1: return widget.zone.latestMoisture1;
      case 2: return widget.zone.latestMoisture2;
      case 3: return widget.zone.latestMoisture3;
      case 4: return widget.zone.latestMoisture4;
      default: return null;
    }
  }

  Widget _buildPlantCard(BuildContext context, Plant plant) {
    final tt = Theme.of(context).textTheme;
    final cs       = Theme.of(context).colorScheme;
    final moisture = _slotMoisture(plant.slotNumber);

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
              const SizedBox(height: 12),
              Row(
                children: [
                  _InfoChip(label: 'Slot', value: plant.slotNumber.toString()),
                  const SizedBox(width: 8),
                  if (plant.preferredLightCondition != null)
                    _InfoChip(label: 'Light', value: plant.preferredLightCondition!),
                ],
              ),
              if (moisture != null) ...[
                const SizedBox(height: 14),
                _MoistureBar(
                  cs: cs,
                  moisture: moisture,
                  min: plant.preferredMoistureMin,
                  max: plant.preferredMoistureMax,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MoistureBar extends StatelessWidget {
  final ColorScheme cs;
  final num moisture;
  final num? min;
  final num? max;

  const _MoistureBar({required this.cs, required this.moisture, this.min, this.max});

  @override
  Widget build(BuildContext context) {
    final app = AppColors.of(context);
    final tt = Theme.of(context).textTheme;
    final hasRange = min != null && max != null;
    final inRange  = hasRange && moisture >= min! && moisture <= max!;
    final tooLow   = hasRange && moisture < min!;

    final color = !hasRange
        ? cs.tertiary
        : inRange  ? cs.primary
        : tooLow   ? app.warning
        : cs.error;

    final label = !hasRange ? null
        : inRange  ? 'Within preferred range'
        : tooLow   ? 'Too dry'
        : 'Too wet';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('Soil moisture', style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
            Text('${moisture.toStringAsFixed(1)}%',
                style: tt.labelMedium?.copyWith(color: color)),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: (moisture / 100).clamp(0.0, 1.0),
            backgroundColor: cs.surfaceContainerHigh,
            valueColor: AlwaysStoppedAnimation<Color>(color),
            minHeight: 7,
          ),
        ),
        if (label != null) ...[
          const SizedBox(height: 4),
          Text(label, style: tt.labelSmall?.copyWith(color: color)),
        ],
      ],
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
