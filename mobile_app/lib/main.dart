import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';
import 'screens/main/root_screen.dart';
import 'screens/plants/plant_screen.dart';
import 'theme_notifier.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Firebase.initializeApp();

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
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.green),
          useMaterial3: true,
        ),
        darkTheme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: Colors.green,
            brightness: Brightness.dark,
            surface: const Color(0xFF1E1E1E),
            surfaceContainer: const Color(0xFF2A2A2A),
            surfaceContainerHigh: const Color(0xFF323232),
          ),
          useMaterial3: true,
        ),
        themeMode: mode,
        initialRoute: LoginScreen.routeName,
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
