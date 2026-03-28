class Announcement {
  Announcement({
    required this.id,
    required this.title,
    required this.slug,
    required this.excerpt,
    required this.content,
    required this.announcementText,
    required this.publishedAt,
    required this.acknowledgedAt,
    required this.imageUrl,
  });

  final int id;
  final String title;
  final String slug;
  final String excerpt;
  final String content;
  final String? announcementText;
  final DateTime? publishedAt;
  final DateTime? acknowledgedAt;
  final String? imageUrl;

  bool get isAcknowledged => acknowledgedAt != null;

  factory Announcement.fromJson(Map<String, dynamic> json) {
    return Announcement(
      id: (json['id'] as num?)?.toInt() ?? 0,
      title: json['title']?.toString() ?? '',
      slug: json['slug']?.toString() ?? '',
      excerpt: json['excerpt']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      announcementText: json['announcement_text']?.toString(),
      publishedAt: DateTime.tryParse(json['published_at']?.toString() ?? ''),
      acknowledgedAt: DateTime.tryParse(json['acknowledged_at']?.toString() ?? ''),
      imageUrl: json['image_url']?.toString(),
    );
  }

  Announcement copyWith({DateTime? acknowledgedAt}) {
    return Announcement(
      id: id,
      title: title,
      slug: slug,
      excerpt: excerpt,
      content: content,
      announcementText: announcementText,
      publishedAt: publishedAt,
      acknowledgedAt: acknowledgedAt ?? this.acknowledgedAt,
      imageUrl: imageUrl,
    );
  }
}
