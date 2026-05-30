import 'package:flutter/material.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  Widget _buildCard(String title, String value, IconData icon, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black12,
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: Color((color.toARGB32() & 0x00FFFFFF) | 0x26000000),
            child: Icon(icon, color: color),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Colors.black54)),
                const SizedBox(height: 8),
                Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionCard(String title, String value, String label) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(color: Colors.black12, blurRadius: 14, offset: const Offset(0, 6)),
        ],
      ),
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text(value, style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(color: Colors.black54)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Good morning, gardener', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Text('Here is today\'s plant performance overview.', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(child: _buildCard('Plants active', '12', Icons.grass, Colors.green)),
              const SizedBox(width: 16),
              Expanded(child: _buildCard('Humidity', '72%', Icons.water_drop, Colors.blue)),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(child: _buildCard('Health score', '88', Icons.favorite, Colors.teal)),
              const SizedBox(width: 16),
              Expanded(child: _buildCard('Energy', 'Good', Icons.sunny, Colors.amber)),
            ],
          ),
          const SizedBox(height: 24),
          _buildSectionCard('Growth status', 'Stable and thriving', 'No immediate actions required.'),
          const SizedBox(height: 16),
          _buildSectionCard('Environment', 'Optimal', 'Temperature and moisture are within healthy range.'),
        ],
      ),
    );
  }
}
