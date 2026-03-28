import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/auth_store.dart';
import '../models/mobile_finance_dashboard.dart';
import '../repositories/finance_repository.dart';

class FinanceDashboardScreen extends StatefulWidget {
  const FinanceDashboardScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<FinanceDashboardScreen> createState() => _FinanceDashboardScreenState();
}

class _FinanceDashboardScreenState extends State<FinanceDashboardScreen> {
  final FinanceRepository _repository = FinanceRepository();
  MobileFinanceDashboard? _dashboard;
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
      final dashboard = await _repository.loadDashboard(token);
      if (!mounted) return;
      setState(() {
        _dashboard = dashboard;
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

    final dashboard = _dashboard;
    if (dashboard == null) {
      return const Center(child: Text('No finance data available.'));
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(
            'Finance Dashboard',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 4),
          Text('Reporting month: ${dashboard.month}'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              _MetricCard(
                label: 'Collections',
                value: currency.format(dashboard.collectionsThisMonth),
              ),
              _MetricCard(
                label: 'Expenses',
                value: currency.format(dashboard.expensesThisMonth),
              ),
              _MetricCard(
                label: 'Unassigned',
                value: currency.format(dashboard.unassignedContributionTotal),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text('Account Balances', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  if (dashboard.accountBalances.isEmpty)
                    const Text('No account balances available.')
                  else
                    ...dashboard.accountBalances.map(
                      (FinanceBalance row) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Row(
                          children: <Widget>[
                            Expanded(child: Text(row.accountName)),
                            Text(currency.format(row.balance)),
                          ],
                        ),
                      ),
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
                  const Text('Recent Transactions', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  if (dashboard.latestTransactions.isEmpty)
                    const Text('No recent transactions.')
                  else
                    ...dashboard.latestTransactions.map(
                      (FinanceTransaction row) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(row.memberName ?? row.payeeName ?? row.category),
                        subtitle: Text('${row.type.toUpperCase()} • ${row.accountName ?? 'No account'}'),
                        trailing: Text(currency.format(row.amount)),
                      ),
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
                  const Text('Members With Gaps', style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 10),
                  if (dashboard.nonCompliantMembers.isEmpty)
                    const Text('No non-compliant members for the current month.')
                  else
                    ...dashboard.nonCompliantMembers.take(8).map(
                      (NonCompliantMember row) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(row.name),
                        subtitle: Text(row.memberNumber),
                        trailing: Text(currency.format(row.monthlyGap)),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 220,
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(label, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: 8),
              Text(value, style: Theme.of(context).textTheme.titleLarge),
            ],
          ),
        ),
      ),
    );
  }
}
