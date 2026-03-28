import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lgec_members_mobile/core/api_client.dart';
import 'package:lgec_members_mobile/repositories/finance_repository.dart';

void main() {
  group('FinanceRepository', () {
    test('loadMyContributions parses personal contribution history payload', () async {
      final repository = FinanceRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/finance/my-contributions');
            return http.Response(
              jsonEncode(<String, dynamic>{
                'total_amount': 900,
                'category_labels': <String, dynamic>{
                  'monthly_contribution': 'Monthly Contribution',
                },
                'category_totals': <String, dynamic>{
                  'monthly_contribution': 900,
                },
                'data': <Map<String, dynamic>>[
                  <String, dynamic>{
                    'id': 3,
                    'amount': 450,
                    'note': 'March payment',
                    'category': 'monthly_contribution',
                    'category_label': 'Monthly Contribution',
                    'contribution_date': '2026-03-15',
                    'recipient_indicator': '',
                  },
                ],
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final payload = await repository.loadMyContributions('mobile-token');

      expect(payload.totalAmount, 900);
      expect(payload.data.single.note, 'March payment');
    });

    test('loadDashboard parses mobile finance payload', () async {
      final repository = FinanceRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/finance/dashboard');
            return http.Response(
              jsonEncode(<String, dynamic>{
                'period': <String, dynamic>{'month': '2026-03'},
                'totals': <String, dynamic>{
                  'collections_this_month': 1500,
                  'expenses_this_month': 350,
                },
                'unassigned_contribution_total': 125,
                'account_balances': <Map<String, dynamic>>[
                  <String, dynamic>{'name': 'Cash on Hand', 'balance': 2200},
                ],
                'compliance': <String, dynamic>{
                  'non_compliant_members': <Map<String, dynamic>>[
                    <String, dynamic>{
                      'member_number': 'M-001',
                      'name': 'John Doe',
                      'monthly_gap': 500,
                    },
                  ],
                },
                'latest_transactions': <Map<String, dynamic>>[
                  <String, dynamic>{
                    'id': 1,
                    'type': 'contribution',
                    'category': 'monthly_contribution',
                    'amount': 500,
                    'date': '2026-03-25',
                    'member': <String, dynamic>{'name': 'John Doe'},
                    'finance_account': <String, dynamic>{'name': 'Cash on Hand'},
                  },
                ],
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final dashboard = await repository.loadDashboard('mobile-token');

      expect(dashboard.month, '2026-03');
      expect(dashboard.collectionsThisMonth, 1500);
      expect(dashboard.accountBalances.single.accountName, 'Cash on Hand');
      expect(dashboard.latestTransactions.single.memberName, 'John Doe');
      expect(dashboard.nonCompliantMembers.single.monthlyGap, 500);
    });

    test('loadMemberSummary parses summary and entries', () async {
      final repository = FinanceRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/finance/members/15/summary');
            return http.Response(
              jsonEncode(<String, dynamic>{
                'member': <String, dynamic>{
                  'id': 15,
                  'member_number': 'M-015',
                  'name': 'Jane Finance',
                  'email': 'jane@example.com',
                },
                'total_amount': 1750,
                'category_totals': <String, dynamic>{
                  'monthly_contribution': 1250,
                  'project_contribution': 500,
                },
                'category_labels': <String, dynamic>{
                  'monthly_contribution': 'Monthly Contribution',
                  'project_contribution': 'Project Contribution',
                },
                'latest_entries': <Map<String, dynamic>>[
                  <String, dynamic>{
                    'id': 9,
                    'amount': 500,
                    'note': 'Project support',
                    'category': 'project_contribution',
                    'category_label': 'Project Contribution',
                    'contribution_date': '2026-03-24',
                    'recipient_indicator': '',
                  },
                ],
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final summary = await repository.loadMemberSummary(
        token: 'mobile-token',
        memberId: 15,
      );

      expect(summary.memberNumber, 'M-015');
      expect(summary.totalAmount, 1750);
      expect(summary.latestEntries.single.categoryLabel, 'Project Contribution');
    });

    test('loadMemberContributions parses contribution history payload', () async {
      final repository = FinanceRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/finance/members/15/contributions');
            return http.Response(
              jsonEncode(<String, dynamic>{
                'total_amount': 900,
                'category_labels': <String, dynamic>{
                  'monthly_contribution': 'Monthly Contribution',
                },
                'category_totals': <String, dynamic>{
                  'monthly_contribution': 900,
                },
                'data': <Map<String, dynamic>>[
                  <String, dynamic>{
                    'id': 3,
                    'amount': 450,
                    'note': 'March payment',
                    'category': 'monthly_contribution',
                    'category_label': 'Monthly Contribution',
                    'contribution_date': '2026-03-15',
                    'recipient_indicator': '',
                  },
                ],
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final payload = await repository.loadMemberContributions(
        token: 'mobile-token',
        memberId: 15,
      );

      expect(payload.totalAmount, 900);
      expect(payload.data.single.note, 'March payment');
    });

    test('loadAccounts parses mobile finance account list', () async {
      final repository = FinanceRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/finance/accounts');
            return http.Response(
              jsonEncode(<Map<String, dynamic>>[
                <String, dynamic>{
                  'id': 1,
                  'code': 'bank',
                  'name': 'Bank',
                  'account_type': 'asset',
                },
              ]),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final accounts = await repository.loadAccounts('mobile-token');

      expect(accounts.single.code, 'bank');
      expect(accounts.single.name, 'Bank');
    });

    test('createContribution posts mobile contribution payload', () async {
      final repository = FinanceRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/finance/contributions');
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            expect(body['member_id'], 15);
            expect(body['finance_account_id'], 2);
            expect(body['category'], 'monthly_contribution');

            return http.Response(
              jsonEncode(<String, dynamic>{'id': 22}),
              201,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      await repository.createContribution(
        token: 'mobile-token',
        memberId: 15,
        memberEmail: 'jane@example.com',
        amount: 500,
        note: 'Mobile entry',
        category: 'monthly_contribution',
        contributionDate: '2026-03-25',
        financeAccountId: 2,
      );
    });

    test('createExpense posts mobile expense payload', () async {
      final repository = FinanceRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/finance/expenses');
            final body = jsonDecode(request.body) as Map<String, dynamic>;
            expect(body['finance_account_id'], 2);
            expect(body['category'], 'administrative_expense');
            expect(body['payee_name'], 'Office Hub');

            return http.Response(
              jsonEncode(<String, dynamic>{'id': 33}),
              201,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      await repository.createExpense(
        token: 'mobile-token',
        category: 'administrative_expense',
        expenseDate: '2026-03-25',
        amount: 200,
        note: 'Office supplies',
        payeeName: 'Office Hub',
        financeAccountId: 2,
      );
    });
  });
}
