import 'package:cloud_firestore/cloud_firestore.dart';

class Device {
  final String id;
  final String userId;
  final String? assignedZoneId;
  final String deviceName;
  final String deviceType;
  final String status;
  final int totalSlots;
  final bool hasLightingModule;
  final bool hasFertilizerModule;
  final bool irrigationActive;
  final bool fertilizerActive;
  final bool lightActive;
  final DateTime? lastSync;

  Device({
    required this.id,
    required this.userId,
    this.assignedZoneId,
    required this.deviceName,
    required this.deviceType,
    required this.status,
    this.totalSlots = 4,
    required this.hasLightingModule,
    required this.hasFertilizerModule,
    this.irrigationActive = false,
    this.fertilizerActive = false,
    this.lightActive = false,
    this.lastSync,
  });

  factory Device.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return Device.fromMap(doc.id, data);
  }

  factory Device.fromMap(String id, Map<String, dynamic> map) {
    final lastSyncValue = map['lastSync'];
    DateTime? lastSync;
    if (lastSyncValue is Timestamp) {
      lastSync = lastSyncValue.toDate();
    } else if (lastSyncValue is DateTime) {
      lastSync = lastSyncValue;
    }

    return Device(
      id: id,
      userId: map['userId'] as String? ?? '',
      assignedZoneId: map['assignedZoneId'] as String?,
      deviceName: map['deviceName'] as String? ?? 'Device',
      deviceType: map['deviceType'] as String? ?? 'indoor',
      status: map['status'] as String? ?? 'offline',
      totalSlots: (map['totalSlots'] as num?)?.toInt() ?? 4,
      hasLightingModule: map['hasLightingModule'] as bool? ?? false,
      hasFertilizerModule: map['hasFertilizerModule'] as bool? ?? false,
      irrigationActive: map['irrigationActive'] as bool? ?? false,
      fertilizerActive: map['fertilizerActive'] as bool? ?? false,
      lightActive: map['lightActive'] as bool? ?? false,
      lastSync: lastSync,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'assignedZoneId': assignedZoneId,
      'deviceName': deviceName,
      'deviceType': deviceType,
      'status': status,
      'totalSlots': totalSlots,
      'hasLightingModule': hasLightingModule,
      'hasFertilizerModule': hasFertilizerModule,
      'irrigationActive': irrigationActive,
      'fertilizerActive': fertilizerActive,
      'lightActive': lightActive,
      'lastSync': lastSync != null ? Timestamp.fromDate(lastSync!) : null,
    };
  }
}
