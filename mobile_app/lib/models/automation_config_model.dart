import 'package:cloud_firestore/cloud_firestore.dart';

import '../utils/schedules.dart';

class AutomationConfig {
  final bool autoWateringEnabled;
  final num? wateringThreshold;
  final List<String> wateringSchedule;
  final int? wateringDuration;
  final bool autoLightingEnabled;
  final List<String> lightingSchedule;
  final bool autoFertilizingEnabled;
  final List<String> fertilizingSchedule;
  final int? fertilizingDuration;
  final bool aiRecommended;

  AutomationConfig({
    this.autoWateringEnabled = false,
    this.wateringThreshold,
    this.wateringSchedule = const [],
    this.wateringDuration,
    this.autoLightingEnabled = false,
    this.lightingSchedule = const [],
    this.autoFertilizingEnabled = false,
    this.fertilizingSchedule = const [],
    this.fertilizingDuration,
    this.aiRecommended = false,
  });

  factory AutomationConfig.fromDocument(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>? ?? {};
    return AutomationConfig.fromMap(data);
  }

  factory AutomationConfig.fromMap(Map<String, dynamic> map) {
    return AutomationConfig(
      autoWateringEnabled: map['autoWateringEnabled'] as bool? ?? false,
      wateringThreshold: map['wateringThreshold'] as num?,
      wateringSchedule: scheduleList(map['wateringSchedule']),
      wateringDuration: map['wateringDuration'] as int?,
      autoLightingEnabled: map['autoLightingEnabled'] as bool? ?? false,
      lightingSchedule: scheduleList(map['lightingSchedule']),
      autoFertilizingEnabled: map['autoFertilizingEnabled'] as bool? ?? false,
      fertilizingSchedule: scheduleList(map['fertilizingSchedule']),
      fertilizingDuration: map['fertilizingDuration'] as int?,
      aiRecommended: map['aiRecommended'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'autoWateringEnabled': autoWateringEnabled,
      'wateringThreshold': wateringThreshold,
      'wateringSchedule': wateringSchedule,
      'wateringDuration': wateringDuration,
      'autoLightingEnabled': autoLightingEnabled,
      'lightingSchedule': lightingSchedule,
      'autoFertilizingEnabled': autoFertilizingEnabled,
      'fertilizingSchedule': fertilizingSchedule,
      'fertilizingDuration': fertilizingDuration,
      'aiRecommended': aiRecommended,
    };
  }
}
