import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

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

  Future<void> updateUsername(String username) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) return;
    await _firestore.collection('users').doc(uid).update({'username': username});
  }

  Future<void> updatePassword(String newPassword) async {
    await _auth.currentUser!.updatePassword(newPassword);
  }

  Future<void> resetPassword(String email) async {
    await _auth.sendPasswordResetEmail(email: email);
  }

  Future<void> deleteAccount(String password) async {
    await reauthenticate(password);
    final uid = _auth.currentUser!.uid;

    final zonesSnap = await _firestore
        .collection('zones')
        .where('userId', isEqualTo: uid)
        .get();

    for (final zoneDoc in zonesSnap.docs) {
      final zoneId = zoneDoc.id;

      final readingsSnap = await _firestore
          .collection('zones')
          .doc(zoneId)
          .collection('sensorReadings')
          .get();
      for (final r in readingsSnap.docs) {
        await r.reference.delete();
      }

      final plantsSnap = await _firestore
          .collection('plants')
          .where('zoneId', isEqualTo: zoneId)
          .get();
      for (final p in plantsSnap.docs) {
        await p.reference.delete();
      }

      await _firestore.collection('automationConfig').doc(zoneId).delete();
      await zoneDoc.reference.delete();
    }

    final devicesSnap = await _firestore
        .collection('devices')
        .where('userId', isEqualTo: uid)
        .get();
    for (final d in devicesSnap.docs) {
      await d.reference.delete();
    }

    await _firestore.collection('users').doc(uid).delete();
    await _auth.currentUser!.delete();
  }
}