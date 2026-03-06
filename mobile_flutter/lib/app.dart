import 'package:flutter/material.dart';

import 'core/auth_store.dart';
import 'screens/contributions_screen.dart';
import 'screens/login_screen.dart';

class LgecMembersApp extends StatefulWidget {
  const LgecMembersApp({super.key});

  @override
  State<LgecMembersApp> createState() => _LgecMembersAppState();
}

class _LgecMembersAppState extends State<LgecMembersApp> {
  final AuthStore _authStore = AuthStore();
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    await _authStore.load();
    if (!mounted) return;
    setState(() {
      _ready = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'LGEC Members',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0A1730)),
        useMaterial3: true,
      ),
      home: !_ready
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : ValueListenableBuilder<bool>(
              valueListenable: _authStore.isAuthenticated,
              builder: (context, authenticated, _) {
                if (!authenticated) {
                  return LoginScreen(authStore: _authStore);
                }
                return ContributionsScreen(authStore: _authStore);
              },
            ),
    );
  }
}
