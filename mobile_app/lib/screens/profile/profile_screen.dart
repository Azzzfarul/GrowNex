import 'package:flutter/material.dart';
import '../auth/login_screen.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.grey[100],
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('Profile', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          const Text('Manage your account and app settings.', style: TextStyle(color: Colors.black54)),
          const SizedBox(height: 24),
          Container(
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(color: Colors.black12, blurRadius: 12, offset: Offset(0, 5)),
              ],
            ),
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: Row(
              children: [
                const CircleAvatar(
                  radius: 28,
                  backgroundColor: Colors.green,
                  child: Icon(Icons.person, color: Colors.white),
                ),
                const SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text('Jordan Green', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    SizedBox(height: 6),
                    Text('jordan@grownex.app', style: TextStyle(color: Colors.black54)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _ProfileListItem(title: 'Account details', subtitle: 'Update your name, email, and password', icon: Icons.settings),
          _ProfileListItem(title: 'Notifications', subtitle: 'Manage alerts and reminders', icon: Icons.notifications),
          _ProfileListItem(title: 'App theme', subtitle: 'Green dashboard mode', icon: Icons.palette),
          const SizedBox(height: 18),
          ElevatedButton(
            onPressed: () {
              Navigator.pushNamedAndRemoveUntil(context, LoginScreen.routeName, (route) => false);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green[700],
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: const Text('Logout', style: TextStyle(fontSize: 16)),
          ),
        ],
      ),
    );
  }
}

class _ProfileListItem extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;

  const _ProfileListItem({required this.title, required this.subtitle, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: ListTile(
        leading: CircleAvatar(backgroundColor: Colors.green[50], child: Icon(icon, color: Colors.green[700])),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle, style: const TextStyle(color: Colors.black54)),
        trailing: const Icon(Icons.arrow_forward_ios, size: 16, color: Colors.black38),
      ),
    );
  }
}
