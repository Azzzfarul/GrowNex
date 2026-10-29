import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../models/notification_model.dart';
import '../../services/firestore/notification_service.dart';
import '../../widgets/app_bottom_nav.dart';
import '../analytics/analytics_screen.dart';
import '../dashboard/dashboard_screen.dart';
import '../devices/devices_screen.dart';
import '../notifications/notifications_screen.dart';
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
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_selectedIndex]),
        actions: [
          StreamBuilder<List<AppNotification>>(
            stream: NotificationService().watchNotifications(uid),
            builder: (context, snap) {
              final unread = (snap.data ?? const []).where((n) => !n.isRead).length;
              return Badge.count(
                count: unread,
                isLabelVisible: unread > 0,
                child: IconButton(
                  icon: const Icon(Icons.notifications_outlined),
                  tooltip: 'Notifications',
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const NotificationsScreen()),
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: _screens[_selectedIndex],
      bottomNavigationBar: AppBottomNav(
        currentIndex: _selectedIndex,
        onTabSelected: _onTabSelected,
      ),
    );
  }
}
