import '../core/api_client.dart';
import '../models/user_session.dart';

class AuthRepository {
  AuthRepository({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<UserSession> login({
    required String email,
    required String password,
  }) async {
    final data = await _apiClient.postJson('/login', <String, dynamic>{
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
    );
  }

  Future<void> logout(String token) async {
    try {
      await _apiClient.postJson('/logout', <String, dynamic>{}, token: token);
    } catch (_) {
      // Keep local logout deterministic even when remote token revoke fails.
    }
  }
}
