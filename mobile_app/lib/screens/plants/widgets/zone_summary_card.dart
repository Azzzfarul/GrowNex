import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';

class ZoneSummaryCard extends StatelessWidget {
  final Zone zone;
  final VoidCallback onTap;

  const ZoneSummaryCard({super.key, required this.zone, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
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
                Expanded(child: Text(zone.zoneName, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: zone.deviceId != null ? Colors.green.withOpacity(0.16) : Colors.grey.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    zone.deviceId != null ? 'Connected' : 'No device',
                    style: TextStyle(color: zone.deviceId != null ? Colors.green : Colors.grey[700], fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text('Total plants: ${zone.totalPlantSlots}', style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 12),
            Row(
              children: [
                _sensorInfo('Temp', zone.latestTemp != null ? '${zone.latestTemp}°C' : '--'),
                const SizedBox(width: 10),
                _sensorInfo('Humid', zone.latestHumid != null ? '${zone.latestHumid}%' : '--'),
                const SizedBox(width: 10),
                _sensorInfo('Light', zone.latestLight != null ? '${zone.latestLight} lx' : '--'),
              ],
            ),
            const SizedBox(height: 10),
            Text(zone.alertSummary ?? 'Summary unavailable', style: const TextStyle(color: Colors.black54)),
          ],
        ),
      ),
    );
  }

  Widget _sensorInfo(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54, fontSize: 12)),
        const SizedBox(height: 4),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}
