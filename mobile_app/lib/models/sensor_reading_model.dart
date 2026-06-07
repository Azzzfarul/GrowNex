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

  static num? _n(dynamic v) {
    if (v == null) return null;
    if (v is num) return v;
    if (v is String) return num.tryParse(v);
    return null;
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
      moisture:      _n(map['moisture']),
      soilMoisture1: _n(map['soilMoisture1']),
      soilMoisture2: _n(map['soilMoisture2']),
      soilMoisture3: _n(map['soilMoisture3']),
      soilMoisture4: _n(map['soilMoisture4']),
      temperature:   _n(map['temperature']),
      humidity:      _n(map['humidity']),
      lightLevel:    _n(map['lightLevel']),
      timestamp:     timestamp,
    );
  }
}
