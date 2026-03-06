import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/user_session.dart';

class AuthStore {
  static const String _sessionKey = 'lgec_user_session';

  final ValueNotifier<bool> isAuthenticated = ValueNotifier<bool>(false);

  UserSession? _session;

  UserSession? get session => _session;

  Future<void> load() async {
    final preferences = await SharedPreferences.getInstance();
    final raw = preferences.getString(_sessionKey);
    if (raw == null || raw.isEmpty) {
      isAuthenticated.value = false;
      return;
    }

    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      _session = UserSession.fromJson(map);
      isAuthenticated.value = _session?.token.isNotEmpty == true;
    } catch (_) {
      await preferences.remove(_sessionKey);
      _session = null;
      isAuthenticated.value = false;
    }
  }

  Future<void> save(UserSession session) async {
    _session = session;
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString(_sessionKey, jsonEncode(session.toJson()));
    isAuthenticated.value = true;
  }

  Future<void> clear() async {
    _session = null;
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove(_sessionKey);
    isAuthenticated.value = false;
  }
}
