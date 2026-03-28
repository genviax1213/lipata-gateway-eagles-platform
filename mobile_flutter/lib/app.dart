import 'package:flutter/material.dart';

import 'core/auth_store.dart';
import 'repositories/auth_repository.dart';
import 'screens/change_password_screen.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';

class LgecMembersApp extends StatefulWidget {
  const LgecMembersApp({super.key});

  @override
  State<LgecMembersApp> createState() => _LgecMembersAppState();
}

class _LgecMembersAppState extends State<LgecMembersApp> {
  final AuthStore _authStore = AuthStore();
  final AuthRepository _authRepository = AuthRepository();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _authStore.load();
    final token = _authStore.session?.token;
    if (token != null && token.isNotEmpty) {
      try {
        final refreshed = await _authRepository.me(token);
        await _authStore.save(refreshed);
      } catch (_) {
        await _authStore.clear();
      }
    }
    if (!mounted) return;
    setState(() {
      _ready = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LGEC Internal',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0A1730),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFF07111F),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0x26FFFFFF),
          labelStyle: const TextStyle(color: Color(0xFFD6E4F6)),
          hintStyle: const TextStyle(color: Color(0x99D6E4F6)),
          isDense: true,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0x33FFFFFF)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0x33FFFFFF)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFFE2B55F), width: 1.4),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFFE07A7A)),
          ),
          focusedErrorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFFE07A7A), width: 1.4),
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
        snackBarTheme: const SnackBarThemeData(
          behavior: SnackBarBehavior.floating,
          backgroundColor: Color(0xFF11243D),
        ),
      ),
      home: !_ready
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : ValueListenableBuilder<bool>(
              valueListenable: _authStore.isAuthenticated,
              builder: (context, authenticated, _) {
                if (!authenticated) {
                  return LoginScreen(authStore: _authStore);
                }

                final session = _authStore.session;
                if (session == null) {
                  return LoginScreen(authStore: _authStore);
                }

                if (session.mustChangePassword) {
                  return ChangePasswordScreen(authStore: _authStore);
                }

                return HomeScreen(authStore: _authStore);
              },
            ),
    );
  }
}
