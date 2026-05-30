import 'package:flutter/material.dart';

class AnalyticsScreen extends StatelessWidget {
  const AnalyticsScreen({super.key});

  Widget _buildMetricCard(String title, String value, String description, Color accent) {
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
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(value, style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: accent)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: Color((accent.toARGB32() & 0x00FFFFFF) | 0x26000000),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text('Stable', style: TextStyle(color: accent, fontWeight: FontWeight.w600)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(description, style: const TextStyle(color: Colors.black54)),
        ],
      ),
    );
  }

  Widget _buildProgress(String label, double progress, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.black54)),
            Text('${(progress * 100).round()}%', style: TextStyle(color: color, fontWeight: FontWeight.w600)),
          ],
        ),
        const SizedBox(height: 8),
        LinearProgressIndicator(
          value: progress,
          color: color,
          backgroundColor: Colors.grey[200],
          minHeight: 8,
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Analytics', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Text('Track plant health and growing conditions in one place.', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 24),
          _buildMetricCard('Moisture level', '72%', 'Latest sensor readings are in the ideal range.', Colors.blue),
          _buildMetricCard('Temperature', '24°C', 'Stable ambient temperature for growth.', Colors.orange),
          _buildMetricCard('Growth score', '88', 'Your garden is progressing smoothly.', Colors.green),
          const SizedBox(height: 16),
          _buildProgress('Water absorption', 0.68, Colors.blue),
          const SizedBox(height: 16),
          _buildProgress('Light exposure', 0.82, Colors.amber),
          const SizedBox(height: 16),
          _buildProgress('Nutrient balance', 0.76, Colors.green),
        ],
      ),
    );
  }
}
