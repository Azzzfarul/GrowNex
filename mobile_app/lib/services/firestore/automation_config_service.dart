import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/automation_config_model.dart';

class AutomationConfigService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<AutomationConfig?> getConfig(String zoneId) async {
    final doc = await _firestore.collection('automationConfig').doc(zoneId).get();
    if (!doc.exists) return null;
    return AutomationConfig.fromDocument(doc);
  }

  // Merges only [fields] — a toggle must not rewrite the whole config.
  Future<void> saveFields(String zoneId, Map<String, dynamic> fields) =>
      _firestore.collection('automationConfig').doc(zoneId).set(fields, SetOptions(merge: true));

  Future<void> saveConfig(String zoneId, AutomationConfig config) async {
    await _firestore
        .collection('automationConfig')
        .doc(zoneId)
        .set(config.toMap(), SetOptions(merge: true));
  }
}
