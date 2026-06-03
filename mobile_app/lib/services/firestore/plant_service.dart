import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/plant_model.dart';

class PlantService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> createPlant(Plant plant) async {
    final docRef = await _firestore.collection('plants').add(plant.toMap());
    return docRef.id;
  }

  Future<void> updatePlant(Plant plant) async {
    if (plant.id.isEmpty) throw ArgumentError('Plant id is required');
    await _firestore.collection('plants').doc(plant.id).update(plant.toMap());
  }

  Future<void> deletePlant(String plantId) async {
    await _firestore.collection('plants').doc(plantId).delete();
  }

  Future<List<Plant>> getPlantsByZone(String zoneId) async {
    final snap = await _firestore.collection('plants').where('zoneId', isEqualTo: zoneId).get();
    return snap.docs.map((d) => Plant.fromDocument(d)).toList();
  }

  Stream<List<Plant>> watchPlantsByZone(String zoneId) {
    return _firestore
        .collection('plants')
        .where('zoneId', isEqualTo: zoneId)
        .orderBy('createdAt', descending: true)
        .snapshots()
        .map((snap) => snap.docs.map((d) => Plant.fromDocument(d)).toList());
  }
}
