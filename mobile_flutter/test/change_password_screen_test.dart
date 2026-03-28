import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lgec_members_mobile/core/auth_store.dart';
import 'package:lgec_members_mobile/models/user_session.dart';
import 'package:lgec_members_mobile/screens/change_password_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('ChangePasswordScreen validates mismatched new passwords', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues(<String, Object>{});

    final authStore = AuthStore();
    await authStore.save(
      UserSession(
        token: 'mobile-token',
        name: 'Finance User',
        email: 'finance.user@lgec.org',
        userId: 5,
        mustChangePassword: true,
        mobileAccessEnabled: true,
        permissions: const <String>['finance.view'],
        financeRole: 'treasurer',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: ChangePasswordScreen(authStore: authStore),
      ),
    );

    await tester.enterText(find.byType(TextFormField).at(0), 'OldPassword123');
    await tester.enterText(find.byType(TextFormField).at(1), 'NewPassword123');
    await tester.enterText(find.byType(TextFormField).at(2), 'Mismatch123');
    await tester.tap(find.text('Update Password'));
    await tester.pump();

    expect(find.text('Passwords do not match'), findsOneWidget);
  });
}
