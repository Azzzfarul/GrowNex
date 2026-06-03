import 'package:cloud_firestore/cloud_firestore.dart';

class Device {
  final String id;
  final String userId;
  final String? assignedZoneId;
  final String deviceName;
  final String status;
  final int totalSlots;
  final bool hasLightingModule;
  final bool hasCameraModule;
  final bool hasFertilizerModule;
  final DateTime? lastSync;

  Device({
    required this.id,
    required this.userId,
    this.assignedZoneId,
    required this.deviceName,
    required this.status,
    required this.totalSlots,
    required this.hasLightingModule,
    required this.hasCameraModule,
    required this.hasFertilizerModule,
    this.lastSync,
  });

  factory Device.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return Device.fromMap(doc.id, data);
  }

  factory Device.fromMap(String id, Map<String, dynamic> map) {
    final lastSyncValue = map['lastSync'];
    DateTime? lastSync;
    if (lastSyncValue is Timestamp) lastSync = lastSyncValue.toDate();
    else if (lastSyncValue is DateTime) lastSync = lastSyncValue;

    return Device(
      id: id,
      userId: map['userId'] as String? ?? '',
      assignedZoneId: map['assignedZoneId'] as String?,
      deviceName: map['deviceName'] as String? ?? 'Device',
      status: map['status'] as String? ?? 'unknown',
      totalSlots: (map['totalSlots'] as num?)?.toInt() ?? 0,
      hasLightingModule: map['hasLightingModule'] as bool? ?? false,
      hasCameraModule: map['hasCameraModule'] as bool? ?? false,
      hasFertilizerModule: map['hasFertilizerModule'] as bool? ?? false,
      lastSync: lastSync,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'assignedZoneId': assignedZoneId,
      'deviceName': deviceName,
      'status': status,
      'totalSlots': totalSlots,
      'hasLightingModule': hasLightingModule,
      'hasCameraModule': hasCameraModule,
      'hasFertilizerModule': hasFertilizerModule,
      'lastSync': lastSync != null ? Timestamp.fromDate(lastSync!) : null,
    };
  }
}
