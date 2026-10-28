import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

// Keeps users/{uid}.fcmTokens in step with whoever is signed in on this phone. The server's
// notify() pushes every in-app notification to those tokens. While the app is open, Android
// shows no pop-up; the notification bell already updates live.
class PushService {
  static final _messaging = FirebaseMessaging.instance;
  static final _users = FirebaseFirestore.instance.collection('users');

  // Call once at startup. authStateChanges also fires for a session restored at launch, which
  // is most launches (the app skips the login screen when already signed in).
  static void init() {
    FirebaseAuth.instance.authStateChanges().listen((user) {
      if (user != null) _register(user.uid);
    });
    _messaging.onTokenRefresh.listen((token) {
      final uid = FirebaseAuth.instance.currentUser?.uid;
      if (uid != null) _save(uid, token).catchError((Object e) => debugPrint('Push: token not saved ($e)'));
    });
  }

  static Future<void> _register(String uid) async {
    try {
      await _messaging.requestPermission();  // Android 13+ system prompt; asked once
      final token = await _messaging.getToken();
      if (token != null) await _save(uid, token);
    } catch (e) {
      // No Google Play services, offline, …: the in-app bell still works.
      debugPrint('Push: registration failed ($e)');
    }
  }

  // Merge, not update: right after sign-up this can land before register() creates the doc.
  static Future<void> _save(String uid, String token) =>
      _users.doc(uid).set({'fcmTokens': FieldValue.arrayUnion([token])}, SetOptions(merge: true));

  // Call before signOut (the Firestore write needs the user). deleteToken() kills the token at
  // FCM too, so if the Firestore write fails (offline), the next account to sign in on this
  // phone still won't receive this user's pushes; the server prunes the dead token later.
  // Time-limited, so logging out never hangs on a bad connection.
  static Future<void> unregister(String uid) async {
    try {
      final token = await _messaging.getToken().timeout(const Duration(seconds: 5));
      if (token != null) {
        await _users.doc(uid).update({'fcmTokens': FieldValue.arrayRemove([token])})
            .timeout(const Duration(seconds: 5));
      }
    } catch (e) {
      debugPrint('Push: token not removed from Firestore ($e)');
    }
    try {
      await _messaging.deleteToken().timeout(const Duration(seconds: 5));
    } catch (e) {
      debugPrint('Push: token not deleted ($e)');
    }
  }
}
