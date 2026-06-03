import 'package:flutter/material.dart';

import '../../../models/zone_model.dart';

class AutomationTab extends StatefulWidget {
  final Zone zone;

  const AutomationTab({super.key, required this.zone});

  @override
  State<AutomationTab> createState() => _AutomationTabState();
}

class _AutomationTabState extends State<AutomationTab> {
  bool _autoWater = false;
  bool _autoLight = false;
  bool _autoFertilizer = false;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const Text('Manual controls', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _buildActionCard('Water', Icons.water_drop, Colors.blue)),
            const SizedBox(width: 12),
            Expanded(child: _buildActionCard('Fertilize', Icons.grass, Colors.amber)),
          ],
        ),
        const SizedBox(height: 12),
        _buildActionCard('Light', Icons.sunny, Colors.orange),
        const SizedBox(height: 24),
        const Text('Automation settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        _buildToggleSetting('Water automation', _autoWater, (value) => setState(() => _autoWater = value), 'Trigger at moisture threshold'),
        const SizedBox(height: 12),
        _buildToggleSetting('Light automation', _autoLight, (value) => setState(() => _autoLight = value), 'Schedule lighting times'),
        const SizedBox(height: 12),
        _buildToggleSetting('Fertilizer automation', _autoFertilizer, (value) => setState(() => _autoFertilizer = value), 'Trigger on schedule'),
      ],
    );
  }

  Widget _buildActionCard(String title, IconData icon, Color color) {
    return SizedBox(
      height: 110,
      child: ElevatedButton(
        onPressed: () {},
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: color,
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          padding: const EdgeInsets.all(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 28),
            const SizedBox(height: 16),
            Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }

  Widget _buildToggleSetting(String title, bool value, ValueChanged<bool> onChanged, String subtitle) {
    return Container(
      padding: const EdgeInsets.all(16),
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
              Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold))),
              Switch(value: value, onChanged: onChanged, activeColor: Colors.green[700]),
            ],
          ),
          Text(subtitle, style: const TextStyle(color: Colors.black54)),
          if (value) ...[
            const SizedBox(height: 14),
            const Text('Configure threshold or schedule', style: TextStyle(color: Colors.black54)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(child: TextField(decoration: const InputDecoration(labelText: 'Value / time', border: OutlineInputBorder()))),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
