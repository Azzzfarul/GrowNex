// On-device walkthrough of the app against the local sandbox (never the live project):
//   Firebase emulators + web_dashboard/server + web_dashboard/server/test/sandbox.js (broker and
//   fake node ESP32-MOB01) — see web_dashboard/README.md "Local sandbox". Then, on an Android
//   emulator: flutter test integration_test --dart-define=USE_FIREBASE_EMULATORS=true
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:mobile_app/main.dart' as app;

const deviceId = 'ESP32-MOB01';

String onScreen() =>
    find.byType(Text).evaluate().map((e) => (e.widget as Text).data).whereType<String>().toSet().join(' | ');

Future<void> pumpUntil(WidgetTester t, Finder f, {Duration timeout = const Duration(seconds: 20)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await t.pump(const Duration(milliseconds: 200));
    if (f.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $f\nOn screen: ${onScreen()}');
}

Future<T> waitFor<T>(Future<T?> Function() check, String what, {Duration timeout = const Duration(seconds: 20)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    final v = await check();
    if (v != null && v != false) return v;
    await Future<void>.delayed(const Duration(milliseconds: 300));
  }
  throw TestFailure('Timed out waiting for $what\nOn screen: ${onScreen()}');
}

Future<void> tap(WidgetTester t, Finder f) async {
  // Close the keyboard first, as a person would; an open one keeps scrolling the
  // focused field back into view.
  FocusManager.instance.primaryFocus?.unfocus();
  await t.pump(const Duration(milliseconds: 300));
  try {
    await pumpUntil(t, f, timeout: const Duration(seconds: 4));
  } on TestFailure {
    // Lists don't build rows that are off screen: scroll the page down to find it.
    final vertical = find.byWidgetPredicate((w) => w is Scrollable && w.axisDirection == AxisDirection.down);
    await t.scrollUntilVisible(f, 250, scrollable: vertical.last, maxScrolls: 30);
  }
  await pumpUntil(t, f);
  await t.ensureVisible(f.first);
  await t.pump();
  await t.tap(f.first);
  for (var i = 0; i < 4; i++) {
    await t.pump(const Duration(milliseconds: 200));  // let route transitions finish
  }
}

// Tap the field first, as a person would; typing into a field that isn't focused
// (e.g. after the keyboard was closed) is silently ignored on a real device.
Future<void> type(WidgetTester t, Finder f, String text) async {
  await pumpUntil(t, f);
  await t.tap(f);
  await t.pump(const Duration(milliseconds: 300));
  await t.enterText(f, text);
  await t.pump(const Duration(milliseconds: 300));
}

Finder field(String labelOrHint) => find.widgetWithText(TextField, labelOrHint).first;
Finder button(String label) => find.ancestor(of: find.text(label), matching: find.byWidgetPredicate((w) => w is ButtonStyleButton));
Finder navItem(String label) => find.descendant(of: find.byType(BottomNavigationBar), matching: find.text(label));

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('register → claim → zone → plant → automation → analytics → delete account', (t) async {
    final email = 'mobile${DateTime.now().millisecondsSinceEpoch}@test.local';
    await app.main();
    await t.pump();
    final db = FirebaseFirestore.instance;

    // ── Register ──
    await tap(t, button('Register'));
    await type(t, field('Your username'), 'Mobile Tester');
    await type(t, field('you@example.com'), email);
    await type(t, field('Choose a password'), 'secret123');
    await type(t, field('Repeat your password'), 'secret123');
    await tap(t, button('Register'));
    await pumpUntil(t, navItem('Dashboard'));
    final uid = FirebaseAuth.instance.currentUser!.uid;
    expect((await db.doc('users/$uid').get()).data()?['username'], 'Mobile Tester');

    // ── Claim the fake device from the discovery list ──
    await tap(t, navItem('Devices'));
    await tap(t, find.text('Add device'));
    await tap(t, find.text(deviceId));
    await tap(t, button('Claim device'));
    await waitFor(() async => (await db.doc('devices/$deviceId').get()).data()?['userId'] == uid, 'claim');

    // ── Create a zone and assign the device ──
    await tap(t, navItem('Plants'));
    await tap(t, find.text('Add zone'));
    await type(t, field('Zone name'), 'Phone Zone');
    await tap(t, button('Create zone'));
    await tap(t, find.text('Phone Zone'));
    final zoneId = (await db.collection('zones').where('userId', isEqualTo: uid).get()).docs.single.id;
    await tap(t, find.text('Select device'));
    await tap(t, find.text(deviceId).last);
    await tap(t, button('Assign device'));
    await waitFor(() async => (await db.doc('zones/$zoneId').get()).data()?['deviceId'] == deviceId, 'assign');
    await waitFor(() async => (await db.doc('zones/$zoneId').get()).data()?['latestTemp'] == 26.5, 'live readings');
    await pumpUntil(t, find.text('Online'));

    // ── Add a plant (Suggest falls back without an AI key) ──
    await tap(t, find.text('Plants').last);
    await tap(t, find.text('Add plant'));
    await type(t, field('Species (e.g. Phalaenopsis)'), 'Basil');
    await tap(t, find.text('✨ Suggest'));
    await t.pump(const Duration(seconds: 2));
    await tap(t, find.text('Slot 1'));
    await tap(t, button('Add plant'));
    await pumpUntil(t, find.text('Basil'));

    // ── Automation: a toggle must not wipe the saved schedule ──
    await db.doc('automationConfig/$zoneId').set({'wateringSchedule': '06:30', 'wateringThreshold': 35});
    await tap(t, find.text('Automation'));
    await tap(t, find.text('Water'));
    await waitFor(() async => (await db.doc('devices/$deviceId').get()).data()?['irrigationConfirmed'] == true,
        'device confirmed irrigation on');
    await tap(t, find.text('Water'));
    await waitFor(() async => (await db.doc('devices/$deviceId').get()).data()?['irrigationConfirmed'] == false,
        'device confirmed irrigation off');

    await tap(t, find.byType(Switch).first);  // Water automation
    final cfg = await waitFor(() async {
      final d = (await db.doc('automationConfig/$zoneId').get()).data();
      return d?['autoWateringEnabled'] == true ? d : null;
    }, 'toggle saved');
    expect(cfg['wateringSchedule'], '06:30');
    expect(cfg['wateringThreshold'], 35);

    await type(t, field('Daily schedule (e.g. 07:00)'), '7am');
    await tap(t, button('Save'));
    await pumpUntil(t, find.textContaining('Watering time must look like'));
    expect((await db.doc('automationConfig/$zoneId').get()).data()?['wateringSchedule'], '06:30');
    await type(t, field('Daily schedule (e.g. 07:00)'), '07:45');
    await tap(t, button('Save'));
    await waitFor(() async => (await db.doc('automationConfig/$zoneId').get()).data()?['wateringSchedule'] == '07:45',
        'schedule saved');

    // ── Analytics: history from last week plus today's live readings ──
    final now = DateTime.now();
    for (final ago in [const Duration(hours: 6 * 24 + 22), const Duration(days: 3)]) {
      final ts = now.subtract(ago);
      await db.doc('zones/$zoneId/stats/${ts.toUtc().toIso8601String().substring(0, 13)}').set({
        'temperature': 22, 'humidity': 60, 'moisture': 45, 'soilMoisture1': 45, 'timestamp': Timestamp.fromDate(ts),
      });
    }
    await t.pageBack();
    await t.pump(const Duration(milliseconds: 500));
    await tap(t, navItem('Analytics'));
    await tap(t, find.text('Phone Zone'));
    await pumpUntil(t, find.byType(LineChart));
    await tap(t, find.text('Today'));
    await pumpUntil(t, find.byType(LineChart));

    // ── Device rename survives live updates ──
    await tap(t, navItem('Devices'));
    await tap(t, find.text(deviceId));
    final nameField = find.byType(TextField).first;
    await type(t, nameField, 'Phone Node');
    await t.pump(const Duration(seconds: 5));  // readings bump lastSync meanwhile
    expect(t.widget<TextField>(nameField).controller!.text, 'Phone Node');
    await tap(t, button('Save changes'));
    await waitFor(() async => (await db.doc('devices/$deviceId').get()).data()?['deviceName'] == 'Phone Node', 'rename');
    await t.pageBack();
    await t.pump(const Duration(milliseconds: 500));

    // ── Delete the account (through the server) ──
    await tap(t, navItem('Profile'));
    await tap(t, find.text('Delete account'));
    await type(t, field('Your password'), 'secret123');
    await tap(t, find.text('Delete account').last);
    await pumpUntil(t, button('Login'), timeout: const Duration(seconds: 40));
    expect(FirebaseAuth.instance.currentUser, isNull);
    expect((await db.collection('zones').where('userId', isEqualTo: uid).get()).docs, isEmpty);
    expect((await db.doc('users/$uid').get()).exists, isFalse);
    expect((await db.collection('zones/$zoneId/stats').get()).docs, isEmpty);
    expect((await db.collection('devices').where('userId', isEqualTo: uid).get()).docs, isEmpty);
    expect((await db.collection('plants').where('zoneId', isEqualTo: zoneId).get()).docs, isEmpty);
  });
}
