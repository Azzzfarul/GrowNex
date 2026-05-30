import 'package:flutter/material.dart';
import '../../widgets/app_bottom_nav.dart';
import '../analytics/analytics_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../devices/devices_screen.dart';
import '../plants/plant_screen.dart';
import '../profile/profile_screen.dart';

class RootScreen extends StatefulWidget {
  static const routeName = '/home';

  const RootScreen({super.key});

  @override
  State<RootScreen> createState() => _RootScreenState();
}

class _RootScreenState extends State<RootScreen> {
  int _selectedIndex = 0;

  static const List<Widget> _screens = [
    DashboardScreen(),
    PlantScreen(),
    AnalyticsScreen(),
    DevicesScreen(),
    ProfileScreen(),
  ];

  static const List<String> _titles = [
    'Dashboard',
    'Plants',
    'Analytics',
    'Devices',
    'Profile',
  ];

  void _onTabSelected(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_selectedIndex]),
        backgroundColor: Colors.green[700],
        elevation: 0,
      ),
      body: _screens[_selectedIndex],
      bottomNavigationBar: AppBottomNav(
        currentIndex: _selectedIndex,
        onTabSelected: _onTabSelected,
      ),
    );
  }
}
