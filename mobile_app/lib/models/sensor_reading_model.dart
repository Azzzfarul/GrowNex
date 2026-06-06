import 'package:cloud_firestore/cloud_firestore.dart';

class SensorReading {
  final String id;
  final String? plantId;
  final num? moisture;
  final num? soilMoisture1;
  final num? soilMoisture2;
  final num? soilMoisture3;
  final num? soilMoisture4;
  final num? temperature;
  final num? humidity;
  final num? lightLevel;
  final DateTime? timestamp;

  SensorReading({
    required this.id,
    this.plantId,
    this.moisture,
    this.soilMoisture1,
    this.soilMoisture2,
    this.soilMoisture3,
    this.soilMoisture4,
    this.temperature,
    this.humidity,
    this.lightLevel,
    this.timestamp,
  });

  num? moistureForSlot(int slot) {
    switch (slot) {
      case 1: return soilMoisture1;
      case 2: return soilMoisture2;
      case 3: return soilMoisture3;
      case 4: return soilMoisture4;
      default: return null;
    }
  }

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
      id:            id,
      plantId:       map['plantId']       as String?,
      moisture:      map['moisture']      as num?,
      soilMoisture1: map['soilMoisture1'] as num?,
      soilMoisture2: map['soilMoisture2'] as num?,
      soilMoisture3: map['soilMoisture3'] as num?,
      soilMoisture4: map['soilMoisture4'] as num?,
      temperature:   map['temperature']   as num?,
      humidity:      map['humidity']      as num?,
      lightLevel:    map['lightLevel']    as num?,
      timestamp:     timestamp,
    );
  }
}
