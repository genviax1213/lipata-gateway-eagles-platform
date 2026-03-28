import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/auth_store.dart';
import '../models/contribution_payload.dart';
import '../models/finance_member.dart';
import '../models/finance_member_summary.dart';
import '../repositories/finance_repository.dart';

class FinanceMembersScreen extends StatefulWidget {
  const FinanceMembersScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<FinanceMembersScreen> createState() => _FinanceMembersScreenState();
}

class _FinanceMembersScreenState extends State<FinanceMembersScreen> {
  final FinanceRepository _repository = FinanceRepository();
  final TextEditingController _searchController = TextEditingController();
  Timer? _debounce;

  List<FinanceMember> _members = <FinanceMember>[];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load([String search = '']) async {
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
      final members = await _repository.searchMembers(token: token, search: search);
      if (!mounted) return;
      setState(() {
        _members = members;
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

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _load(value);
    });
  }

  Future<void> _openMember(FinanceMember member) async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (BuildContext context) => FinanceMemberSummaryScreen(
          authStore: widget.authStore,
          member: member,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.all(16),
          child: TextField(
            controller: _searchController,
            decoration: const InputDecoration(
              labelText: 'Search members',
              prefixIcon: Icon(Icons.search),
            ),
            onChanged: _onSearchChanged,
          ),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _error != null
                  ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!)))
                  : RefreshIndicator(
                      onRefresh: () => _load(_searchController.text),
                      child: ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                        itemCount: _members.length,
                        itemBuilder: (BuildContext context, int index) {
                          final member = _members[index];
                          return Card(
                            child: ListTile(
                              title: Text(member.name),
                              subtitle: Text(member.memberNumber),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => _openMember(member),
                            ),
                          );
                        },
                      ),
                    ),
        ),
      ],
    );
  }
}

class FinanceMemberSummaryScreen extends StatefulWidget {
  const FinanceMemberSummaryScreen({
    super.key,
    required this.authStore,
    required this.member,
  });

  final AuthStore authStore;
  final FinanceMember member;

  @override
  State<FinanceMemberSummaryScreen> createState() => _FinanceMemberSummaryScreenState();
}

class _FinanceMemberSummaryScreenState extends State<FinanceMemberSummaryScreen> {
  final FinanceRepository _repository = FinanceRepository();
  FinanceMemberSummary? _summary;
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
      final summary = await _repository.loadMemberSummary(
        token: token,
        memberId: widget.member.id,
      );
      if (!mounted) return;
      setState(() {
        _summary = summary;
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

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(locale: 'en_PH', symbol: 'PHP ');

    return Scaffold(
      appBar: AppBar(title: Text(widget.member.name)),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: <Widget>[
                        Card(
                          child: ListTile(
                            title: Text(_summary?.name ?? widget.member.name),
                            subtitle: Text(_summary?.memberNumber ?? widget.member.memberNumber),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                const Text('Total Contributions', style: TextStyle(fontWeight: FontWeight.w700)),
                                const SizedBox(height: 8),
                                Text(
                                  currency.format(_summary?.totalAmount ?? 0),
                                  style: Theme.of(context).textTheme.headlineSmall,
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                const Text('Category Totals', style: TextStyle(fontWeight: FontWeight.w700)),
                                const SizedBox(height: 10),
                                ...?_summary?.categoryTotals.entries.map(
                                  (MapEntry<String, double> entry) => Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Row(
                                      children: <Widget>[
                                        Expanded(
                                          child: Text(_summary?.categoryLabels[entry.key] ?? entry.key),
                                        ),
                                        Text(currency.format(entry.value)),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                const Text('Latest Entries', style: TextStyle(fontWeight: FontWeight.w700)),
                                const SizedBox(height: 10),
                                ...?_summary?.latestEntries.map(
                                  (entry) => ListTile(
                                    contentPadding: EdgeInsets.zero,
                                    title: Text(entry.categoryLabel),
                                    subtitle: Text(entry.contributionDate),
                                    trailing: Text(currency.format(entry.amount)),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                builder: (BuildContext context) => MemberContributionHistoryScreen(
                                  authStore: widget.authStore,
                                  member: widget.member,
                                ),
                              ),
                            );
                          },
                          icon: const Icon(Icons.receipt_long),
                          label: const Text('View Contribution History'),
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }
}

class MemberContributionHistoryScreen extends StatefulWidget {
  const MemberContributionHistoryScreen({
    super.key,
    required this.authStore,
    required this.member,
  });

  final AuthStore authStore;
  final FinanceMember member;

  @override
  State<MemberContributionHistoryScreen> createState() => _MemberContributionHistoryScreenState();
}

class _MemberContributionHistoryScreenState extends State<MemberContributionHistoryScreen> {
  final FinanceRepository _repository = FinanceRepository();
  ContributionPayload? _payload;
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
      final payload = await _repository.loadMemberContributions(
        token: token,
        memberId: widget.member.id,
      );
      if (!mounted) return;
      setState(() {
        _payload = payload;
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

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(locale: 'en_PH', symbol: 'PHP ');

    return Scaffold(
      appBar: AppBar(title: Text('${widget.member.name} Contributions')),
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? Center(child: Padding(padding: const EdgeInsets.all(20), child: Text(_error!)))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      padding: const EdgeInsets.all(16),
                      children: <Widget>[
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                const Text('Total Contributions', style: TextStyle(fontWeight: FontWeight.w700)),
                                const SizedBox(height: 8),
                                Text(
                                  currency.format(_payload?.totalAmount ?? 0),
                                  style: Theme.of(context).textTheme.headlineSmall,
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        ...?_payload?.data.map(
                          (entry) => Card(
                            child: ListTile(
                              title: Text(entry.categoryLabel),
                              subtitle: Text(
                                [
                                  entry.contributionDate,
                                  if (entry.note.trim().isNotEmpty) entry.note.trim(),
                                  if (entry.recipientIndicator.trim().isNotEmpty) entry.recipientIndicator.trim(),
                                ].join(' • '),
                              ),
                              trailing: Text(currency.format(entry.amount)),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
      ),
    );
  }
}
