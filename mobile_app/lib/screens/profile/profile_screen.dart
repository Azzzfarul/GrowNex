import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/auth_service.dart';
import '../../theme_notifier.dart';
import '../auth/login_screen.dart';
import 'edit_profile_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  String _username = '';
  String _email = '';
  bool _loadingProfile = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final authUser = FirebaseAuth.instance.currentUser;
    final data = await AuthService().getCurrentUserData();
    if (mounted) {
      setState(() {
        _username = data?['username'] as String? ?? authUser?.displayName ?? '';
        _email = authUser?.email ?? '';
        _loadingProfile = false;
      });
    }
  }

  Future<void> _setTheme(bool isDark) async {
    themeNotifier.value = isDark ? ThemeMode.dark : ThemeMode.light;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('isDarkMode', isDark);
  }

  void _showThemeDialog() {
    showDialog(
      context: context,
      builder: (dlgCtx) => AlertDialog(
        title: const Text('App Theme'),
        content: ValueListenableBuilder<ThemeMode>(
          valueListenable: themeNotifier,
          builder: (_, mode, child) {
            final isDark = mode == ThemeMode.dark;
            return RadioGroup<bool>(
              groupValue: isDark,
              onChanged: (v) async {
                if (v == null) return;
                await _setTheme(v);
                if (dlgCtx.mounted) Navigator.pop(dlgCtx);
              },
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  RadioListTile<bool>(
                    value: false,
                    title: const Text('Light Mode'),
                    activeColor: Colors.green[700],
                  ),
                  RadioListTile<bool>(
                    value: true,
                    title: const Text('Dark Mode'),
                    activeColor: Colors.green[700],
                  ),
                ],
              ),
            );
          },
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dlgCtx),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Profile',
            style: Theme.of(context)
                .textTheme
                .headlineSmall
                ?.copyWith(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text('Manage your account and app settings.',
            style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55))),
        const SizedBox(height: 24),

        // Profile card
        Container(
          decoration: BoxDecoration(
            color: cs.surfaceContainer,
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                  color: cs.shadow.withValues(alpha: 0.08),
                  blurRadius: 12,
                  offset: const Offset(0, 5)),
            ],
          ),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: _loadingProfile
              ? const SizedBox(
                  height: 56,
                  child: Center(child: CircularProgressIndicator()),
                )
              : Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: Colors.green[700],
                      child: Text(
                        _username.isNotEmpty ? _username[0].toUpperCase() : '?',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.bold),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(_username,
                              style: const TextStyle(
                                  fontSize: 18, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 4),
                          Text(_email,
                              style: TextStyle(
                                  color: cs.onSurface.withValues(alpha: 0.55))),
                        ],
                      ),
                    ),
                  ],
                ),
        ),

        const SizedBox(height: 24),

        _ProfileListItem(
          title: 'Account details',
          subtitle: 'Update your username and password',
          icon: Icons.manage_accounts_outlined,
          onTap: () async {
            await Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const EditProfileScreen()),
            );
            _loadProfile();
          },
        ),

        _ProfileListItem(
          title: 'Notifications',
          subtitle: 'Manage alerts and reminders',
          icon: Icons.notifications_outlined,
          onTap: null,
        ),

        _ProfileListItem(
          title: 'App theme',
          subtitle: 'Switch between light and dark mode',
          icon: Icons.palette_outlined,
          onTap: _showThemeDialog,
        ),

        const SizedBox(height: 18),

        ElevatedButton(
          onPressed: () async {
            final nav = Navigator.of(context);
            await AuthService().logout();
            nav.pushNamedAndRemoveUntil(LoginScreen.routeName, (route) => false);
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.green[700],
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text('Logout', style: TextStyle(fontSize: 16)),
        ),
      ],
    );
  }
}

class _ProfileListItem extends StatelessWidget {
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;

  const _ProfileListItem({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: Colors.green.withValues(alpha: 0.15),
          child: Icon(icon, color: Colors.green[700]),
        ),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle,
            style: TextStyle(
                color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.55))),
        trailing: Icon(Icons.arrow_forward_ios,
            size: 16,
            color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.38)),
      ),
    );
  }
}
