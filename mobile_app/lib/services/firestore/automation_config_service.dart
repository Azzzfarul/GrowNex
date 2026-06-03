import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/automation_config_model.dart';

class AutomationConfigService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<AutomationConfig?> getConfig(String zoneId) async {
    final doc = await _firestore.collection('automationConfig').doc(zoneId).get();
    if (!doc.exists) return null;
    return AutomationConfig.fromDocument(doc);
  }

  Stream<AutomationConfig> watchConfig(String zoneId) {
    return _firestore
        .collection('automationConfig')
        .doc(zoneId)
        .snapshots()
        .map((doc) => doc.exists ? AutomationConfig.fromDocument(doc) : AutomationConfig());
  }

  Future<void> saveConfig(String zoneId, AutomationConfig config) async {
    await _firestore
        .collection('automationConfig')
        .doc(zoneId)
        .set(config.toMap(), SetOptions(merge: true));
  }
}
