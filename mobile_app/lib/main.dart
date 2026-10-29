import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_storage/firebase_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/main/root_screen.dart';
import 'screens/plants/plant_screen.dart';
import 'theme.dart';
import 'theme_notifier.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp();
  // Local test sandbox: flutter run --dart-define=USE_FIREBASE_EMULATORS=true (see web_dashboard/README.md).
  if (const bool.fromEnvironment('USE_FIREBASE_EMULATORS')) {
    const host = '10.0.2.2';  // the dev machine, seen from the Android emulator
    await FirebaseAuth.instance.useAuthEmulator(host, 9099);
    FirebaseFirestore.instance.useFirestoreEmulator(host, 8080);
    await FirebaseStorage.instance.useStorageEmulator(host, 9199);
  }

  final prefs = await SharedPreferences.getInstance();
  themeNotifier.value = (prefs.getBool('isDarkMode') ?? false)
      ? ThemeMode.dark
      : ThemeMode.light;

  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: themeNotifier,
      builder: (context, mode, _) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'GrowNex',
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        themeMode: mode,
        // Firebase keeps the session across launches; don't make the user log in every time.
        initialRoute: FirebaseAuth.instance.currentUser != null ? RootScreen.routeName : LoginScreen.routeName,
        routes: {
          LoginScreen.routeName:    (_) => const LoginScreen(),
          RegisterScreen.routeName: (_) => const RegisterScreen(),
          RootScreen.routeName:     (_) => const RootScreen(),
          PlantScreen.routeName:    (_) => const PlantScreen(),
        },
      ),
    );
  }
}
