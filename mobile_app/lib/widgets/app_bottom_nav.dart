import 'package:flutter/material.dart';

class AppBottomNav extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTabSelected;

  const AppBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTabSelected,
  });

  @override
  Widget build(BuildContext context) {
    return BottomNavigationBar(
      currentIndex: currentIndex,
      selectedItemColor: Colors.green[800],
      unselectedItemColor: Colors.grey[600],
      showUnselectedLabels: true,
      type: BottomNavigationBarType.fixed,
      onTap: onTabSelected,
      items: const [
        BottomNavigationBarItem(icon: Icon(Icons.dashboard), label: 'Dashboard'),
        BottomNavigationBarItem(icon: Icon(Icons.local_florist), label: 'Plants'),
        BottomNavigationBarItem(icon: Icon(Icons.bar_chart), label: 'Analytics'),
        BottomNavigationBarItem(icon: Icon(Icons.devices), label: 'Devices'),
        BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
      ],
    );
  }
}
