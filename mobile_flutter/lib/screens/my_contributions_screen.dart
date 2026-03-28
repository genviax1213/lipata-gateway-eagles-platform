import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/auth_store.dart';
import '../models/contribution_payload.dart';
import '../repositories/finance_repository.dart';

class MyContributionsScreen extends StatefulWidget {
  const MyContributionsScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<MyContributionsScreen> createState() => _MyContributionsScreenState();
}

class _MyContributionsScreenState extends State<MyContributionsScreen> {
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
      final payload = await _repository.loadMyContributions(token);
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

    final payload = _payload;
    if (payload == null) {
      return const Center(child: Text('No contribution data available.'));
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    'My Contributions',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'This shows your posted contribution history and totals.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    currency.format(payload.totalAmount),
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Total recorded contributions',
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text('Category Totals', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  ...payload.categoryTotals.entries.map(
                    (MapEntry<String, double> entry) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        children: <Widget>[
                          Expanded(
                            child: Text(payload.categoryLabels[entry.key] ?? entry.key),
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
          const SizedBox(height: 12),
          Text(
            'History',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (payload.data.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('No contributions recorded yet.'),
              ),
            )
          else
            ...payload.data.map(
              (entry) => Card(
                child: ListTile(
                  title: Text(payload.categoryLabels[entry.category] ?? entry.categoryLabel),
                  subtitle: Text(entry.contributionDate),
                  trailing: Text(
                    currency.format(entry.amount),
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
