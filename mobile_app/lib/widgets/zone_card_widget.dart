import 'package:flutter/material.dart';

import '../models/zone_model.dart';

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
    final cs = Theme.of(context).colorScheme;
    final hasSensorData = zone.latestTemp != null || zone.latestHumid != null || zone.latestLight != null || zone.latestMoisture != null;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(color: cs.shadow.withValues(alpha: 0.08), blurRadius: 14, offset: const Offset(0, 6)),
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  zone.zoneName,
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: _statusColor(zone.status).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  zone.status,
                  style: TextStyle(color: _statusColor(zone.status), fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (hasSensorData) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _AttributeItem(label: 'Temp', value: '${zone.latestTemp?.toStringAsFixed(0) ?? '--'}°C'),
                _AttributeItem(label: 'Humidity', value: '${zone.latestHumid?.toStringAsFixed(0) ?? '--'}%'),
                _AttributeItem(label: 'Light', value: '${zone.latestLight?.toStringAsFixed(0) ?? '--'} lx'),
                _AttributeItem(label: 'Moisture', value: '${zone.latestMoisture?.toStringAsFixed(0) ?? '--'}%'),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              zone.alertSummary ?? _defaultAlertMessage(zone.status),
              style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55)),
            ),
          ] else ...[
            Text('No sensor data available yet.',
                style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55))),
          ],
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: onViewDetails,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.green[700],
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
              icon: const Icon(Icons.arrow_forward, size: 18),
              label: const Text('View details'),
            ),
          ),
        ],
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

  Color _statusColor(String status) {
    final normalized = status.toLowerCase();
    if (normalized.contains('healthy') || normalized.contains('stable')) return Colors.green;
    if (normalized.contains('warning') || normalized.contains('attention') || normalized.contains('needs')) return Colors.orange;
    if (normalized.contains('critical') || normalized.contains('alert')) return Colors.red;
    return Colors.blueGrey;
  }
}

class _AttributeItem extends StatelessWidget {
  final String label;
  final String value;

  const _AttributeItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55), fontSize: 12)),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
      ],
    );
  }
}
