import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/auth_store.dart';
import '../models/announcement.dart';
import '../repositories/announcements_repository.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  final AnnouncementsRepository _repository = AnnouncementsRepository();
  List<Announcement> _announcements = <Announcement>[];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final token = widget.authStore.session?.token;
    if (token == null || token.isEmpty) {
      await widget.authStore.clear();
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final announcements = await _repository.loadAnnouncements(token);
      if (!mounted) return;
      setState(() {
        _announcements = announcements;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _openAnnouncement(Announcement announcement) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (BuildContext context) => AnnouncementDetailScreen(
          authStore: widget.authStore,
          announcement: announcement,
        ),
      ),
    );
    if (!mounted) return;
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final formatter = DateFormat('MMM d, y');

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text(_error!),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _announcements.length,
        itemBuilder: (BuildContext context, int index) {
          final announcement = _announcements[index];
          return Card(
            child: ListTile(
              title: Text(announcement.title),
              subtitle: Text(
                [
                  if ((announcement.announcementText ?? '').trim().isNotEmpty) announcement.announcementText!.trim(),
                  if (announcement.publishedAt != null) formatter.format(announcement.publishedAt!),
                ].join(' • '),
              ),
              trailing: announcement.isAcknowledged
                  ? const Icon(Icons.check_circle, color: Colors.green)
                  : const Icon(Icons.chevron_right),
              onTap: () => _openAnnouncement(announcement),
            ),
          );
        },
      ),
    );
  }
}

class AnnouncementDetailScreen extends StatefulWidget {
  const AnnouncementDetailScreen({
    super.key,
    required this.authStore,
    required this.announcement,
  });

  final AuthStore authStore;
  final Announcement announcement;

  @override
  State<AnnouncementDetailScreen> createState() => _AnnouncementDetailScreenState();
}

class _AnnouncementDetailScreenState extends State<AnnouncementDetailScreen> {
  final AnnouncementsRepository _repository = AnnouncementsRepository();
  Announcement? _announcement;
  bool _loading = true;
  bool _acknowledging = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _announcement = widget.announcement;
    _load();
  }

  Future<void> _load() async {
    final token = widget.authStore.session?.token;
    if (token == null || token.isEmpty) {
      await widget.authStore.clear();
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final detail = await _repository.loadAnnouncementDetail(
        token: token,
        slug: widget.announcement.slug,
      );
      if (!mounted) return;
      setState(() {
        _announcement = detail;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }

  Future<void> _acknowledge() async {
    final token = widget.authStore.session?.token;
    final announcement = _announcement;
    if (token == null || token.isEmpty || announcement == null) {
      return;
    }

    setState(() {
      _acknowledging = true;
    });

    try {
      final acknowledgedAt = await _repository.acknowledge(
        token: token,
        announcementId: announcement.id,
      );
      if (!mounted) return;
      final updated = announcement.copyWith(acknowledgedAt: acknowledgedAt ?? DateTime.now());
      setState(() {
        _announcement = updated;
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) {
        setState(() {
          _acknowledging = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final announcement = _announcement;
    final formatter = DateFormat('MMM d, y h:mm a');

    return Scaffold(
      appBar: AppBar(title: const Text('Announcement')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!)))
                : announcement == null
                    ? const Center(child: Text('Announcement not found.'))
                    : ListView(
                        padding: const EdgeInsets.all(16),
                        children: <Widget>[
                          Text(
                            announcement.title,
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          const SizedBox(height: 8),
                          if (announcement.publishedAt != null)
                            Text(formatter.format(announcement.publishedAt!)),
                          const SizedBox(height: 16),
                          if ((announcement.excerpt).trim().isNotEmpty) ...<Widget>[
                            Text(
                              announcement.excerpt.trim(),
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                            const SizedBox(height: 16),
                          ],
                          Text(_stripHtml(announcement.content)),
                          const SizedBox(height: 20),
                          FilledButton.icon(
                            onPressed: announcement.isAcknowledged || _acknowledging ? null : _acknowledge,
                            icon: _acknowledging
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Icon(Icons.check),
                            label: Text(
                              announcement.isAcknowledged ? 'Acknowledged' : 'Acknowledge',
                            ),
                          ),
                        ],
                      ),
      ),
    );
  }
}

String _stripHtml(String value) {
  return value
      .replaceAll(RegExp(r'<[^>]*>'), ' ')
      .replaceAll('&nbsp;', ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}
