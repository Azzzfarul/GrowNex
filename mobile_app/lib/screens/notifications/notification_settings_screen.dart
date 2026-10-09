import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../services/firestore/notification_service.dart';

class NotificationSettingsScreen extends StatelessWidget {
  const NotificationSettingsScreen({super.key});

  static const _types = [
    ('threshold', 'Zone alerts', 'When a zone’s conditions go out of range'),
    ('actuator', 'Actuator activity', 'When automation waters, lights or feeds a zone'),
    ('daily', 'Daily summary', 'An evening recap of every zone'),
  ];

  @override
  Widget build(BuildContext context) {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final svc = NotificationService();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        backgroundColor: Colors.green[700],
        foregroundColor: Colors.white,
      ),
      body: StreamBuilder<Map<String, dynamic>>(
        stream: svc.watchPrefs(uid),
        builder: (context, snap) {
          if (snap.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          final prefs = snap.data ?? const {};
          bool on(String k) => prefs[k] != false; // absent = enabled

          return ListView(
            padding: const EdgeInsets.symmetric(vertical: 8),
            children: [
              const Padding(
                padding: EdgeInsets.fromLTRB(16, 12, 16, 4),
                child: Text('Choose what you get notified about.',
                    style: TextStyle(color: Colors.black54, fontSize: 13)),
              ),
              for (final (key, label, hint) in _types)
                SwitchListTile(
                  value: on(key),
                  activeThumbColor: Colors.green[700],
                  title: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(hint),
                  onChanged: (v) => svc.savePrefs(uid, {
                    'threshold': key == 'threshold' ? v : on('threshold'),
                    'actuator': key == 'actuator' ? v : on('actuator'),
                    'daily': key == 'daily' ? v : on('daily'),
                  }),
                ),
            ],
          );
        },
      ),
    );
  }
}
