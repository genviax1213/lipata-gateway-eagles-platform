import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lgec_members_mobile/core/api_client.dart';
import 'package:lgec_members_mobile/repositories/announcements_repository.dart';

void main() {
  group('AnnouncementsRepository', () {
    test('loadAnnouncements parses member announcements list', () async {
      final repository = AnnouncementsRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/announcements');
            return http.Response(
              jsonEncode(<Map<String, dynamic>>[
                <String, dynamic>{
                  'id': 7,
                  'title': 'Finance Notice',
                  'slug': 'finance-notice',
                  'excerpt': 'Summary',
                  'content': '<p>Body</p>',
                  'announcement_text': 'Read this',
                  'published_at': '2026-03-25T08:00:00Z',
                  'acknowledged_at': null,
                  'image_url': null,
                },
              ]),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final rows = await repository.loadAnnouncements('mobile-token');

      expect(rows.single.slug, 'finance-notice');
      expect(rows.single.isAcknowledged, isFalse);
    });

    test('acknowledge returns acknowledged timestamp', () async {
      final repository = AnnouncementsRepository(
        apiClient: ApiClient(
          client: MockClient((http.Request request) async {
            expect(request.url.path, '/api/v1/mobile/announcements/7/acknowledge');
            return http.Response(
              jsonEncode(<String, dynamic>{
                'message': 'Announcement acknowledged.',
                'acknowledged_at': '2026-03-25T09:00:00Z',
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          }),
        ),
      );

      final acknowledgedAt = await repository.acknowledge(
        token: 'mobile-token',
        announcementId: 7,
      );

      expect(acknowledgedAt, isNotNull);
      expect(acknowledgedAt!.toUtc().hour, 9);
    });
  });
}
