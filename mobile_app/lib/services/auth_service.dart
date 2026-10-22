import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config.dart';

class AuthService {
  final FirebaseAuth _auth = FirebaseAuth.instance;
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Future<User?> login({
    required String email,
    required String password,
  }) async {
    try {
      UserCredential credential =
          await _auth.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      return credential.user;
    } on FirebaseAuthException catch (e) {
      throw Exception(e.message);
    }
  }

  Future<User?> register({
    required String username,
    required String email,
    required String password,
  }) async {
    try {
      UserCredential credential =
          await _auth.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      User? user = credential.user;

      if (user != null) {
        // Update Firebase Auth display name
        await user.updateDisplayName(username);

        // Create Firestore document
        await _firestore
            .collection('users')
            .doc(user.uid)
            .set({
          'uid': user.uid,
          'username': username,
          'email': email,
          'createdAt': Timestamp.now(),
        });
      }

      return user;
    } on FirebaseAuthException catch (e) {
      throw Exception(e.message);
    }
  }

  Future<void> logout() async {
    await _auth.signOut();
  }

  User? get currentUser => _auth.currentUser;

  Future<Map<String, dynamic>?> getCurrentUserData() async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return null;
    final doc = await _firestore.collection('users').doc(uid).get();
    return doc.data();
  }

  Future<void> reauthenticate(String password) async {
    final user = _auth.currentUser!;
    final cred = EmailAuthProvider.credential(email: user.email!, password: password);
    await user.reauthenticateWithCredential(cred);
  }

  // Also the Auth display name: the web dashboard greets the user with it.
  // set+merge so it works when users/{uid} was never created.
  Future<void> updateUsername(String username) async {
    final user = _auth.currentUser;
    if (user == null) return;
    await _firestore.collection('users').doc(user.uid).set({'username': username}, SetOptions(merge: true));
    await user.updateDisplayName(username);
  }

  Future<void> updatePassword(String newPassword) async {
    await _auth.currentUser!.updatePassword(newPassword);
  }

  Future<void> resetPassword(String email) async {
    await _auth.sendPasswordResetEmail(email: email);
  }

  // Done by the server (DELETE /api/auth/me), same as the web app: it removes every zone
  // subcollection, notifications and Storage photos in bulk. If the server can't be reached at
  // all (e.g. a build without API_BASE_URL), the app does the same cleanup itself. A server that
  // answers with an error is reported as-is: it may have deleted part of the data already.
  Future<void> deleteAccount(String password) async {
    await reauthenticate(password);
    final user = _auth.currentUser!;
    final token = await user.getIdToken(true);
    final http.Response res;
    try {
      res = await http
          .delete(Uri.parse('$apiBaseUrl/api/auth/me'), headers: {'Authorization': 'Bearer $token'})
          .timeout(const Duration(seconds: 60));
    } on TimeoutException {
      // The server was reached and may still be deleting: cleaning up here too (and deleting the
      // login) could race it and leave nothing to retry from.
      throw Exception('Account deletion is taking too long. Wait a minute, then try again.');
    } on Exception catch (e) {  // no connection or DNS failure
      debugPrint('Account deletion: server unreachable ($e), deleting directly');
      await _deleteAccountDirectly(user);
      return;
    }
    if (res.statusCode != 200) throw Exception('Account deletion failed (${res.statusCode})');
    await _auth.signOut();
  }

  // Client-side version of web_dashboard/server/src/routes/auth.js DELETE /me — keep in step.
  Future<void> _deleteAccountDirectly(User user) async {
    final uid = user.uid;
    // Devices first: while a device still points at a zone, its next reading would recreate
    // that zone's readings after the zone is gone.
    for (final d in (await _firestore.collection('devices').where('userId', isEqualTo: uid).get()).docs) {
      await d.reference.delete();
    }
    final zones = await _firestore.collection('zones').where('userId', isEqualTo: uid).get();
    for (final zone in zones.docs) {
      final zoneRef = zone.reference;
      for (final snap in (await zoneRef.collection('snapshots').get()).docs) {
        final path = snap.data()['storagePath'];
        if (path is String) await _deleteFile(path);
      }
      for (final sub in ['sensorReadings', 'stats', 'aiCache', 'snapshots']) {
        await _deleteAll(zoneRef.collection(sub));
      }
      for (final plant in (await _firestore.collection('plants').where('zoneId', isEqualTo: zone.id).get()).docs) {
        await _deleteFile('plantPhotos/${plant.id}.jpg');
        await plant.reference.delete();
      }
      await _firestore.collection('automationConfig').doc(zone.id).delete();
      await _deleteFile('zonePhotos/${zone.id}.jpg');
      await zoneRef.delete();
    }
    try {
      await _deleteAll(_firestore.collection('notifications').where('userId', isEqualTo: uid));
    } catch (e) {
      debugPrint('Account deletion: notifications not deleted ($e)');  // they expire after 30 days
    }
    await _firestore.collection('users').doc(uid).delete();
    try {
      await user.delete();
    } on FirebaseAuthException catch (e) {
      // The server may have finished the job after all (e.g. the request only timed out).
      if (e.code != 'user-not-found') rethrow;
    }
    await _auth.signOut();
  }

  // Batched, so a week of readings (~10k docs) takes seconds rather than minutes.
  Future<void> _deleteAll(Query<Map<String, dynamic>> query) async {
    while (true) {
      final snap = await query.limit(400).get();
      if (snap.docs.isEmpty) return;
      final batch = _firestore.batch();
      for (final d in snap.docs) {
        batch.delete(d.reference);
      }
      await batch.commit();
    }
  }

  Future<void> _deleteFile(String path) async {
    try {
      await FirebaseStorage.instance.ref(path).delete();
    } on FirebaseException catch (e) {
      // Stop before the login is deleted, so the user can retry (same as the server route).
      if (e.code != 'object-not-found') rethrow;
    }
  }
}
