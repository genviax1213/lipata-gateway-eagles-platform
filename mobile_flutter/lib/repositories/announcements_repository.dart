import '../core/api_client.dart';
import '../models/announcement.dart';

class AnnouncementsRepository {
  AnnouncementsRepository({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<List<Announcement>> loadAnnouncements(String token) async {
    final payload = await _apiClient.getJson('/mobile/announcements', token: token);
    final rows = payload['data'] is List<dynamic> ? payload['data'] as List<dynamic> : payload as List<dynamic>;

    return rows
        .whereType<Map<String, dynamic>>()
        .map(Announcement.fromJson)
        .toList(growable: false);
  }

  Future<Announcement> loadAnnouncementDetail({
    required String token,
    required String slug,
  }) async {
    final payload = await _apiClient.getJson('/mobile/announcements/$slug', token: token);
    return Announcement.fromJson(payload);
  }

  Future<DateTime?> acknowledge({
    required String token,
    required int announcementId,
  }) async {
    final payload = await _apiClient.postJson(
      '/mobile/announcements/$announcementId/acknowledge',
      <String, dynamic>{},
      token: token,
    );

    return DateTime.tryParse(payload['acknowledged_at']?.toString() ?? '');
  }
}
