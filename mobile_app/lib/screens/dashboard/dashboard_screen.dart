import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/zone_model.dart';
import '../../services/firestore/zone_service.dart';
import '../../services/auth_service.dart';
import '../../widgets/zone_card_widget.dart';
import '../plants/zone_detail/zone_detail_screen.dart';
import '../../theme.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  static const _contentPadding = EdgeInsets.all(20);
  late final Stream<List<Zone>> _zonesStream;
  String _username = 'gardener';

  @override
  void initState() {
    super.initState();
    final authUser = FirebaseAuth.instance.currentUser;
    _zonesStream = authUser != null
        ? ZoneService().watchZones(authUser.uid)
        : const Stream.empty();
    _loadUsername();
  }

  Future<void> _loadUsername() async {
    final data = await AuthService().getCurrentUserData();
    final authUser = FirebaseAuth.instance.currentUser;
    if (mounted) {
      setState(() {
        _username = data?['username'] as String? ??
            authUser?.displayName ??
            'gardener';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final authUser = FirebaseAuth.instance.currentUser;
    if (authUser == null) {
      return const Center(child: Text('Please sign in to see your dashboard.'));
    }

    return StreamBuilder<List<Zone>>(
      stream: _zonesStream,
      builder: (context, snapshot) {
        final app = AppColors.of(context);
        final tt = Theme.of(context).textTheme;
        if (snapshot.hasError) {
          return Center(child: Text('Unable to load dashboard: ${snapshot.error}'));
        }
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator());
        }

        final zones = snapshot.data ?? [];
        final healthyZones = zones.where((z) => z.status.toLowerCase().contains('healthy')).length;
        // Zones with no plants yet are 'unknown' — not healthy, but not needing attention either.
        final attentionZones = zones.where((z) => z.status == 'attention' || z.status == 'critical').length;

        return SingleChildScrollView(
          padding: _contentPadding,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Good morning, $_username', style: tt.titleLarge),
              const SizedBox(height: 10),
              Text('Here is today\'s plant performance overview.',
                  style: TextStyle(color: cs.onSurfaceVariant)),
              const SizedBox(height: 24),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(child: _buildSummaryCard('Healthy zones', '$healthyZones healthy zone${healthyZones == 1 ? '' : 's'}',
                        Icons.check_circle, cs.primaryContainer, cs.onPrimaryContainer)),
                    const SizedBox(width: 16),
                    Expanded(child: _buildSummaryCard('Attention', '$attentionZones zone${attentionZones == 1 ? '' : 's'} require attention',
                        Icons.warning_rounded, app.warningContainer, app.onWarningContainer)),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              if (zones.isEmpty)
                _buildEmptyState(cs)
              else ...[
                Text('Zone overview', style: tt.titleMedium),
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

  // Tonal M3 tile (same as the web dashboard's summary tiles)
  Widget _buildSummaryCard(String title, String value, IconData icon, Color bg, Color fg) {
    final tt = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: fg, size: 28),
          const SizedBox(height: 12),
          Text(title, style: tt.labelLarge?.copyWith(color: fg)),
          const SizedBox(height: 4),
          Text(value, style: tt.titleMedium?.copyWith(color: fg)),
        ],
      ),
    );
  }

  Widget _buildEmptyState(ColorScheme cs) {
    return Card(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(18),
        child: Text(
          'No zones found yet. Add a zone first, then the dashboard will show the latest sensor summaries and alerts.',
          style: TextStyle(color: cs.onSurfaceVariant),
        ),
      ),
    );
  }
}
