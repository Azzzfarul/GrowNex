import 'package:cloud_firestore/cloud_firestore.dart';

class SensorReading {
  final String id;
  final String? plantId;
  final num? moisture;
  final num? temperature;
  final num? humidity;
  final num? lightLevel;
  final DateTime? timestamp;

  SensorReading({
    required this.id,
    this.plantId,
    this.moisture,
    this.temperature,
    this.humidity,
    this.lightLevel,
    this.timestamp,
  });

  factory SensorReading.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return SensorReading.fromMap(doc.id, data);
  }

  factory SensorReading.fromMap(String id, Map<String, dynamic> map) {
    final tsValue = map['timestamp'];
    DateTime? timestamp;
    if (tsValue is Timestamp) {
      timestamp = tsValue.toDate();
    } else if (tsValue is DateTime) {
      timestamp = tsValue;
    }

    return SensorReading(
      id: id,
      plantId: map['plantId'] as String?,
      moisture: map['moisture'] as num?,
      temperature: map['temperature'] as num?,
      humidity: map['humidity'] as num?,
      lightLevel: map['lightLevel'] as num?,
      timestamp: timestamp,
    );
  }
}
