import 'package:flutter/material.dart';

class DevicesScreen extends StatefulWidget {
  const DevicesScreen({super.key});

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  final List<bool> _enabled = [true, false, true];

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.grey[100],
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Connected devices', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Text('Control your hardware and check which devices are online.', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 24),
          _buildDeviceCard(0, 'Water Pump', 'Zone 2', 'Automatically waters plants every 8h'),
          _buildDeviceCard(1, 'Climate Sensor', 'Zone 1', 'Temperature and humidity monitor'),
          _buildDeviceCard(2, 'Grow Light', 'Zone 4', 'Provides supplemental lighting'),
        ],
      ),
    );
  }

  Widget _buildDeviceCard(int index, String name, String location, String subtitle) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 5)),
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          const CircleAvatar(
            radius: 24,
            backgroundColor: Color(0xFFE8F5E9),
            child: Icon(Icons.power_settings_new, color: Colors.green),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 6),
                Text(location, style: const TextStyle(color: Colors.black54)),
                const SizedBox(height: 8),
                Text(subtitle, style: const TextStyle(color: Colors.black45, fontSize: 13)),
              ],
            ),
          ),
          Switch(
            value: _enabled[index],
            activeThumbColor: Colors.green[700],
            activeTrackColor: Colors.green[200],
            onChanged: (value) {
              setState(() {
                _enabled[index] = value;
              });
            },
          ),
        ],
      ),
    );
  }
}
