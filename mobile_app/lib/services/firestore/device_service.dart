import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/device_model.dart';

class DeviceService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> createDevice(Device device) async {
    final docRef = await _firestore.collection('devices').add(device.toMap());
    return docRef.id;
  }

  Future<Device?> getDevice(String deviceId) async {
    final doc = await _firestore.collection('devices').doc(deviceId).get();
    if (!doc.exists) return null;
    return Device.fromDocument(doc);
  }

  Future<void> assignDeviceToZone(String deviceId, String zoneId) async {
    await _firestore.collection('devices').doc(deviceId).set({'assignedZoneId': zoneId}, SetOptions(merge: true));
  }

  Future<void> updateDeviceStatus(String deviceId, String status) async {
    await _firestore.collection('devices').doc(deviceId).set({'status': status, 'lastSync': Timestamp.now()}, SetOptions(merge: true));
  }

  Stream<List<Device>> watchDevices(String userId) {
    return _firestore
        .collection('devices')
        .where('userId', isEqualTo: userId)
        .orderBy('lastSync', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((d) => Device.fromDocument(d)).toList());
  }
}
