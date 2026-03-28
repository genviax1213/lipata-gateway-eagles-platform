import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lgec_members_mobile/core/api_client.dart';
import 'package:lgec_members_mobile/repositories/auth_repository.dart';

void main() {
  group('AuthRepository', () {
    test('login parses mobile auth payload', () async {
      final repository = AuthRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/login');
            return http.Response(
              jsonEncode(<String, dynamic>{
                'token': 'mobile-token',
                'user': <String, dynamic>{
                  'id': 10,
                  'name': 'Treasurer User',
                  'email': 'treasurer.user@lgec.org',
                  'must_change_password': true,
                  'mobile_access_enabled': true,
                  'finance_role': 'treasurer',
                  'permissions': <String>['finance.view', 'finance.input'],
                },
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final session = await repository.login(
        email: 'Treasurer.User@lgec.org',
        password: 'Password123',
      );

      expect(session.token, 'mobile-token');
      expect(session.email, 'treasurer.user@lgec.org');
      expect(session.mustChangePassword, isTrue);
      expect(session.hasPermission('finance.view'), isTrue);
      expect(session.financeRole, 'treasurer');
    });

    test('changePassword refreshes session through mobile me using returned token', () async {
      var sawChangePassword = false;

      final repository = AuthRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            if (request.url.path == '/api/v1/mobile/change-password') {
              sawChangePassword = true;
              expect(request.headers['authorization'], 'Bearer stale-token');
              return http.Response(
                jsonEncode(<String, dynamic>{
                  'message': 'Password updated successfully.',
                  'token': 'fresh-token',
                }),
                200,
                headers: <String, String>{'content-type': 'application/json'},
              );
            }

            expect(request.url.path, '/api/v1/mobile/me');
            expect(request.headers['authorization'], 'Bearer fresh-token');
            return http.Response(
              jsonEncode(<String, dynamic>{
                'id': 11,
                'name': 'Finance Auditor',
                'email': 'finance.auditor@lgec.org',
                'must_change_password': false,
                'mobile_access_enabled': true,
                'finance_role': 'auditor',
                'permissions': <String>['finance.view'],
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final session = await repository.changePassword(
        token: 'stale-token',
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword123',
      );

      expect(sawChangePassword, isTrue);
      expect(session.token, 'fresh-token');
      expect(session.mustChangePassword, isFalse);
      expect(session.hasPermission('finance.view'), isTrue);
    });
  });
}
