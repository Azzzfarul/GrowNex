import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/zone_model.dart';

class ZoneService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> createZone(Zone zone) async {
    final docRef = await _firestore.collection('zones').add(zone.toMap());
    return docRef.id;
  }

  Future<void> updateZone(Zone zone) async {
    if (zone.id.isEmpty) throw ArgumentError('Zone id is required');
    await _firestore.collection('zones').doc(zone.id).update(zone.toMap());
  }

  Future<void> deleteZone(String zoneId) async {
    await _firestore.collection('zones').doc(zoneId).delete();
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

  Stream<Zone?> watchZone(String zoneId) {
    return _firestore
        .collection('zones')
        .doc(zoneId)
        .snapshots()
        .map((doc) => doc.exists ? Zone.fromDocument(doc) : null);
  }

  Future<void> updateLatestSensor(String zoneId,
      {num? latestTemp,
      num? latestHumid,
      num? latestLight,
      num? latestMoisture,
      DateTime? latestTimestamp}) async {
    final data = <String, dynamic>{};
    if (latestTemp != null) data['latestTemp'] = latestTemp;
    if (latestHumid != null) data['latestHumid'] = latestHumid;
    if (latestLight != null) data['latestLight'] = latestLight;
    if (latestMoisture != null) data['latestMoisture'] = latestMoisture;
    if (latestTimestamp != null) data['latestTimestamp'] = Timestamp.fromDate(latestTimestamp);

    if (data.isEmpty) return;

    await _firestore.collection('zones').doc(zoneId).set(data, SetOptions(merge: true));
  }
}
