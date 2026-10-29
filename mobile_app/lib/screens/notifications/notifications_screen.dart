import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/notification_model.dart';
import '../../theme.dart';
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

  // Leading icon + its container colors, by notification type/severity
  static (IconData, Color, Color) _icon(BuildContext context, AppNotification n) {
    final cs = Theme.of(context).colorScheme;
    final app = AppColors.of(context);
    switch (n.type) {
      case 'actuator':
        return (Icons.water_drop_outlined, cs.tertiaryContainer, cs.onTertiaryContainer);
      case 'daily':
        return (Icons.nightlight_outlined, cs.secondaryContainer, cs.onSecondaryContainer);
      default:
        return n.severity == 'critical'
            ? (Icons.error_outline, cs.errorContainer, cs.onErrorContainer)
            : (Icons.warning_amber_rounded, app.warningContainer, app.onWarningContainer);
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
        actions: [
          TextButton(
            onPressed: () => svc.markAllRead(uid),
            child: const Text('Mark all read'),
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
                  style: TextStyle(color: cs.onSurfaceVariant)),
            );
          }
          return ListView.separated(
            itemCount: items.length,
            separatorBuilder: (_, _) => Divider(height: 1, color: cs.outlineVariant.withValues(alpha: 0.4)),
            itemBuilder: (context, i) {
              final tt = Theme.of(context).textTheme;
              final n = items[i];
              final (icon, bg, fg) = _icon(context, n);
              return ListTile(
                tileColor: n.isRead ? null : cs.secondaryContainer.withValues(alpha: 0.4),
                leading: CircleAvatar(backgroundColor: bg, foregroundColor: fg, child: Icon(icon)),
                title: Text(n.title,
                    style: TextStyle(fontWeight: n.isRead ? FontWeight.w400 : FontWeight.w600)),
                subtitle: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(n.message),
                    const SizedBox(height: 2),
                    Text(_relative(n.createdAt),
                        style: tt.labelSmall?.copyWith(color: cs.onSurfaceVariant)),
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
