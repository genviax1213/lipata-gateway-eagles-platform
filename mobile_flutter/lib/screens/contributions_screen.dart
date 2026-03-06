import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../core/auth_store.dart';
import '../models/contribution.dart';
import '../models/contribution_payload.dart';
import '../repositories/auth_repository.dart';
import '../repositories/contributions_repository.dart';

class ContributionsScreen extends StatefulWidget {
  const ContributionsScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<ContributionsScreen> createState() => _ContributionsScreenState();
}

class _ContributionsScreenState extends State<ContributionsScreen> {
  final ContributionsRepository _repository = ContributionsRepository();
  final AuthRepository _authRepository = AuthRepository();

  ContributionPayload? _payload;
  bool _loading = true;
  String? _error;

  String _selectedCategory = 'all';

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

  Future<void> _logout() async {
    final token = widget.authStore.session?.token;
    if (token != null && token.isNotEmpty) {
      await _authRepository.logout(token);
    }
    await widget.authStore.clear();
  }

  Future<void> _openEditRequestDialog(Contribution contribution) async {
    final token = widget.authStore.session?.token;
    if (token == null || token.isEmpty) return;

    final amountController = TextEditingController(text: contribution.amount.toStringAsFixed(2));
    final reasonController = TextEditingController();
    String? dialogError;
    bool submitting = false;

    await showDialog<void>(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            Future<void> submitRequest() async {
              final navigator = Navigator.of(context);
              final messenger = ScaffoldMessenger.of(this.context);
              final parsed = double.tryParse(amountController.text.trim());
              if (parsed == null || parsed <= 0) {
                setDialogState(() => dialogError = 'Enter a valid requested amount.');
                return;
              }

              final reason = reasonController.text.trim();
              if (reason.isEmpty) {
                setDialogState(() => dialogError = 'Reason is required.');
                return;
              }

              setDialogState(() {
                submitting = true;
                dialogError = null;
              });

              try {
                await _repository.requestEdit(
                  token: token,
                  contributionId: contribution.id,
                  requestedAmount: parsed,
                  reason: reason,
                );
                if (!context.mounted) return;
                navigator.pop();
                messenger.showSnackBar(
                  const SnackBar(content: Text('Edit request submitted.')),
                );
              } catch (e) {
                setDialogState(() {
                  dialogError = e.toString().replaceFirst('Exception: ', '');
                  submitting = false;
                });
              }
            }

            return AlertDialog(
              title: const Text('Request Contribution Edit'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Text('Contribution #${contribution.id} • ${contribution.categoryLabel}'),
                    const SizedBox(height: 10),
                    TextField(
                      controller: amountController,
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(labelText: 'Requested Amount'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: reasonController,
                      decoration: const InputDecoration(labelText: 'Reason'),
                      minLines: 2,
                      maxLines: 4,
                    ),
                    if (dialogError != null) ...<Widget>[
                      const SizedBox(height: 10),
                      Text(dialogError!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                  ],
                ),
              ),
              actions: <Widget>[
                TextButton(onPressed: submitting ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
                FilledButton(
                  onPressed: submitting ? null : submitRequest,
                  child: submitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Submit'),
                ),
              ],
            );
          },
        );
      },
    );

    amountController.dispose();
    reasonController.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.authStore.session;
    final currency = NumberFormat.currency(locale: 'en_PH', symbol: 'PHP ');

    List<Contribution> data = _payload?.data ?? <Contribution>[];
    if (_selectedCategory != 'all') {
      data = data.where((c) => c.category == _selectedCategory).toList(growable: false);
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Contributions'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Refresh',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: 'Logout',
            onPressed: _logout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
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
                        if (session != null)
                          Card(
                            child: ListTile(
                              title: Text(session.name.isEmpty ? 'Member' : session.name),
                              subtitle: Text(session.email),
                            ),
                          ),
                        const SizedBox(height: 8),
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                const Text('Total Contributions', style: TextStyle(fontWeight: FontWeight.w600)),
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
                        DropdownButtonFormField<String>(
                          initialValue: _selectedCategory,
                          decoration: const InputDecoration(labelText: 'Filter by category'),
                          items: <DropdownMenuItem<String>>[
                            const DropdownMenuItem<String>(value: 'all', child: Text('All Categories')),
                            ...(_payload?.categoryLabels.entries ?? const Iterable<MapEntry<String, String>>.empty())
                                .map((entry) => DropdownMenuItem<String>(
                                      value: entry.key,
                                      child: Text(entry.value),
                                    )),
                          ],
                          onChanged: (value) {
                            setState(() {
                              _selectedCategory = value ?? 'all';
                            });
                          },
                        ),
                        const SizedBox(height: 12),
                        if (data.isEmpty)
                          const Card(
                            child: Padding(
                              padding: EdgeInsets.all(20),
                              child: Text('No contribution records found for this filter.'),
                            ),
                          ),
                        ...data.map(
                          (row) => Card(
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Row(
                                    children: <Widget>[
                                      Expanded(
                                        child: Text(
                                          row.categoryLabel,
                                          style: const TextStyle(fontWeight: FontWeight.w700),
                                        ),
                                      ),
                                      Text(currency.format(row.amount)),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  Text('Date: ${row.contributionDate}'),
                                  if (row.recipientIndicator.isNotEmpty)
                                    Text('Recipient: ${row.recipientIndicator}'),
                                  if (row.note.isNotEmpty) ...<Widget>[
                                    const SizedBox(height: 6),
                                    Text('Note: ${row.note}'),
                                  ],
                                  const SizedBox(height: 10),
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: OutlinedButton.icon(
                                      onPressed: () => _openEditRequestDialog(row),
                                      icon: const Icon(Icons.edit_note),
                                      label: const Text('Request Edit'),
                                    ),
                                  ),
                                ],
                              ),
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
