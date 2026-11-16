import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../config.dart';

// Zone sharing goes through the server (web_dashboard/server/src/routes/zones.js): finding a user
// by email needs the Admin SDK, and the security rules don't let the apps change zones.memberIds.
// Both return null on success, or a message to show. Web: client/src/lib/zoneMembers.js.
class ZoneMemberService {
  Future<String?> _call(String method, String path, [Map<String, dynamic>? body]) async {
    try {
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (token == null) return 'Not signed in.';
      final req = http.Request(method, Uri.parse('$apiBaseUrl$path'))
        ..headers.addAll({'Content-Type': 'application/json', 'Authorization': 'Bearer $token'});
      if (body != null) req.body = jsonEncode(body);
      final res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 20)));
      if (res.statusCode >= 200 && res.statusCode < 300) return null;
      try {
        return (jsonDecode(res.body) as Map<String, dynamic>)['error'] as String? ?? 'Request failed (${res.statusCode})';
      } catch (_) {
        return 'Request failed (${res.statusCode})';
      }
    } catch (_) {
      return "Couldn't reach the server. Check that it's running.";
    }
  }

  Future<String?> addMember(String zoneId, String email) =>
      _call('POST', '/api/zones/$zoneId/members', {'email': email});

  // The owner removing a member, or a member removing themselves (leaving)
  Future<String?> removeMember(String zoneId, String uid) => _call('DELETE', '/api/zones/$zoneId/members/$uid');
}
