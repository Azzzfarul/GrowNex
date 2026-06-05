import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../services/auth_service.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _usernameCtrl    = TextEditingController();
  final _newPasswordCtrl = TextEditingController();
  final _confirmPwCtrl   = TextEditingController();
  final _currentPwCtrl   = TextEditingController();

  String _originalUsername = '';
  String _emailDisplay = '';
  bool _loadingInitialData = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  @override
  void dispose() {
    _usernameCtrl.dispose();
    _newPasswordCtrl.dispose();
    _confirmPwCtrl.dispose();
    _currentPwCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    final authUser = FirebaseAuth.instance.currentUser;
    final data = await AuthService().getCurrentUserData();
    if (mounted) {
      setState(() {
        final username = data?['username'] as String? ?? authUser?.displayName ?? '';
        _usernameCtrl.text = username;
        _originalUsername = username;
        _emailDisplay = authUser?.email ?? '';
        _loadingInitialData = false;
      });
    }
  }

  Future<void> _save() async {
    final username    = _usernameCtrl.text.trim();
    final newPassword = _newPasswordCtrl.text;
    final confirmPw   = _confirmPwCtrl.text;
    final currentPw   = _currentPwCtrl.text;

    if (newPassword.isNotEmpty) {
      if (newPassword.length < 6) {
        setState(() => _error = 'Password must be at least 6 characters');
        return;
      }
      if (newPassword != confirmPw) {
        setState(() => _error = 'Passwords do not match');
        return;
      }
      if (currentPw.isEmpty) {
        setState(() => _error = 'Enter your current password to confirm the change');
        return;
      }
    }

    final usernameChanged = username != _originalUsername;
    final passwordChanging = newPassword.isNotEmpty;

    if (!usernameChanged && !passwordChanging) {
      Navigator.pop(context);
      return;
    }

    setState(() { _saving = true; _error = null; });

    try {
      final svc = AuthService();

      if (usernameChanged) {
        await svc.updateUsername(username);
      }

      if (passwordChanging) {
        await svc.reauthenticate(currentPw);
        await svc.updatePassword(newPassword);
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated successfully')));
        Navigator.pop(context);
      }
    } on FirebaseAuthException catch (e) {
      setState(() => _error = switch (e.code) {
        'wrong-password'        => 'Current password is incorrect',
        'invalid-credential'    => 'Current password is incorrect',
        'requires-recent-login' => 'Please log out and log back in, then try again',
        _                       => e.message ?? 'An error occurred',
      });
    } catch (e) {
      setState(() => _error = 'An error occurred. Please try again.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loadingInitialData) {
      return Scaffold(
        appBar: AppBar(title: const Text('Edit Profile')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final cs = Theme.of(context).colorScheme;
    final passwordChanging = _newPasswordCtrl.text.isNotEmpty;

    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ── Account Info ─────────────────────────────────────────
          Text('Account Info',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: Colors.green[700],
                  letterSpacing: 0.8)),
          const SizedBox(height: 10),

          TextField(
            controller: _usernameCtrl,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'Username',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.person_outline),
            ),
          ),
          const SizedBox(height: 12),

          TextFormField(
            initialValue: _emailDisplay,
            readOnly: true,
            decoration: InputDecoration(
              labelText: 'Email',
              border: const OutlineInputBorder(),
              prefixIcon: const Icon(Icons.email_outlined),
              filled: true,
              fillColor: cs.onSurface.withValues(alpha: 0.06),
              helperText: 'Email cannot be changed',
            ),
          ),

          const SizedBox(height: 28),

          // ── Change Password ───────────────────────────────────────
          Text('Change Password',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: Colors.green[700],
                  letterSpacing: 0.8)),
          const SizedBox(height: 4),
          Text('Leave blank to keep your current password',
              style: TextStyle(
                  fontSize: 13, color: cs.onSurface.withValues(alpha: 0.55))),
          const SizedBox(height: 10),

          TextField(
            controller: _newPasswordCtrl,
            obscureText: true,
            textInputAction: TextInputAction.next,
            decoration: const InputDecoration(
              labelText: 'New password',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.lock_outline),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),

          TextField(
            controller: _confirmPwCtrl,
            obscureText: true,
            textInputAction: passwordChanging
                ? TextInputAction.next
                : TextInputAction.done,
            decoration: const InputDecoration(
              labelText: 'Confirm password',
              border: OutlineInputBorder(),
              prefixIcon: Icon(Icons.lock_outline),
            ),
          ),

          // Current password — only shown when changing password
          if (passwordChanging) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _currentPwCtrl,
              obscureText: true,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: 'Current password',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.lock_person_outlined),
                helperText: 'Required to confirm password change',
              ),
            ),
          ],

          // Error message
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!,
                style: const TextStyle(color: Colors.red, fontSize: 13)),
          ],

          const SizedBox(height: 28),

          ElevatedButton(
            onPressed: _saving ? null : _save,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green[700],
              foregroundColor: Colors.white,
              disabledBackgroundColor: Colors.green[200],
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
            child: _saving
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Save Changes',
                    style: TextStyle(fontSize: 16)),
          ),
        ],
      ),
    );
  }
}
