import 'package:flutter/material.dart';
import '../../widgets/auth_text_field.dart';
import '../auth/register_screen.dart';
import '../main/root_screen.dart';
import '../../services/auth_service.dart';

class LoginScreen extends StatefulWidget {
  static const routeName = '/login';

  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  final AuthService _authService = AuthService();

  bool _isLoading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }
  
  void _showForgotPasswordDialog() {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final emailCtrl = TextEditingController(text: _emailController.text.trim());
    bool sending = false;
    String? error;
    bool sent = false;

    showDialog(
      context: context,
      builder: (dlgCtx) => StatefulBuilder(
        builder: (_, setState) => AlertDialog(
          title: const Text('Reset password'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Enter your email and we\'ll send you a link to reset your password.',
                style: tt.bodyMedium,
              ),
              const SizedBox(height: 16),
              if (!sent)
                TextField(
                  controller: emailCtrl,
                  autofocus: true,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                ),
              if (sent)
                Text(
                  'Check your inbox — a reset link has been sent.',
                  style: TextStyle(color: cs.primary),
                ),
              if (error != null) ...[
                const SizedBox(height: 10),
                Text(error!, style: tt.bodyMedium?.copyWith(color: cs.error)),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dlgCtx),
              child: const Text('Close'),
            ),
            if (!sent)
              TextButton(
                onPressed: sending
                    ? null
                    : () async {
                        final email = emailCtrl.text.trim();
                        if (email.isEmpty || !email.contains('@')) {
                          setState(() => error = 'Enter a valid email address');
                          return;
                        }
                        setState(() { sending = true; error = null; });
                        try {
                          await _authService.resetPassword(email);
                          setState(() { sending = false; sent = true; });
                        } catch (_) {
                          setState(() {
                            sending = false;
                            error = 'Could not send reset email. Check the address and try again.';
                          });
                        }
                      },
                child: sending
                    ? const SizedBox(
                        height: 16, width: 16,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Send link'),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _login() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() {
      _isLoading = true;
    });

    try {
      await _authService.login(
        email: _emailController.text.trim(),
        password: _passwordController.text,  // not trimmed: the web app doesn't trim either
      );

      if (!mounted) return;

      Navigator.pushReplacementNamed(
        context,
        RootScreen.routeName,
      );
    } catch (e) {
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(  // the keyboard would otherwise cover the form
          child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 32),
              Row(
                children: [
                  Icon(Icons.eco, size: 36, color: cs.primary),
                  const SizedBox(width: 8),
                  Text('GrowNex', style: tt.titleLarge),
                ],
              ),
              const SizedBox(height: 32),
              Text(
                'Welcome back',
                style: tt.headlineSmall,
              ),
              const SizedBox(height: 12),
              Text(
                'Sign in to manage your plants, devices, and analytics.',
                style: tt.bodyLarge?.copyWith(color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 32),
              Form(
                key: _formKey,
                child: Column(
                  children: [
                    AuthTextField(
                      controller: _emailController,
                      label: 'Email',
                      hintText: 'you@example.com',
                      keyboardType: TextInputType.emailAddress,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Enter your email';
                        }
                        if (!value.contains('@')) {
                          return 'Enter a valid email';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),
                    AuthTextField(
                      controller: _passwordController,
                      label: 'Password',
                      hintText: 'Enter your password',
                      obscureText: true,
                      validator: (value) {
                        if (value == null || value.isEmpty) {
                          return 'Enter your password';
                        }
                        if (value.length < 6) {
                          return 'Password must be at least 6 characters';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 8),
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _showForgotPasswordDialog,
                        child: const Text('Forgot password?'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _login,
                        child: _isLoading
                            ? SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: cs.onPrimary,
                                ),
                              )
                            : const Text('Login'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text('Don\'t have an account?', style: TextStyle(color: cs.onSurfaceVariant)),
                  TextButton(
                    onPressed: () {
                      Navigator.pushNamed(context, RegisterScreen.routeName);
                    },
                    child: const Text('Register'),
                  ),
                ],
              ),
            ],
          ),
        ),
        ),
      ),
    );
  }
}
