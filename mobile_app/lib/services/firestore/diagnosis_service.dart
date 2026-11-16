import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

import '../../config.dart';
import '../../models/plant_diagnosis_model.dart';
import '../../utils/plant_diagnosis.dart';
import '../photo_service.dart';

/// Runs and deletes image diagnoses. The photo goes straight to Storage under a new doc ID, then
/// POST /api/ai/plant-diagnosis has the server read it, ask the model and write
/// plantDiagnoses/{id} (clients can't write that collection).
/// Web: client/src/lib/diagnosisApi.js.
class DiagnosisService {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;
  final FirebaseStorage _storage = FirebaseStorage.instance;

  CollectionReference<Map<String, dynamic>> get _col => _firestore.collection('plantDiagnoses');

  // A plant's diagnoses, made by any member of its zone. Two equality filters, sorted here: no
  // composite index needed. The zoneId filter is what the security rules allow.
  Query<Map<String, dynamic>> _forPlant(String zoneId, String plantId) =>
      _col.where('zoneId', isEqualTo: zoneId).where('plantId', isEqualTo: plantId);

  /// Newest first.
  Stream<List<PlantDiagnosis>> watch(String zoneId, String plantId) {
    final newest = DateTime(9999);  // a doc whose server timestamp hasn't arrived yet sorts first
    return _forPlant(zoneId, plantId).snapshots().map((snap) => snap.docs.map(PlantDiagnosis.fromDocument).toList()
      ..sort((a, b) => (b.createdAt ?? newest).compareTo(a.createdAt ?? newest)));
  }

  /// Returns null when the diagnosis was saved, otherwise the message to show.
  Future<String?> run(String plantId, XFile file) async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return diagnosisError('error');
    final id = _col.doc().id;
    final path = 'plantDiagnoses/${user.uid}/$id.jpg';
    try {
      await _storage.ref(path).putFile(File(file.path), SettableMetadata(contentType: 'image/jpeg'));
      final res = await http
          .post(
            Uri.parse('$apiBaseUrl/api/ai/plant-diagnosis'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ${await user.getIdToken()}',
            },
            body: jsonEncode({'plantId': plantId, 'diagnosisId': id}),
          )
          .timeout(const Duration(seconds: 45));  // the model call alone may take 20 s, retried once
      if (res.statusCode == 400) return diagnosisError('image');  // the server removed the photo
      if (res.statusCode != 200) throw HttpException('plant-diagnosis → ${res.statusCode}');
      final body = jsonDecode(res.body) as Map<String, dynamic>;
      return body['source'] == 'ai' ? null : diagnosisError(body['reason'] as String?);
    } catch (e) {
      debugPrint('Diagnosis failed: $e');
      // The server may never have seen the photo. Remove it, unless the diagnosis was saved
      // after all and only the reply got lost (reading a missing doc is refused, hence the catch).
      final saved = await _col.doc(id).get().then((d) => d.exists, onError: (_) => false);
      if (saved) return null;
      try {
        await PhotoService().deleteFile(path);
      } catch (_) {}
      return diagnosisError('error');
    }
  }

  // Photo first, then the doc, so a failure leaves something to retry from.
  Future<void> _delete(String id, String? storagePath) async {
    if (storagePath != null) await PhotoService().deleteFile(storagePath);
    await _col.doc(id).delete();
  }

  Future<void> delete(PlantDiagnosis d) => _delete(d.id, d.storagePath);

  /// Part of the plant and zone delete cascades.
  Future<void> deleteForPlant(String zoneId, String plantId) async {
    for (final d in (await _forPlant(zoneId, plantId).get()).docs) {
      await _delete(d.id, d.data()['storagePath'] as String?);
    }
  }
}
