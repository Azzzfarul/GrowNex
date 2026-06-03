import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';

class OverviewTab extends StatelessWidget {
  final Zone zone;

  const OverviewTab({super.key, required this.zone});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _buildPhotoCard(),
        const SizedBox(height: 20),
        _buildInfoCard(),
        const SizedBox(height: 20),
        _buildSensorCard(),
      ],
    );
  }

  Widget _buildPhotoCard() {
    return Container(
      height: 180,
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(18),
        image: zone.zonePhotoUrl != null
            ? DecorationImage(image: NetworkImage(zone.zonePhotoUrl!), fit: BoxFit.cover)
            : null,
      ),
      child: zone.zonePhotoUrl == null
          ? const Center(child: Icon(Icons.photo, size: 48, color: Colors.black38))
          : null,
    );
  }

  Widget _buildInfoCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(zone.zoneType.toUpperCase(), style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text('Total plants: ${zone.totalPlantSlots}', style: const TextStyle(fontSize: 16)),
          const SizedBox(height: 12),
          Text(zone.deviceId != null ? 'Device: ${zone.deviceId}' : 'No device connected', style: const TextStyle(color: Colors.black54)),
        ],
      ),
    );
  }

  Widget _buildSensorCard() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Latest sensor readings', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 14),
          _sensorValue('Temperature', zone.latestTemp != null ? '${zone.latestTemp}°C' : '--'),
          const SizedBox(height: 12),
          _sensorValue('Humidity', zone.latestHumid != null ? '${zone.latestHumid}%' : '--'),
          const SizedBox(height: 12),
          _sensorValue('Light', zone.latestLight != null ? '${zone.latestLight} lx' : '--'),
        ],
      ),
    );
  }

  Widget _sensorValue(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [Text(label, style: const TextStyle(color: Colors.black54)), Text(value, style: const TextStyle(fontWeight: FontWeight.bold))],
    );
  }
}
