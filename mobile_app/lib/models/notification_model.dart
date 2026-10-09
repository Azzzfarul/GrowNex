import 'package:cloud_firestore/cloud_firestore.dart';

class AppNotification {
  final String id;
  final String userId;
  final String? zoneId;
  final String? zoneName;
  final String type;      // 'threshold' | 'actuator' | 'daily'
  final String severity;  // 'info' | 'warn' | 'critical'
  final String title;
  final String message;
  final bool isRead;
  final DateTime? createdAt;

  AppNotification({
    required this.id,
    required this.userId,
    this.zoneId,
    this.zoneName,
    required this.type,
    required this.severity,
    required this.title,
    required this.message,
    this.isRead = false,
    this.createdAt,
  });

  factory AppNotification.fromDocument(DocumentSnapshot doc) {
    final m = doc.data() as Map<String, dynamic>? ?? {};
    final created = m['createdAt'];
    return AppNotification(
      id: doc.id,
      userId: m['userId'] as String? ?? '',
      zoneId: m['zoneId'] as String?,
      zoneName: m['zoneName'] as String?,
      type: m['type'] as String? ?? 'info',
      severity: m['severity'] as String? ?? 'info',
      title: m['title'] as String? ?? '',
      message: m['message'] as String? ?? '',
      isRead: m['isRead'] as bool? ?? false,
      createdAt: created is Timestamp ? created.toDate() : (created is DateTime ? created : null),
    );
  }
}
