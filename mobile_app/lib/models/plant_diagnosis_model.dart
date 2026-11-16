import 'package:cloud_firestore/cloud_firestore.dart';

/// One AI diagnosis of a plant photo (plantDiagnoses/{id}), written only by the server.
class PlantDiagnosis {
  final String id;
  final String plantId;
  final String? imageUrl;
  final String? storagePath;
  final DateTime? createdAt;
  final String condition;
  final String severity;
  final double confidence;
  final String likelyCause;
  final String summary;
  final List<String> observations;
  final List<String> advice;

  const PlantDiagnosis({
    required this.id,
    required this.plantId,
    this.imageUrl,
    this.storagePath,
    this.createdAt,
    required this.condition,
    required this.severity,
    required this.confidence,
    required this.likelyCause,
    required this.summary,
    required this.observations,
    required this.advice,
  });

  factory PlantDiagnosis.fromDocument(DocumentSnapshot doc) {
    final map = doc.data() as Map<String, dynamic>? ?? {};
    List<String> strings(dynamic v) => v is List ? v.whereType<String>().toList() : const [];
    final created = map['createdAt'];
    return PlantDiagnosis(
      id: doc.id,
      plantId: map['plantId'] as String? ?? '',
      imageUrl: map['imageUrl'] as String?,
      storagePath: map['storagePath'] as String?,
      createdAt: created is Timestamp ? created.toDate() : null,
      condition: map['condition'] as String? ?? 'unclear',
      severity: map['severity'] as String? ?? 'none',
      confidence: (map['confidence'] as num?)?.toDouble() ?? 0,
      likelyCause: map['likelyCause'] as String? ?? '',
      summary: map['summary'] as String? ?? '',
      observations: strings(map['observations']),
      advice: strings(map['advice']),
    );
  }
}
