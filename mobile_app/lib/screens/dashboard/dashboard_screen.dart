import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/zone_model.dart';
import '../../services/firestore/zone_service.dart';
import '../../widgets/zone_card_widget.dart';
import '../plants/zone_detail/zone_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  static const _contentPadding = EdgeInsets.all(20);
  late final Stream<List<Zone>> _zonesStream;
  late final String _username;

  @override
  void initState() {
    super.initState();
    final authUser = FirebaseAuth.instance.currentUser;
    _username = authUser?.displayName ?? 'gardener';
    _zonesStream = authUser != null
        ? ZoneService().watchZones(authUser.uid)
        : const Stream.empty();
  }

  @override
  Widget build(BuildContext context) {
    final authUser = FirebaseAuth.instance.currentUser;
    if (authUser == null) {
      return const Center(child: Text('Please sign in to see your dashboard.'));
    }

    return StreamBuilder<List<Zone>>(
      stream: _zonesStream,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(child: Text('Unable to load dashboard: ${snapshot.error}'));
        }
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final zones = snapshot.data ?? [];
        final activeZones = zones.where((z) => z.status.toLowerCase().contains('healthy')).length;
        final attentionZones = zones.length - activeZones;

        return SingleChildScrollView(
          padding: _contentPadding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Good morning, $_username', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
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
                        Navigator.push(context, MaterialPageRoute(builder: (_) => ZoneDetailScreen(zoneId: zone.id)));
                      },
                    )),
              ],
            ],
          ),
        );
      },
    );
  }

  Widget _buildSummaryCard(String title, String value, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 14, offset: const Offset(0, 6))],
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
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 14, offset: const Offset(0, 6))],
      ),
      child: const Text(
        'No zones found yet. Add a zone first, then the dashboard will show the latest sensor summaries and alerts.',
        style: TextStyle(color: Colors.black54),
      ),
    );
  }
}
