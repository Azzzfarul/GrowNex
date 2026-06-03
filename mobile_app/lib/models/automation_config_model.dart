import 'package:cloud_firestore/cloud_firestore.dart';

class AutomationConfig {
  final bool autoWateringEnabled;
  final num? wateringThreshold;
  final bool autoLightingEnabled;
  final String? lightingSchedule;
  final bool autoFertilizingEnabled;
  final String? fertilizingSchedule;
  final bool aiRecommended;

  AutomationConfig({
    this.autoWateringEnabled = false,
    this.wateringThreshold,
    this.autoLightingEnabled = false,
    this.lightingSchedule,
    this.autoFertilizingEnabled = false,
    this.fertilizingSchedule,
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
      autoLightingEnabled: map['autoLightingEnabled'] as bool? ?? false,
      lightingSchedule: map['lightingSchedule'] as String?,
      autoFertilizingEnabled: map['autoFertilizingEnabled'] as bool? ?? false,
      fertilizingSchedule: map['fertilizingSchedule'] as String?,
      aiRecommended: map['aiRecommended'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'autoWateringEnabled': autoWateringEnabled,
      'wateringThreshold': wateringThreshold,
      'autoLightingEnabled': autoLightingEnabled,
      'lightingSchedule': lightingSchedule,
      'autoFertilizingEnabled': autoFertilizingEnabled,
      'fertilizingSchedule': fertilizingSchedule,
      'aiRecommended': aiRecommended,
    };
  }
}
