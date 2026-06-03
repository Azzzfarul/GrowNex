import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/zone_model.dart';
import '../../services/firestore/zone_service.dart';
import '../../widgets/zone_card_widget.dart';
import '../plants/plant_screen.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

  static const _contentPadding = EdgeInsets.all(20);
  static final ZoneService _zoneService = ZoneService();

  @override
  Widget build(BuildContext context) {
    final authUser = FirebaseAuth.instance.currentUser;
    if (authUser == null) {
      return const Center(
        child: Text('Please sign in to see your dashboard.'),
      );
    }

    return FutureBuilder<String?>(
      // prefer FirebaseAuth displayName for username; fall back to null
      future: Future.value(authUser.displayName),
      builder: (context, usernameSnapshot) {
        if (usernameSnapshot.connectionState != ConnectionState.done) {
          return _buildLoading();
        }

        final username = usernameSnapshot.data ?? 'gardener';

        return StreamBuilder<List<Zone>>(
          stream: _zoneService.watchZones(authUser.uid),
          builder: (context, snapshot) {
            if (snapshot.hasError) {
              return Center(child: Text('Unable to load dashboard: ${snapshot.error}'));
            }
            if (snapshot.connectionState == ConnectionState.waiting) {
              return _buildLoading();
            }

            final zones = snapshot.data ?? [];
            final activeZones = zones.where((zone) => zone.status.toLowerCase().contains('healthy')).length;
            final attentionZones = zones.length - activeZones;

            return SingleChildScrollView(
              padding: _contentPadding,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Good morning, $username', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 10),
                  const Text('Here is today\'s plant performance overview.', style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(child: _buildSummaryCard('Active zones', '$activeZones active zone${activeZones == 1 ? '' : 's'}', Colors.green)),
                      const SizedBox(width: 16),
                      Expanded(child: _buildSummaryCard('Attention', '$attentionZones zone${attentionZones == 1 ? '' : 's'} require attention', Colors.orange)),
                    ],
                  ),
                  const SizedBox(height: 24),
                  if (zones.isEmpty)
                    _buildEmptyState()
                  else ...[
                    const Text('Zone overview', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    ...zones.map((zone) => ZoneCardWidget(
                          zone: zone,
                          onViewDetails: () {
                            Navigator.pushNamed(context, PlantScreen.routeName, arguments: zone);
                          },
                        )),
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildLoading() {
    return const Center(child: CircularProgressIndicator());
  }

  Widget _buildSummaryCard(String title, String value, Color color) {
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
          Text(title, style: TextStyle(color: color, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(color: Colors.black12, blurRadius: 14, offset: const Offset(0, 6)),
        ],
      ),
      child: const Text(
        'No zones found yet. Add a zone first, then the dashboard will show the latest sensor summaries and alerts.',
        style: TextStyle(color: Colors.black54),
      ),
    );
  }
}
