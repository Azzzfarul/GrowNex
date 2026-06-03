import 'package:cloud_firestore/cloud_firestore.dart';

class Zone {
  final String id;
  final String userId;
  final String zoneName;
  final String zoneType;
  final String status;
  final int totalPlantSlots;
  final String? zonePhotoUrl;
  final String? deviceId;
  final num? latestTemp;
  final num? latestHumid;
  final num? latestLight;
  final num? latestMoisture;
  final DateTime? latestTimestamp;
  final String? alertSummary;
  final DateTime? createdAt;

  Zone({
    required this.id,
    required this.userId,
    required this.zoneName,
    required this.zoneType,
    required this.status,
    required this.totalPlantSlots,
    this.zonePhotoUrl,
    this.deviceId,
    this.latestTemp,
    this.latestHumid,
    this.latestLight,
    this.latestMoisture,
    this.latestTimestamp,
    this.alertSummary,
    this.createdAt,
  });

  factory Zone.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return Zone.fromMap(doc.id, data);
  }

  factory Zone.fromMap(String id, Map<String, dynamic> map) {
    final createdAtValue = map['createdAt'];
    DateTime? createdAt;

    if (createdAtValue is Timestamp) {
      createdAt = createdAtValue.toDate();
    } else if (createdAtValue is DateTime) {
      createdAt = createdAtValue;
    }

    final latestTimestampValue = map['latestTimestamp'];
    DateTime? latestTimestamp;

    if (latestTimestampValue is Timestamp) {
      latestTimestamp = latestTimestampValue.toDate();
    } else if (latestTimestampValue is DateTime) {
      latestTimestamp = latestTimestampValue;
    }

    return Zone(
      id: id,
      userId: map['userId'] as String? ?? '',
      zoneName: map['zoneName'] as String? ?? 'Unnamed Zone',
      zoneType: map['zoneType'] as String? ?? 'unknown',
      status: map['status'] as String? ?? 'unknown',
      totalPlantSlots: (map['totalPlantSlots'] as num?)?.toInt() ?? 0,
      zonePhotoUrl: map['zonePhotoUrl'] as String?,
      deviceId: map['deviceId'] as String?,
      latestTemp: map['latestTemp'] as num?,
      latestHumid: map['latestHumid'] as num?,
      latestLight: map['latestLight'] as num?,
      latestMoisture: map['latestMoisture'] as num?,
      latestTimestamp: latestTimestamp,
      alertSummary: map['alertSummary'] as String?,
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'zoneName': zoneName,
      'zoneType': zoneType,
      'status': status,
      'totalPlantSlots': totalPlantSlots,
      'zonePhotoUrl': zonePhotoUrl,
      'deviceId': deviceId,
      'latestTemp': latestTemp,
      'latestHumid': latestHumid,
      'latestLight': latestLight,
      'latestMoisture': latestMoisture,
      'latestTimestamp': latestTimestamp != null ? Timestamp.fromDate(latestTimestamp!) : null,
      'alertSummary': alertSummary,
      'createdAt': createdAt != null ? Timestamp.fromDate(createdAt!) : null,
    };
  }
}
