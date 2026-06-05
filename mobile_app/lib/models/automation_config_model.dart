import 'package:cloud_firestore/cloud_firestore.dart';

class AutomationConfig {
  final bool autoWateringEnabled;
  final num? wateringThreshold;
  final String? wateringSchedule;
  final int? wateringDuration;
  final bool autoLightingEnabled;
  final String? lightingSchedule;
  final bool autoFertilizingEnabled;
  final String? fertilizingSchedule;
  final int? fertilizingDuration;
  final bool aiRecommended;

  AutomationConfig({
    this.autoWateringEnabled = false,
    this.wateringThreshold,
    this.wateringSchedule,
    this.wateringDuration,
    this.autoLightingEnabled = false,
    this.lightingSchedule,
    this.autoFertilizingEnabled = false,
    this.fertilizingSchedule,
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
      wateringSchedule: map['wateringSchedule'] as String?,
      wateringDuration: map['wateringDuration'] as int?,
      autoLightingEnabled: map['autoLightingEnabled'] as bool? ?? false,
      lightingSchedule: map['lightingSchedule'] as String?,
      autoFertilizingEnabled: map['autoFertilizingEnabled'] as bool? ?? false,
      fertilizingSchedule: map['fertilizingSchedule'] as String?,
      fertilizingDuration: map['fertilizingDuration'] as int?,
      aiRecommended: map['aiRecommended'] as bool? ?? false,
    );
  }

  AutomationConfig copyWith({
    bool? autoWateringEnabled,
    num? wateringThreshold,
    String? wateringSchedule,
    int? wateringDuration,
    bool? autoLightingEnabled,
    String? lightingSchedule,
    bool? autoFertilizingEnabled,
    String? fertilizingSchedule,
    int? fertilizingDuration,
    bool? aiRecommended,
  }) {
    return AutomationConfig(
      autoWateringEnabled:    autoWateringEnabled    ?? this.autoWateringEnabled,
      wateringThreshold:      wateringThreshold      ?? this.wateringThreshold,
      wateringSchedule:       wateringSchedule       ?? this.wateringSchedule,
      wateringDuration:       wateringDuration       ?? this.wateringDuration,
      autoLightingEnabled:    autoLightingEnabled    ?? this.autoLightingEnabled,
      lightingSchedule:       lightingSchedule       ?? this.lightingSchedule,
      autoFertilizingEnabled: autoFertilizingEnabled ?? this.autoFertilizingEnabled,
      fertilizingSchedule:    fertilizingSchedule    ?? this.fertilizingSchedule,
      fertilizingDuration:    fertilizingDuration    ?? this.fertilizingDuration,
      aiRecommended:          aiRecommended          ?? this.aiRecommended,
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
