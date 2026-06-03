import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';

class MonitoringTab extends StatelessWidget {
  final Zone zone;

  const MonitoringTab({super.key, required this.zone});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _buildDeviceStatus(),
        const SizedBox(height: 20),
        _buildSensorOverview(),
        const SizedBox(height: 20),
        _buildImagePreview(),
      ],
    );
  }

  Widget _buildDeviceStatus() {
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
          const Text('Device status', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text(zone.deviceId != null ? 'Connected to ${zone.deviceId}' : 'No device connected', style: const TextStyle(fontSize: 16)),
          const SizedBox(height: 8),
          Text(zone.deviceId != null ? 'Online' : 'Disconnected', style: TextStyle(color: zone.deviceId != null ? Colors.green : Colors.red)),
        ],
      ),
    );
  }

  Widget _buildSensorOverview() {
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
          const Text('Latest readings', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 14),
          _sensorValue('Temperature', zone.latestTemp != null ? '${zone.latestTemp}°C' : '--'),
          const SizedBox(height: 10),
          _sensorValue('Humidity', zone.latestHumid != null ? '${zone.latestHumid}%' : '--'),
          const SizedBox(height: 10),
          _sensorValue('Light', zone.latestLight != null ? '${zone.latestLight} lx' : '--'),
          const SizedBox(height: 10),
          _sensorValue('Moisture', zone.latestMoisture != null ? '${zone.latestMoisture}%' : '--'),
        ],
      ),
    );
  }

  Widget _buildImagePreview() {
    return Container(
      height: 200,
      decoration: BoxDecoration(
        color: Colors.grey[200],
        borderRadius: BorderRadius.circular(18),
      ),
      child: const Center(
        child: Icon(Icons.camera_alt, size: 44, color: Colors.black38),
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
