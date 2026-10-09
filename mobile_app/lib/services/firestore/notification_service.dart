import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/notification_model.dart';

class NotificationService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Stream<List<AppNotification>> watchNotifications(String userId) {
    return _firestore
        .collection('notifications')
        .where('userId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .limit(50)
        .snapshots()
        .map((snap) => snap.docs.map(AppNotification.fromDocument).toList());
  }

  Future<void> markRead(String id) =>
      _firestore.collection('notifications').doc(id).update({'isRead': true});

  Future<void> markAllRead(String userId) async {
    final snap = await _firestore
        .collection('notifications')
        .where('userId', isEqualTo: userId)
        .where('isRead', isEqualTo: false)
        .get();
    if (snap.docs.isEmpty) return;
    final batch = _firestore.batch();
    for (final d in snap.docs) {
      batch.update(d.reference, {'isRead': true});
    }
    await batch.commit();
  }

  // users/{uid}.notificationPrefs — { threshold, actuator, daily }; absent = enabled.
  Stream<Map<String, dynamic>> watchPrefs(String userId) {
    return _firestore.collection('users').doc(userId).snapshots().map((doc) {
      final p = (doc.data()?['notificationPrefs']) as Map<String, dynamic>?;
      return p ?? const {};
    });
  }

  Future<void> savePrefs(String userId, Map<String, bool> prefs) {
    return _firestore
        .collection('users')
        .doc(userId)
        .set({'notificationPrefs': prefs}, SetOptions(merge: true));
  }
}
