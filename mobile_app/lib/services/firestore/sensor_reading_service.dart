import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/sensor_reading_model.dart';

class SensorReadingService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Stream<SensorReading?> watchLatestReading(String zoneId) {
    return _firestore
        .collection('zones')
        .doc(zoneId)
        .collection('sensorReadings')
        .orderBy('timestamp', descending: true)
        .limit(1)
        .snapshots()
        .map((snap) => snap.docs.isEmpty ? null : SensorReading.fromDocument(snap.docs.first));
  }
}
