import '../core/api_client.dart';
import '../models/user_session.dart';

class AuthRepository {
  AuthRepository({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<UserSession> login({
    required String email,
    required String password,
  }) async {
    final data = await _apiClient.postJson('/mobile/login', <String, dynamic>{
      'email': email.trim().toLowerCase(),
      'password': password,
    });

    final user = (data['user'] as Map<String, dynamic>? ?? <String, dynamic>{});
    final token = data['token']?.toString() ?? '';
    if (token.isEmpty) {
      throw ApiException('Login succeeded but no API token was returned.');
    }

    return UserSession(
      token: token,
      name: user['name']?.toString() ?? '',
      email: user['email']?.toString() ?? email.trim().toLowerCase(),
      userId: (user['id'] as num?)?.toInt() ?? 0,
      mustChangePassword: user['must_change_password'] == true,
      mobileAccessEnabled: user['mobile_access_enabled'] == true,
      permissions: (user['permissions'] as List<dynamic>? ?? const <dynamic>[])
          .map((dynamic value) => value.toString())
          .toList(growable: false),
      primaryRole: user['role']?['name']?.toString() ?? user['role_name']?.toString(),
      financeRole: user['finance_role']?.toString(),
    );
  }

  Future<UserSession> me(String token) async {
    final data = await _apiClient.getJson('/mobile/me', token: token);

    return UserSession(
      token: token,
      name: data['name']?.toString() ?? '',
      email: data['email']?.toString() ?? '',
      userId: (data['id'] as num?)?.toInt() ?? 0,
      mustChangePassword: data['must_change_password'] == true,
      mobileAccessEnabled: data['mobile_access_enabled'] == true,
      permissions: (data['permissions'] as List<dynamic>? ?? const <dynamic>[])
          .map((dynamic value) => value.toString())
          .toList(growable: false),
      primaryRole: data['role']?['name']?.toString() ?? data['role_name']?.toString(),
      financeRole: data['finance_role']?.toString(),
    );
  }

  Future<UserSession> changePassword({
    required String token,
    required String currentPassword,
    required String newPassword,
  }) async {
    final data = await _apiClient.postJson(
      '/mobile/change-password',
      <String, dynamic>{
        'current_password': currentPassword,
        'new_password': newPassword,
        'new_password_confirmation': newPassword,
      },
      token: token,
    );

    final refreshedToken = data['token']?.toString() ?? token;
    return me(refreshedToken);
  }

  Future<void> forgotPassword(String email) async {
    await _apiClient.postJson('/mobile/forgot-password', <String, dynamic>{
      'email': email.trim().toLowerCase(),
    });
  }

  Future<void> logout(String token) async {
    try {
      await _apiClient.postJson('/mobile/logout', <String, dynamic>{}, token: token);
    } catch (_) {
      // Keep local logout deterministic even when remote token revoke fails.
    }
  }
}
