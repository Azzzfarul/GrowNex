import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/zone_model.dart';

class ZoneService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  DocumentReference<Map<String, dynamic>> newZoneRef() => _firestore.collection('zones').doc();

  Future<void> createZoneWithId(Zone zone) async {
    if (zone.id.isEmpty) throw ArgumentError('Zone id is required');
    await _firestore.collection('zones').doc(zone.id).set(zone.toMap());
  }

  // Clients can't list subcollections, so name them all (automationHistory is legacy data). Keep in
  // step with web ZoneDetailPage.jsx; the server's account deletion uses recursiveDelete.
  static const zoneSubcollections = ['sensorReadings', 'stats', 'aiCache', 'snapshots', 'automationHistory'];

  // Zone doc plus its subcollections. Delete Storage files (snapshots) before calling this.
  Future<void> deleteZone(String zoneId) async {
    final zoneRef = _firestore.collection('zones').doc(zoneId);
    for (final sub in zoneSubcollections) {
      // Batched, so a week of readings (~10k docs) takes seconds rather than minutes.
      while (true) {
        final snap = await zoneRef.collection(sub).limit(400).get();
        if (snap.docs.isEmpty) break;
        final batch = _firestore.batch();
        for (final d in snap.docs) {
          batch.delete(d.reference);
        }
        await batch.commit();
      }
    }
    await zoneRef.delete();
  }

  Stream<List<Zone>> watchZones(String userId) {
    return _firestore
        .collection('zones')
        .where('userId', isEqualTo: userId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((d) => Zone.fromDocument(d)).toList());
  }

  Future<Zone?> getZone(String zoneId) async {
    final doc = await _firestore.collection('zones').doc(zoneId).get();
    if (!doc.exists) return null;
    return Zone.fromDocument(doc);
  }

  Future<void> updateZoneDevice(String zoneId, String? deviceId, {bool hasFertilizer = false, bool hasLight = false, int totalPlantSlots = 0}) async {
    await _firestore.collection('zones').doc(zoneId).update({
      'deviceId': deviceId,
      'hasFertilizer': deviceId != null ? hasFertilizer : false,
      'hasLight': deviceId != null ? hasLight : false,
      'totalPlantSlots': deviceId != null ? totalPlantSlots : 0,
    });
  }

  // The zone's ESP32-CAM. Keep it in step with the camera's devices.assignedZoneId.
  Future<void> updateZoneCamera(String zoneId, String? cameraDeviceId) async {
    await _firestore.collection('zones').doc(zoneId).update({'cameraDeviceId': cameraDeviceId});
  }

  Stream<Zone?> watchZone(String zoneId) {
    return _firestore
        .collection('zones')
        .doc(zoneId)
        .snapshots()
        .map((doc) => doc.exists ? Zone.fromDocument(doc) : null);
  }
}
