import '../core/api_client.dart';
import '../models/contribution_payload.dart';

class ContributionsRepository {
  ContributionsRepository({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<ContributionPayload> loadMyContributions(String token) async {
    final payload = await _apiClient.getJson('/finance/my-contributions', token: token);
    return ContributionPayload.fromJson(payload);
  }

  Future<void> requestEdit({
    required String token,
    required int contributionId,
    required double requestedAmount,
    required String reason,
  }) async {
    await _apiClient.postJson(
      '/finance/contributions/$contributionId/edit-requests',
      <String, dynamic>{
        'requested_amount': requestedAmount,
        'reason': reason,
      },
      token: token,
    );
  }
}
