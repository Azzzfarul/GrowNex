import 'package:cloud_firestore/cloud_firestore.dart';

class Plant {
  final String id;
  final String zoneId;
  final String plantName;
  final String species;
  final String status;
  final int slotNumber;
  final num? preferredMoistureMin;
  final num? preferredMoistureMax;
  final num? preferredHumidityMin;
  final num? preferredHumidityMax;
  final num? preferredTemperatureMin;
  final num? preferredTemperatureMax;
  final String? preferredLightCondition;
  final String? notes;
  final DateTime? createdAt;

  Plant({
    required this.id,
    required this.zoneId,
    required this.plantName,
    required this.species,
    required this.status,
    required this.slotNumber,
    this.preferredMoistureMin,
    this.preferredMoistureMax,
    this.preferredHumidityMin,
    this.preferredHumidityMax,
    this.preferredTemperatureMin,
    this.preferredTemperatureMax,
    this.preferredLightCondition,
    this.notes,
    this.createdAt,
  });

  factory Plant.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return Plant.fromMap(doc.id, data);
  }

  static num? _n(dynamic v) {
    if (v == null) return null;
    if (v is num) return v;
    if (v is String) return num.tryParse(v);
    return null;
  }

  factory Plant.fromMap(String id, Map<String, dynamic> map) {
    final createdAtValue = map['createdAt'];
    DateTime? createdAt;

    if (createdAtValue is Timestamp) {
      createdAt = createdAtValue.toDate();
    } else if (createdAtValue is DateTime) {
      createdAt = createdAtValue;
    }

    return Plant(
      id: id,
      zoneId: map['zoneId'] as String? ?? '',
      plantName: map['plantName'] as String? ?? 'Unknown',
      species: map['species'] as String? ?? '',
      status: map['status'] as String? ?? 'unknown',
      slotNumber: _n(map['slotNumber'])?.toInt() ?? 0,
      preferredMoistureMin: _n(map['preferredMoistureMin']),
      preferredMoistureMax: _n(map['preferredMoistureMax']),
      preferredHumidityMin: _n(map['preferredHumidityMin']),
      preferredHumidityMax: _n(map['preferredHumidityMax']),
      preferredTemperatureMin: _n(map['preferredTemperatureMin']),
      preferredTemperatureMax: _n(map['preferredTemperatureMax']),
      preferredLightCondition: map['preferredLightCondition'] as String?,
      notes: map['notes'] as String?,
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'zoneId': zoneId,
      'plantName': plantName,
      'species': species,
      'status': status,
      'slotNumber': slotNumber,
      'preferredMoistureMin': preferredMoistureMin,
      'preferredMoistureMax': preferredMoistureMax,
      'preferredHumidityMin': preferredHumidityMin,
      'preferredHumidityMax': preferredHumidityMax,
      'preferredTemperatureMin': preferredTemperatureMin,
      'preferredTemperatureMax': preferredTemperatureMax,
      'preferredLightCondition': preferredLightCondition,
      'notes': notes,
      'createdAt': createdAt != null ? Timestamp.fromDate(createdAt!) : null,
    };
  }
}
