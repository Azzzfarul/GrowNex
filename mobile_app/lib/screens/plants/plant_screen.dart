import 'package:flutter/material.dart';

class PlantScreen extends StatelessWidget {
  static const routeName = '/plants';

  const PlantScreen({super.key});

  Widget _buildPlantCard(String name, String zone, String status, Color badgeColor) {
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name, 
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Color((badgeColor.toARGB32() & 0x00FFFFFF) | 0x33000000),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(status, style: TextStyle(color: badgeColor, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(zone, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 16),
          const Wrap(
            spacing: 20,
            runSpacing: 12,
            children: [
              _AttributeItem(label: 'Light', value: '75%'),
              _AttributeItem(label: 'Water', value: '54%'),
              _AttributeItem(label: 'Temp', value: '24°C'),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Wrapping with Scaffold introduces the necessary Material design canvas
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text('Plant zones', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.grey[100],
        elevation: 0,
        foregroundColor: Colors.black, // Ensures the back arrow is visible
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        children: [
          const Text('Monitor each plant cluster and zone at a glance.', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 20),
          _buildPlantCard('Aloe Vera', 'Zone 1', 'Healthy', Colors.green),
          _buildPlantCard('Basil', 'Zone 2', 'Needs water', Colors.orange),
          _buildPlantCard('Ficus', 'Zone 3', 'Stable', Colors.teal),
          _buildPlantCard('Orchid', 'Zone 4', 'Check soil', Colors.amber),
        ],
      ),
    );
  }
}

class _AttributeItem extends StatelessWidget {
  final String label;
  final String value;

  const _AttributeItem({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.black54)),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
      ],
    );
  }
}