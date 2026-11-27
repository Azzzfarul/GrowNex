// Schedule lists: a typed time survives scrolling, and one in a list that goes away (module removed)
// does not leave Save blocked. Needs the run-grownex sandbox, like app_test.dart.
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile_app/main.dart' as app;
import 'app_test.dart' show tap, type, field, button, navItem, pumpUntil;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('a typed time in a list that goes away does not block Save', (t) async {
    await app.main();
    await t.pump();
    await tap(t, button('Register'));
    await type(t, field('Your username'), 'Pend');
    await type(t, field('you@example.com'), 'pend${DateTime.now().millisecondsSinceEpoch}@t.local');
    await type(t, field('Choose a password'), 'secret123');
    await type(t, field('Repeat your password'), 'secret123');
    await tap(t, button('Register'));
    await pumpUntil(t, navItem('Dashboard'));
    final uid = FirebaseAuth.instance.currentUser!.uid, db = FirebaseFirestore.instance;
    final dev = db.doc('devices/PEND-DEV');
    await dev.set({'userId': uid, 'deviceType': 'indoor', 'hasLightingModule': true, 'hasFertilizerModule': true, 'status': 'online'});
    final z = await db.collection('zones').add({'userId': uid, 'memberIds': [uid], 'zoneName': 'Pend zone', 'zoneType': 'indoor', 'deviceId': 'PEND-DEV', 'createdAt': FieldValue.serverTimestamp()});
    final cfg = db.doc('automationConfig/${z.id}');
    await cfg.set({'autoWateringEnabled': true, 'autoLightingEnabled': true, 'autoFertilizingEnabled': true, 'wateringSchedule': ['07:00']});
    try {
      await tap(t, navItem('Plants'));
      await tap(t, find.text('Pend zone'));
      await tap(t, find.text('Automation'));
      // 1) Scrolled out of view: the typed time survives
      await type(t, field('Daily time (e.g. 07:00)'), '18:00');
      final page = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down).last;
      for (final dy in [-3000.0, 3000.0]) { await t.drag(page, Offset(0, dy)); await t.pumpAndSettle(); }
      expect(find.text('18:00'), findsOneWidget, reason: 'typed time kept while scrolled away');
      await tap(t, field('Daily time (e.g. 07:00)'));
      await type(t, field('Daily time (e.g. 07:00)'), '');
      // 2) The fertilizer list goes away with a typed time in it: Save must not stay blocked
      await tap(t, field('Weekly time'));
      await type(t, field('Weekly time'), 'TUE 06:00');
      Future<bool> saveShown() async {
        final f = find.widgetWithText(FilledButton, 'Save');
        try { await t.scrollUntilVisible(f, 250, scrollable: page, maxScrolls: 20); } catch (_) { return false; }
        return f.evaluate().isNotEmpty;
      }
      expect(await saveShown(), isTrue, reason: 'typed time counts as unsaved');
      await dev.update({'hasFertilizerModule': false});
      await pumpUntil(t, find.text('Light automation'));
      for (var i = 0; i < 20 && find.text('Fertilizer automation').evaluate().isNotEmpty; i++) { await t.pump(const Duration(milliseconds: 250)); }
      expect(find.text('Fertilizer automation'), findsNothing);
      await t.pump(const Duration(milliseconds: 500));
      expect(await saveShown(), isFalse, reason: 'nothing left unsaved');
      debugPrint('PENDING_OK');
    } finally {
      await cfg.delete();
      await z.delete();
      await dev.delete();
      await db.doc('users/$uid').delete();
      await FirebaseAuth.instance.currentUser!.delete();
    }
  });
}
