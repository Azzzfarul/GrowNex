import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/device_model.dart';

/// Why [DeviceService.claimDevice] refused a claim. [message] is shown to the user as-is.
class DeviceClaimException implements Exception {
  final String message;
  const DeviceClaimException(this.message);

  @override
  String toString() => message;
}

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

  Stream<Device?> watchDevice(String deviceId) {
    return _firestore
        .collection('devices')
        .doc(deviceId)
        .snapshots()
        .map((doc) => doc.exists ? Device.fromDocument(doc) : null);
  }

  // The user's devices that aren't in a zone yet. Sensor/relay nodes go in a zone's Device card
  // (zones.deviceId) and cameras in its Camera card (zones.cameraDeviceId), so the lists are split.
  Future<List<Device>> getAvailableDevices(String userId) async {
    final devices = await _getUnassignedDevices(userId);
    return devices.where((d) => !d.isCamera).toList();
  }

  Future<List<Device>> getAvailableCameras(String userId) async {
    final devices = await _getUnassignedDevices(userId);
    return devices.where((d) => d.isCamera).toList();
  }

  Future<List<Device>> _getUnassignedDevices(String userId) async {
    final snap = await _firestore.collection('devices').where('userId', isEqualTo: userId).get();
    return snap.docs
        .map((d) => Device.fromDocument(d))
        .where((d) => d.assignedZoneId == null || d.assignedZoneId!.isEmpty)
        .toList();
  }

  // Discovery for the Add Device screen. The bridge creates devices/{id} with userId '' on a
  // device's first MQTT message, so unclaimed devices are already listed. Only online ones are
  // returned (status is retained + LWT) so stale/test docs don't clutter the list; anything else
  // uses the type-the-ID fallback. Most recently synced first.
  Stream<List<Device>> watchUnclaimedDevices() {
    return _firestore
        .collection('devices')
        .where('userId', isEqualTo: '')
        .snapshots()
        .map((snap) {
      final devices = snap.docs
          .map((d) => Device.fromDocument(d))
          .where((d) => d.status == 'online')
          .toList();
      devices.sort((a, b) => (b.lastSync?.millisecondsSinceEpoch ?? 0)
          .compareTo(a.lastSync?.millisecondsSinceEpoch ?? 0));
      return devices;
    });
  }

  Future<void> unassignDevice(String deviceId) async {
    await _firestore.collection('devices').doc(deviceId).update({'assignedZoneId': null});
  }

  // Writes only the fields the user edits. status, lastSync and totalSlots come from the bridge,
  // and the *Active fields are actuator intents, so they must not be overwritten here.
  Future<void> updateDeviceInfo(
    String deviceId, {
    required String deviceName,
    required bool hasLightingModule,
    required bool hasFertilizerModule,
  }) async {
    await _firestore.collection('devices').doc(deviceId).update({
      'deviceName': deviceName,
      'hasLightingModule': hasLightingModule,
      'hasFertilizerModule': hasFertilizerModule,
    });
  }

  Future<void> deleteDevice(String deviceId, {String? assignedZoneId, bool isCamera = false}) async {
    if (assignedZoneId != null && assignedZoneId.isNotEmpty) {
      await _firestore.collection('zones').doc(assignedZoneId).update(isCamera
          ? {'cameraDeviceId': null}
          : {'deviceId': null, 'hasFertilizer': false, 'hasLight': false});
    }
    await _firestore.collection('devices').doc(deviceId).delete();
  }

  // Transaction so two users claiming the same listed device can't both win.
  // Throws [DeviceClaimException] when the device is gone or someone else owns it.
  Future<void> claimDevice(
    String deviceId,
    String userId, {
    bool hasLightingModule = false,
    bool hasFertilizerModule = false,
  }) async {
    final ref = _firestore.collection('devices').doc(deviceId);
    await _firestore.runTransaction((tx) async {
      final snap = await tx.get(ref);
      if (!snap.exists) throw const DeviceClaimException('This device no longer exists.');
      final owner = snap.data()?['userId'] as String? ?? '';
      if (owner.isNotEmpty && owner != userId) {
        throw const DeviceClaimException('This device was just claimed by another account.');
      }
      tx.update(ref, {
        'userId': userId,
        'hasLightingModule': hasLightingModule,
        'hasFertilizerModule': hasFertilizerModule,
      });
    });
  }

  Future<void> assignDeviceToZone(String deviceId, String zoneId, String userId) async {
    await _firestore.collection('devices').doc(deviceId).set(
      {'assignedZoneId': zoneId, 'userId': userId},
      SetOptions(merge: true),
    );
  }

  Future<void> updateDeviceStatus(String deviceId, String status) async {
    await _firestore.collection('devices').doc(deviceId).set({'status': status, 'lastSync': Timestamp.now()}, SetOptions(merge: true));
  }

  Future<void> updateIrrigationState(String deviceId, bool state) async {
    await _firestore.collection('devices').doc(deviceId).update({'irrigationActive': state});
  }

  Future<void> updateFertilizerState(String deviceId, bool state) async {
    await _firestore.collection('devices').doc(deviceId).update({'fertilizerActive': state});
  }

  Future<void> updateLightState(String deviceId, bool state) async {
    await _firestore.collection('devices').doc(deviceId).update({'lightActive': state});
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
