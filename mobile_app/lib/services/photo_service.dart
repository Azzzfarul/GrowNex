import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:image_picker/image_picker.dart';

String fourHourBucketId([DateTime? date]) {
  final d = (date ?? DateTime.now()).toUtc();
  final flooredHour = (d.hour ~/ 4) * 4;
  final bucket = DateTime.utc(d.year, d.month, d.day, flooredHour);
  return bucket.toIso8601String().substring(0, 13); // e.g. "2026-01-15T12"
}

class PhotoService {
  final FirebaseStorage _storage = FirebaseStorage.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<String> uploadPlantPhoto(String plantId, XFile file) async {
    final ref = _storage.ref('plantPhotos/$plantId.jpg');
    await ref.putFile(File(file.path), SettableMetadata(contentType: 'image/jpeg'));
    final photoUrl = await ref.getDownloadURL();
    await _firestore.collection('plants').doc(plantId).update({'photoUrl': photoUrl});
    return photoUrl;
  }

  // A missing file is already the goal; any other Storage error is rethrown so the caller can retry.
  Future<void> deleteFile(String path) async {
    try {
      await _storage.ref(path).delete();
    } on FirebaseException catch (e) {
      if (e.code != 'object-not-found') rethrow;
    }
  }

  // Storage object only — for when the plant doc is being deleted too.
  Future<void> deletePlantPhotoFile(String plantId) => deleteFile('plantPhotos/$plantId.jpg');

  Future<void> removePlantPhoto(String plantId) async {
    await deletePlantPhotoFile(plantId);
    await _firestore.collection('plants').doc(plantId).update({'photoUrl': null});
  }

  Future<String> uploadZonePhoto(String zoneId, XFile file) async {
    final ref = _storage.ref('zonePhotos/$zoneId.jpg');
    await ref.putFile(File(file.path), SettableMetadata(contentType: 'image/jpeg'));
    final zonePhotoUrl = await ref.getDownloadURL();
    await _firestore.collection('zones').doc(zoneId).update({'zonePhotoUrl': zonePhotoUrl});
    return zonePhotoUrl;
  }

  Future<void> removeZonePhoto(String zoneId) async {
    try {
      await _storage.ref('zonePhotos/$zoneId.jpg').delete();
    } on FirebaseException catch (e) {
      if (e.code != 'object-not-found') rethrow;
    }
    await _firestore.collection('zones').doc(zoneId).update({'zonePhotoUrl': null});
  }

  Future<String> uploadZoneSnapshot(String zoneId, XFile file) async {
    final bucketId = fourHourBucketId();
    final storagePath = 'zoneSnapshots/$zoneId/$bucketId.jpg';
    final ref = _storage.ref(storagePath);
    await ref.putFile(File(file.path), SettableMetadata(contentType: 'image/jpeg'));
    final imageUrl = await ref.getDownloadURL();
    await _firestore
        .collection('zones')
        .doc(zoneId)
        .collection('snapshots')
        .doc(bucketId)
        .set({
      'imageUrl': imageUrl,
      'storagePath': storagePath,
      'capturedAt': Timestamp.now(),
      'createdAt': FieldValue.serverTimestamp(),
    });
    return imageUrl;
  }
}
