// Client for the AI endpoints on the Express server. Every call degrades
// gracefully: on any network/HTTP/parse error it returns a fallback result so
// the UI keeps showing the local rule-based text (describeTrend /
// buildOverviewSummary in analytics_screen.dart).

import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

import '../config.dart';

const aiSummaryKinds = ['overview', 'temperature', 'humidity', 'light', 'moisture'];

class Advice {
  final String severity; // 'info' | 'warn' | 'critical'
  final String text;
  const Advice(this.severity, this.text);
}

class AiSummaryResult {
  final String source; // 'ai' | 'cache' | 'fallback' | 'error'
  final Map<String, String>? summaries; // keyed by aiSummaryKinds
  final List<Advice> advice;
  const AiSummaryResult(this.source, this.summaries, this.advice);

  bool get isAi => source == 'ai' || source == 'cache';

  static const AiSummaryResult empty = AiSummaryResult('fallback', null, []);
}

class Rationale {
  final String field;
  final String text;
  const Rationale(this.field, this.text);
}

class AutomationPlanResult {
  final String source; // 'ai' | 'fallback' | 'error'
  final Map<String, dynamic>? plan;
  final List<Rationale> rationale;
  const AutomationPlanResult(this.source, this.plan, this.rationale);
}

// One Pl@ntNet guess for a plant photo; score is 0..1.
class PlantMatch {
  final String species;
  final String? commonName;
  final double score;
  const PlantMatch(this.species, this.commonName, this.score);
}

class PlantProfileResult {
  final String source; // 'ai' | 'cache' | 'fallback' | 'error'
  final Map<String, dynamic>? profile;
  const PlantProfileResult(this.source, this.profile);
  bool get isAi => source == 'ai' || source == 'cache';
}

class AiSummaryService {
  const AiSummaryService();

  Future<Map<String, dynamic>?> _post(String path, Map<String, dynamic> payload) async {
    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) return null;
    final res = await http
        .post(
          Uri.parse('$apiBaseUrl$path'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode(payload),
        )
        .timeout(const Duration(seconds: 25));
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<AiSummaryResult> fetchSummary(Map<String, dynamic> payload) async {
    try {
      final data = await _post('/api/ai/analytics-summary', payload);
      if (data == null) return AiSummaryResult.empty;
      final s = data['summaries'];
      final summaries = s is Map
          ? s.map((k, v) => MapEntry(k.toString(), v.toString()))
          : null;
      final advice = (data['advice'] as List? ?? [])
          .whereType<Map>()
          .map((a) => Advice(
                (a['severity'] ?? 'info').toString(),
                (a['text'] ?? '').toString(),
              ))
          .where((a) => a.text.isNotEmpty)
          .toList();
      return AiSummaryResult((data['source'] ?? 'fallback').toString(), summaries, advice);
    } catch (_) {
      return AiSummaryResult.empty;
    }
  }

  Future<AutomationPlanResult> fetchAutomationPlan(Map<String, dynamic> payload) async {
    try {
      final data = await _post('/api/ai/automation-plan', payload);
      if (data == null) return const AutomationPlanResult('error', null, []);
      final plan = data['plan'] is Map
          ? (data['plan'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : null;
      final rationale = (data['rationale'] as List? ?? [])
          .whereType<Map>()
          .map((r) => Rationale(
                (r['field'] ?? 'general').toString(),
                (r['text'] ?? '').toString(),
              ))
          .where((r) => r.text.isNotEmpty)
          .toList();
      return AutomationPlanResult((data['source'] ?? 'fallback').toString(), plan, rationale);
    } catch (_) {
      return const AutomationPlanResult('error', null, []);
    }
  }

  Future<PlantProfileResult> fetchPlantProfile(Map<String, dynamic> payload) async {
    try {
      final data = await _post('/api/ai/plant-profile', payload);
      if (data == null) return const PlantProfileResult('fallback', null);
      final profile = data['profile'] is Map
          ? (data['profile'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : null;
      return PlantProfileResult((data['source'] ?? 'fallback').toString(), profile);
    } catch (_) {
      return const PlantProfileResult('error', null);
    }
  }


  /// Pl@ntNet species guesses for a plant photo (server: POST /api/ai/identify-plant, which holds
  /// the key). Returns the matches, best first ([] = no match), or an error message to show.
  /// Web: identifyPlant in client/src/lib/aiSummary.js.
  Future<({List<PlantMatch> matches, String? error})> identifyPlant(List<int> photo) async {
    try {
      final token = await FirebaseAuth.instance.currentUser?.getIdToken();
      if (token == null) return (matches: const <PlantMatch>[], error: 'Not signed in.');
      final isPng = photo.length > 3 && photo[0] == 0x89 && photo[1] == 0x50;
      final res = await http
          .post(
            Uri.parse('$apiBaseUrl/api/ai/identify-plant'),
            headers: {'Content-Type': isPng ? 'image/png' : 'image/jpeg', 'Authorization': 'Bearer $token'},
            body: photo,
          )
          .timeout(const Duration(seconds: 30));
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      if (res.statusCode != 200) {
        return (matches: const <PlantMatch>[], error: data['error'] as String? ?? 'Identification failed (${res.statusCode})');
      }
      if (data['source'] == 'unavailable') {
        return (matches: const <PlantMatch>[], error: "Plant identification isn't set up on the server.");
      }
      final matches = (data['results'] as List? ?? [])
          .whereType<Map>()
          .where((m) => m['species'] is String)
          .map((m) => PlantMatch(m['species'] as String, m['commonName'] as String?, (m['score'] as num?)?.toDouble() ?? 0))
          .toList();
      return (matches: matches, error: null);
    } catch (_) {
      return (matches: const <PlantMatch>[], error: "Couldn't identify the photo. Check that the server is running.");
    }
  }
}
