import 'package:flutter/material.dart';

import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/plant_service.dart';

class ZoneSummaryCard extends StatefulWidget {
  final Zone zone;
  final VoidCallback onTap;

  const ZoneSummaryCard({super.key, required this.zone, required this.onTap});

  @override
  State<ZoneSummaryCard> createState() => _ZoneSummaryCardState();
}

class _ZoneSummaryCardState extends State<ZoneSummaryCard> {
  static const int _maxPlants = 4;
  late final Stream<List<Plant>> _plantsStream;

  @override
  void initState() {
    super.initState();
    _plantsStream = PlantService().watchPlantsByZone(widget.zone.id);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return StreamBuilder<List<Plant>>(
      stream: _plantsStream,
      builder: (context, snapshot) {
        final plantCount = snapshot.data?.length ?? 0;
        final isFull = plantCount >= _maxPlants;
        final hasDevice = widget.zone.deviceId != null;

        return GestureDetector(
          onTap: widget.onTap,
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: cs.surfaceContainer,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 6))],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(widget.zone.zoneName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    ),
                    if (isFull) ...[
                      _badge(cs, 'Full', Colors.orange[700]!, Colors.orange.withValues(alpha: 0.15)),
                      const SizedBox(width: 8),
                    ],
                    _badge(
                      cs,
                      hasDevice ? 'Connected' : 'No device',
                      hasDevice ? Colors.green[700]! : cs.onSurface.withValues(alpha: 0.5),
                      hasDevice ? Colors.green.withValues(alpha: 0.15) : cs.onSurface.withValues(alpha: 0.08),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Plants: $plantCount/$_maxPlants',
                  style: TextStyle(color: isFull ? Colors.orange[700] : cs.onSurface.withValues(alpha: 0.55)),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _sensorInfo(cs, 'Temp', widget.zone.latestTemp != null ? '${widget.zone.latestTemp}°C' : '--'),
                    const SizedBox(width: 10),
                    _sensorInfo(cs, 'Humid', widget.zone.latestHumid != null ? '${widget.zone.latestHumid}%' : '--'),
                    const SizedBox(width: 10),
                    _sensorInfo(cs, 'Light', widget.zone.latestLight != null ? '${widget.zone.latestLight} lx' : '--'),
                  ],
                ),
                const SizedBox(height: 10),
                Text(widget.zone.alertSummary ?? 'Summary unavailable',
                    style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55))),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _badge(ColorScheme cs, String label, Color textColor, Color bgColor) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(12)),
      child: Text(label, style: TextStyle(color: textColor, fontWeight: FontWeight.w600, fontSize: 13)),
    );
  }

  Widget _sensorInfo(ColorScheme cs, String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55), fontSize: 12)),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}
