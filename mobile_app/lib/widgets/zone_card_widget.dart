import 'package:flutter/material.dart';

import '../models/zone_model.dart';
import 'status_label.dart';

class ZoneCardWidget extends StatelessWidget {
  final Zone zone;
  final VoidCallback onViewDetails;

  const ZoneCardWidget({
    super.key,
    required this.zone,
    required this.onViewDetails,
  });

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final deviceOffline = zone.deviceOnline == false;
    final hasSensorData = !deviceOffline &&
        (zone.latestTemp != null || zone.latestHumid != null ||
         zone.latestLight != null || zone.latestMoisture != null);

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    zone.zoneName,
                    style: tt.titleMedium,
                  ),
                ),
                StatusLabel(zone.status),
              ],
            ),
            const SizedBox(height: 12),
            if (hasSensorData) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _AttributeItem(label: 'Temp', value: '${zone.latestTemp?.toStringAsFixed(0) ?? '--'}°C'),
                  _AttributeItem(label: 'Humidity', value: '${zone.latestHumid?.toStringAsFixed(0) ?? '--'}%'),
                  _AttributeItem(label: 'Light', value: '${zone.latestLight?.toStringAsFixed(0) ?? '--'}%'),
                  _AttributeItem(label: 'Moisture', value: '${zone.latestMoisture?.toStringAsFixed(0) ?? '--'}%'),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                zone.alertSummary ?? _defaultAlertMessage(zone.status),
                style: TextStyle(color: cs.onSurfaceVariant),
              ),
            ] else ...[
              Text(
                deviceOffline ? 'Device is offline.' : 'No sensor data available yet.',
                style: TextStyle(color: cs.onSurfaceVariant),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: onViewDetails,
                icon: const Icon(Icons.arrow_forward, size: 18),
                label: const Text('View details'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _defaultAlertMessage(String status) {
    final normalized = status.toLowerCase();
    if (normalized.contains('attention') || normalized.contains('needs')) {
      return 'Sensor readings require your attention.';
    }
    if (normalized.contains('healthy') || normalized.contains('stable')) {
      return 'Conditions are within the healthy range.';
    }
    return 'Review the latest sensor readings for this zone.';
  }

}

class _AttributeItem extends StatelessWidget {
  final String label;
  final String value;

  const _AttributeItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
        const SizedBox(height: 6),
        Text(value, style: tt.titleSmall),
      ],
    );
  }
}
