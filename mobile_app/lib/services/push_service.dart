import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Keeps users/{uid}.fcmTokens in step with whoever is signed in on this phone. The server's
// notify() pushes every in-app notification to those tokens. While the app is open, Android
// shows no pop-up; the notification bell already updates live.
class PushService {
  static final _messaging = FirebaseMessaging.instance;
  static final _users = FirebaseFirestore.instance.collection('users');
  // Set when logout couldn't delete its token (offline): that token still delivers the previous
  // account's pushes, so the next sign-in deletes it before registering anything.
  static const _pendingDeleteKey = 'push.pendingTokenDelete';
  // A timeout stops the waiting, not the SDK's deleteToken(). Sharing the one in-flight call lets
  // registration wait for it, so a late-finishing delete can't wipe a token registered after it.
  static Future<void>? _deleting;

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
      final prefs = await SharedPreferences.getInstance();
      if (_deleting != null || (prefs.getBool(_pendingDeleteKey) ?? false)) {
        // No time limit (this runs in the background): getToken() must wait until the old token
        // is gone, or it would hand this account the previous one's token.
        try {
          await _deleteToken();
        } catch (e) {
          debugPrint('Push: old token not deleted ($e), retrying in a minute');
          Timer(const Duration(minutes: 1), () {
            if (FirebaseAuth.instance.currentUser?.uid == uid) _register(uid);
          });
          return;
        }
        await prefs.remove(_pendingDeleteKey);
      }
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
  // phone still won't receive this user's pushes; the server prunes the dead token later. If
  // deleteToken() fails as well, the next sign-in retries it (_pendingDeleteKey): only it can,
  // since another account can't edit this user's doc. Time-limited, so logout never hangs.
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
      await _deleteToken().timeout(const Duration(seconds: 5));
    } catch (e) {
      debugPrint('Push: token not deleted ($e)');
      try {
        await (await SharedPreferences.getInstance()).setBool(_pendingDeleteKey, true);
      } catch (e) {
        debugPrint('Push: pending token delete not saved ($e)');
      }
    }
  }

  static Future<void> _deleteToken() =>
      _deleting ??= _messaging.deleteToken().whenComplete(() => _deleting = null);
}
