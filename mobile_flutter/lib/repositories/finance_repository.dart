import '../core/api_client.dart';
import '../models/contribution_payload.dart';
import '../models/finance_account.dart';
import '../models/finance_member.dart';
import '../models/finance_member_summary.dart';
import '../models/mobile_finance_dashboard.dart';

class FinanceRepository {
  FinanceRepository({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<MobileFinanceDashboard> loadDashboard(String token) async {
    final payload = await _apiClient.getJson('/mobile/finance/dashboard', token: token);
    return MobileFinanceDashboard.fromJson(payload);
  }

  Future<ContributionPayload> loadMyContributions(String token) async {
    final payload = await _apiClient.getJson('/mobile/finance/my-contributions', token: token);
    return ContributionPayload.fromJson(payload);
  }

  Future<List<FinanceMember>> searchMembers({
    required String token,
    String search = '',
  }) async {
    final payload = await _apiClient.getJson(
      '/mobile/finance/members',
      token: token,
      query: search.trim().isEmpty ? null : <String, String>{'search': search.trim()},
    );

    final rows = payload['data'] is List<dynamic> ? payload['data'] as List<dynamic> : payload as List<dynamic>;
    return rows
        .whereType<Map<String, dynamic>>()
        .map(FinanceMember.fromJson)
        .toList(growable: false);
  }

  Future<FinanceMemberSummary> loadMemberSummary({
    required String token,
    required int memberId,
  }) async {
    final payload = await _apiClient.getJson('/mobile/finance/members/$memberId/summary', token: token);
    return FinanceMemberSummary.fromJson(payload);
  }

  Future<ContributionPayload> loadMemberContributions({
    required String token,
    required int memberId,
  }) async {
    final payload = await _apiClient.getJson('/mobile/finance/members/$memberId/contributions', token: token);
    return ContributionPayload.fromJson(payload);
  }

  Future<List<FinanceAccount>> loadAccounts(String token) async {
    final payload = await _apiClient.getJson('/mobile/finance/accounts', token: token);
    final rows = payload['data'] is List<dynamic> ? payload['data'] as List<dynamic> : payload as List<dynamic>;
    return rows
        .whereType<Map<String, dynamic>>()
        .map(FinanceAccount.fromJson)
        .toList(growable: false);
  }

  Future<void> createContribution({
    required String token,
    required int memberId,
    required String memberEmail,
    required double amount,
    required String note,
    required String category,
    required String contributionDate,
    required int financeAccountId,
    int? beneficiaryMemberId,
    String? recipientName,
  }) async {
    await _apiClient.postJson(
      '/mobile/finance/contributions',
      <String, dynamic>{
        'member_id': memberId,
        'member_email': memberEmail,
        'amount': amount,
        'note': note,
        'category': category,
        'contribution_date': contributionDate,
        'finance_account_id': financeAccountId,
        if (beneficiaryMemberId != null) 'beneficiary_member_id': beneficiaryMemberId,
        if (recipientName != null && recipientName.trim().isNotEmpty) 'recipient_name': recipientName.trim(),
      },
      token: token,
    );
  }

  Future<void> createExpense({
    required String token,
    required String category,
    required String expenseDate,
    required double amount,
    required String note,
    required String payeeName,
    required int financeAccountId,
    String? supportReference,
    String? approvalReference,
    int? beneficiaryMemberId,
  }) async {
    await _apiClient.postJson(
      '/mobile/finance/expenses',
      <String, dynamic>{
        'category': category,
        'expense_date': expenseDate,
        'amount': amount,
        'note': note,
        'payee_name': payeeName,
        'finance_account_id': financeAccountId,
        if (supportReference != null && supportReference.trim().isNotEmpty) 'support_reference': supportReference.trim(),
        if (approvalReference != null && approvalReference.trim().isNotEmpty) 'approval_reference': approvalReference.trim(),
        if (beneficiaryMemberId != null) 'beneficiary_member_id': beneficiaryMemberId,
      },
      token: token,
    );
  }
}
