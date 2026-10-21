import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
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
  // subcollection, notifications and Storage photos, which the client SDK can't do in bulk.
  // Throws if the server can't be reached; nothing is deleted then.
  Future<void> deleteAccount(String password) async {
    await reauthenticate(password);
    final token = await _auth.currentUser!.getIdToken(true);
    final res = await http
        .delete(Uri.parse('$apiBaseUrl/api/auth/me'), headers: {'Authorization': 'Bearer $token'})
        .timeout(const Duration(seconds: 60));
    if (res.statusCode != 200) throw Exception('Account deletion failed (${res.statusCode})');
    await _auth.signOut();
  }
}
