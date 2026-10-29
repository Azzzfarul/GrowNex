import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../services/auth_service.dart';
import '../../theme_notifier.dart';
import '../auth/login_screen.dart';
import '../notifications/notification_settings_screen.dart';
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
    final cs = Theme.of(context).colorScheme;
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
                    activeColor: cs.primary,
                  ),
                  RadioListTile<bool>(
                    value: true,
                    title: const Text('Dark Mode'),
                    activeColor: cs.primary,
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
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text('Profile', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Manage your account and app settings.',
            style: TextStyle(color: cs.onSurfaceVariant)),
        const SizedBox(height: 24),

        // Profile card
        Card(
          child: Padding(
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
                        backgroundColor: cs.primaryContainer,
                        child: Text(
                          _username.isNotEmpty ? _username[0].toUpperCase() : '?',
                          style: tt.titleLarge?.copyWith(color: cs.onPrimaryContainer),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(_username,
                                style: tt.titleMedium),
                            const SizedBox(height: 4),
                            Text(_email,
                                style: TextStyle(
                                    color: cs.onSurfaceVariant)),
                          ],
                        ),
                      ),
                    ],
                  ),
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
          onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => const NotificationSettingsScreen()),
          ),
        ),

        _ProfileListItem(
          title: 'App theme',
          subtitle: 'Switch between light and dark mode',
          icon: Icons.palette_outlined,
          onTap: _showThemeDialog,
        ),

        const SizedBox(height: 18),

        FilledButton(
          onPressed: () async {
            final nav = Navigator.of(context);
            await AuthService().logout();
            nav.pushNamedAndRemoveUntil(LoginScreen.routeName, (route) => false);
          },
          child: const Text('Logout'),
        ),

        const SizedBox(height: 32),

        Text('Danger zone', style: tt.titleSmall?.copyWith(color: cs.error)),
        const SizedBox(height: 10),

        OutlinedButton.icon(
          onPressed: _showDeleteAccountDialog,
          style: OutlinedButton.styleFrom(
            foregroundColor: cs.error,
            side: BorderSide(color: cs.error),
          ),
          icon: const Icon(Icons.delete_forever_outlined),
          label: const Text('Delete account'),
        ),
      ],
    );
  }

  void _showDeleteAccountDialog() {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final pwCtrl = TextEditingController();
    String? error;
    bool deleting = false;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dlgCtx) => StatefulBuilder(
        builder: (_, setState) => AlertDialog(
          title: const Text('Delete account'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'This action is permanent and cannot be undone. All your data will be deleted.',
                style: tt.bodyMedium,
              ),
              const SizedBox(height: 16),
              TextField(
                controller: pwCtrl,
                obscureText: true,
                autofocus: true,
                decoration: const InputDecoration(
                  labelText: 'Your password',
                  border: OutlineInputBorder(),
                  prefixIcon: Icon(Icons.lock_outline),
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 10),
                Text(error!, style: tt.bodyMedium?.copyWith(color: cs.error)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: deleting ? null : () => Navigator.pop(dlgCtx),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: deleting
                  ? null
                  : () async {
                      final password = pwCtrl.text;
                      if (password.isEmpty) {
                        setState(() => error = 'Enter your password to confirm');
                        return;
                      }
                      setState(() { deleting = true; error = null; });
                      try {
                        await AuthService().deleteAccount(password);
                        if (dlgCtx.mounted) Navigator.pop(dlgCtx);
                        if (mounted) {
                          Navigator.of(context).pushNamedAndRemoveUntil(
                            LoginScreen.routeName, (route) => false);
                        }
                      } on FirebaseAuthException catch (e) {
                        setState(() {
                          deleting = false;
                          error = switch (e.code) {
                            'wrong-password'     => 'Incorrect password',
                            'invalid-credential' => 'Incorrect password',
                            _                    => e.message ?? 'An error occurred',
                          };
                        });
                      } catch (e) {
                        setState(() {
                          deleting = false;
                          // An Exception carries its own reason (e.g. the server's status code).
                          error = e is Exception
                              ? e.toString().replaceFirst('Exception: ', '')
                              : 'Could not delete the account. Check that the GrowNex server is reachable, then try again.';
                        });
                      }
                    },
              style: TextButton.styleFrom(foregroundColor: cs.error),
              child: deleting
                  ? const SizedBox(
                      height: 16, width: 16,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Delete account'),
            ),
          ],
        ),
      ),
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
    final cs = Theme.of(context).colorScheme;
    // Material (not a decorated Container) so the tile's tap ripple shows.
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Card(
        child: ListTile(
          onTap: onTap,
          leading: CircleAvatar(
            backgroundColor: cs.secondaryContainer,
            foregroundColor: cs.onSecondaryContainer,
            child: Icon(icon),
          ),
          title: Text(title),
          subtitle: Text(subtitle, style: TextStyle(color: cs.onSurfaceVariant)),
          trailing: Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
        ),
      ),
    );
  }
}
