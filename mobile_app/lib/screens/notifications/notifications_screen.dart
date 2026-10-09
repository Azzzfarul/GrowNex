import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/notification_model.dart';
import '../../services/firestore/notification_service.dart';
import '../plants/zone_detail/zone_detail_screen.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  static String _relative(DateTime? d) {
    if (d == null) return '';
    final s = DateTime.now().difference(d).inSeconds;
    if (s < 60) return 'just now';
    if (s < 3600) return '${s ~/ 60}m ago';
    if (s < 86400) return '${s ~/ 3600}h ago';
    if (s < 604800) return '${s ~/ 86400}d ago';
    return '${d.day}/${d.month}/${d.year}';
  }

  static (IconData, Color) _icon(AppNotification n) {
    switch (n.type) {
      case 'actuator':
        return (Icons.water_drop_outlined, Colors.blue);
      case 'daily':
        return (Icons.nightlight_outlined, Colors.indigo);
      default:
        return (
          n.severity == 'critical' ? Icons.error_outline : Icons.warning_amber_rounded,
          n.severity == 'critical' ? Colors.red : Colors.orange,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final svc = NotificationService();
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        backgroundColor: Colors.green[700],
        foregroundColor: Colors.white,
        actions: [
          TextButton(
            onPressed: () => svc.markAllRead(uid),
            child: const Text('Mark all read', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: StreamBuilder<List<AppNotification>>(
        stream: svc.watchNotifications(uid),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting && !snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final items = snap.data ?? [];
          if (items.isEmpty) {
            return Center(
              child: Text('You’re all caught up.',
                  style: TextStyle(color: cs.onSurface.withValues(alpha: 0.5))),
            );
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, _) => Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.4)),
            itemBuilder: (context, i) {
              final n = items[i];
              final (icon, color) = _icon(n);
              return ListTile(
                tileColor: n.isRead ? null : Colors.green.withValues(alpha: 0.06),
                leading: Icon(icon, color: color),
                title: Text(n.title,
                    style: TextStyle(fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(n.message),
                    const SizedBox(height: 2),
                    Text(_relative(n.createdAt),
                        style: TextStyle(fontSize: 11, color: cs.onSurface.withValues(alpha: 0.45))),
                  ],
                ),
                isThreeLine: true,
                onTap: () {
                  svc.markRead(n.id);
                  if (n.zoneId != null) {
                    Navigator.push(context,
                        MaterialPageRoute(builder: (_) => ZoneDetailScreen(zoneId: n.zoneId!)));
                  }
                },
              );
            },
          );
        },
      ),
    );
  }
}
