import 'package:cloud_firestore/cloud_firestore.dart';

class Zone {
  final String id;
  final String userId;
  final String zoneName;
  final String zoneType;
  final String status;
  final String? zonePhotoUrl;
  final String? deviceId;
  final String? cameraDeviceId;
  final num? latestTemp;
  final num? latestHumid;
  final num? latestLight;
  final num? latestMoisture;
  final DateTime? latestTimestamp;
  final String? alertSummary;
  final DateTime? createdAt;
  final bool hasFertilizer;
  final bool hasLight;
  final bool? deviceOnline;
  // Owner + the users the owner added (written by the server); { uid: email } for display.
  final List<String> memberIds;
  final Map<String, String> members;

  /// Everyone who can use the zone; zones from before sharing have no memberIds.
  List<String> get allMemberIds => memberIds.isNotEmpty ? memberIds : [userId];

  Zone({
    required this.id,
    required this.userId,
    required this.zoneName,
    required this.zoneType,
    required this.status,
    this.zonePhotoUrl,
    this.deviceId,
    this.cameraDeviceId,
    this.latestTemp,
    this.latestHumid,
    this.latestLight,
    this.latestMoisture,
    this.latestTimestamp,
    this.alertSummary,
    this.createdAt,
    this.hasFertilizer = false,
    this.hasLight = false,
    this.deviceOnline,
    this.memberIds = const [],
    this.members = const {},
  });

  factory Zone.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return Zone.fromMap(doc.id, data);
  }

  static num? _n(dynamic v) {
    if (v == null) return null;
    if (v is num) return v;
    if (v is String) return num.tryParse(v);
    return null;
  }

  factory Zone.fromMap(String id, Map<String, dynamic> map) {
    final createdAtValue = map['createdAt'];
    DateTime? createdAt;

    if (createdAtValue is Timestamp) {
      createdAt = createdAtValue.toDate();
    } else if (createdAtValue is DateTime) {
      createdAt = createdAtValue;
    }

    final cameraDeviceIdValue = map['cameraDeviceId'];

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
      zonePhotoUrl: map['zonePhotoUrl'] as String?,
      deviceId: map['deviceId'] as String?,
      // Empty counts as "no camera", as on the web.
      cameraDeviceId: cameraDeviceIdValue is String && cameraDeviceIdValue.isNotEmpty
          ? cameraDeviceIdValue
          : null,
      latestTemp: _n(map['latestTemp']),
      latestHumid: _n(map['latestHumid']),
      latestLight: _n(map['latestLight']),
      latestMoisture:  _n(map['latestMoisture']),
      latestTimestamp: latestTimestamp,
      alertSummary: map['alertSummary'] as String?,
      createdAt: createdAt,
      hasFertilizer: map['hasFertilizer'] as bool? ?? false,
      hasLight: map['hasLight'] as bool? ?? false,
      deviceOnline: map['deviceOnline'] as bool?,
      memberIds: (map['memberIds'] as List?)?.whereType<String>().toList() ?? const [],
      members: (map['members'] as Map?)?.map((k, v) => MapEntry('$k', '$v')) ?? const {},
    );
  }

  // cameraDeviceId is left out on purpose: only the Camera card's assign/remove writes it.
  Map<String, dynamic> toMap() {
    return {
      'userId': userId,
      'memberIds': memberIds,
      'members': members,
      'zoneName': zoneName,
      'zoneType': zoneType,
      'status': status,
      'zonePhotoUrl': zonePhotoUrl,
      'deviceId': deviceId,
      'latestTemp': latestTemp,
      'latestHumid': latestHumid,
      'latestLight': latestLight,
      'latestMoisture':  latestMoisture,
      'latestTimestamp': latestTimestamp != null ? Timestamp.fromDate(latestTimestamp!) : null,
      'alertSummary': alertSummary,
      'createdAt': createdAt != null ? Timestamp.fromDate(createdAt!) : null,
      'hasFertilizer': hasFertilizer,
      'hasLight': hasLight,
    };
  }
}
