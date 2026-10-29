import 'package:flutter/material.dart';

import '../../../models/plant_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../theme.dart';

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
        final tt = Theme.of(context).textTheme;
        final app = AppColors.of(context);
        final plantCount = snapshot.data?.length ?? 0;
        final isFull = plantCount >= _maxPlants;
        final hasDevice = widget.zone.deviceId != null;
        final deviceOffline = widget.zone.deviceOnline == false;

        return Card(
          margin: const EdgeInsets.only(bottom: 16),
          child: InkWell(
            onTap: widget.onTap,
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(widget.zone.zoneName, style: tt.titleMedium),
                      ),
                      if (isFull) ...[
                        _badge(cs, 'Full', app.onWarningContainer, app.warningContainer),
                        const SizedBox(width: 8),
                      ],
                      _badge(
                        cs,
                        hasDevice ? 'Connected' : 'No device',
                        hasDevice ? cs.onPrimaryContainer : cs.onSurfaceVariant,
                        hasDevice ? cs.primaryContainer : cs.surfaceContainerHighest,
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Plants: $plantCount/$_maxPlants',
                    style: TextStyle(color: isFull ? app.warning : cs.onSurfaceVariant),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      _sensorInfo(cs, 'Temp',  deviceOffline ? '--' : (widget.zone.latestTemp  != null ? '${widget.zone.latestTemp}°C'   : '--')),
                      const SizedBox(width: 10),
                      _sensorInfo(cs, 'Humid', deviceOffline ? '--' : (widget.zone.latestHumid != null ? '${widget.zone.latestHumid}%'   : '--')),
                      const SizedBox(width: 10),
                      _sensorInfo(cs, 'Light', deviceOffline ? '--' : (widget.zone.latestLight != null ? '${widget.zone.latestLight}%' : '--')),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Text(
                    deviceOffline ? 'Device is offline.' : (widget.zone.alertSummary ?? 'Summary unavailable'),
                    style: TextStyle(color: cs.onSurfaceVariant),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _badge(ColorScheme cs, String label, Color textColor, Color bgColor) {
    final tt = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(8)),
      child: Text(label, style: tt.labelLarge?.copyWith(color: textColor)),
    );
  }

  Widget _sensorInfo(ColorScheme cs, String label, String value) {
    final tt = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
      ],
    );
  }
}
