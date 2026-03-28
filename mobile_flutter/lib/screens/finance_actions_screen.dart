import 'package:flutter/material.dart';

import '../core/auth_store.dart';
import '../models/finance_account.dart';
import '../models/finance_member.dart';
import '../repositories/finance_repository.dart';

class FinanceActionsScreen extends StatefulWidget {
  const FinanceActionsScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<FinanceActionsScreen> createState() => _FinanceActionsScreenState();
}

class _FinanceActionsScreenState extends State<FinanceActionsScreen> with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Finance Actions'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const <Tab>[
            Tab(text: 'Contribution'),
            Tab(text: 'Expense'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: <Widget>[
          ContributionEntryScreen(authStore: widget.authStore),
          ExpenseEntryScreen(authStore: widget.authStore),
        ],
      ),
    );
  }
}

class ContributionEntryScreen extends StatefulWidget {
  const ContributionEntryScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<ContributionEntryScreen> createState() => _ContributionEntryScreenState();
}

class _ContributionEntryScreenState extends State<ContributionEntryScreen> {
  static const Map<String, String> _categoryLabels = <String, String>{
    'monthly_contribution': 'Monthly Contribution',
    'alalayang_agila_contribution': 'Alalayang Agila Contribution',
    'project_contribution': 'Project Contribution',
    'extra_contribution': 'Extra Contribution',
  };

  final FinanceRepository _repository = FinanceRepository();
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _recipientController = TextEditingController();
  final TextEditingController _memberSearchController = TextEditingController();

  List<FinanceMember> _members = <FinanceMember>[];
  List<FinanceAccount> _accounts = <FinanceAccount>[];
  FinanceMember? _selectedMember;
  FinanceAccount? _selectedAccount;
  String _selectedCategory = 'monthly_contribution';
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    _recipientController.dispose();
    _memberSearchController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
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
      final results = await Future.wait<dynamic>(<Future<dynamic>>[
        _repository.searchMembers(token: token),
        _repository.loadAccounts(token),
      ]);
      if (!mounted) return;
      setState(() {
        _members = results[0] as List<FinanceMember>;
        _accounts = results[1] as List<FinanceAccount>;
        _selectedMember = _members.isNotEmpty ? _members.first : null;
        _selectedAccount = _accounts.isNotEmpty ? _accounts.first : null;
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

  Future<void> _searchMembers(String value) async {
    final token = widget.authStore.session?.token;
    if (token == null || token.isEmpty) return;

    try {
      final members = await _repository.searchMembers(token: token, search: value);
      if (!mounted) return;
      setState(() {
        _members = members;
        if (_selectedMember != null && !_members.any((FinanceMember row) => row.id == _selectedMember!.id)) {
          _selectedMember = _members.isNotEmpty ? _members.first : null;
        }
      });
    } catch (_) {
      // Keep search quiet; submit/load surfaces the main errors.
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final token = widget.authStore.session?.token;
    final member = _selectedMember;
    final account = _selectedAccount;
    final amount = double.tryParse(_amountController.text.trim());

    if (token == null || token.isEmpty || member == null || account == null || amount == null) {
      setState(() {
        _error = 'Complete the contribution form before submitting.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await _repository.createContribution(
        token: token,
        memberId: member.id,
        memberEmail: member.email,
        amount: amount,
        note: _noteController.text.trim(),
        category: _selectedCategory,
        contributionDate: DateTime.now().toIso8601String().split('T').first,
        financeAccountId: account.id,
        recipientName: _recipientController.text.trim(),
      );
      if (!mounted) return;
      _amountController.clear();
      _noteController.clear();
      _recipientController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Contribution recorded.')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            TextField(
              controller: _memberSearchController,
              decoration: const InputDecoration(
                labelText: 'Search Member',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: _searchMembers,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<FinanceMember>(
              initialValue: _selectedMember,
              items: _members
                  .map((FinanceMember row) => DropdownMenuItem<FinanceMember>(
                        value: row,
                        child: Text('${row.name} (${row.memberNumber})'),
                      ))
                  .toList(growable: false),
              onChanged: (FinanceMember? value) {
                setState(() {
                  _selectedMember = value;
                });
              },
              decoration: const InputDecoration(labelText: 'Member'),
              validator: (FinanceMember? value) => value == null ? 'Select a member' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _selectedCategory,
              items: _categoryLabels.entries
                  .map((MapEntry<String, String> entry) => DropdownMenuItem<String>(
                        value: entry.key,
                        child: Text(entry.value),
                      ))
                  .toList(growable: false),
              onChanged: (String? value) {
                setState(() {
                  _selectedCategory = value ?? _selectedCategory;
                });
              },
              decoration: const InputDecoration(labelText: 'Category'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount'),
              validator: (String? value) {
                final parsed = double.tryParse((value ?? '').trim());
                if (parsed == null || parsed <= 0) return 'Enter a valid amount';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _noteController,
              decoration: const InputDecoration(labelText: 'Remarks'),
              validator: (String? value) => (value ?? '').trim().isEmpty ? 'Remarks are required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _recipientController,
              decoration: const InputDecoration(
                labelText: 'Recipient Indicator',
                helperText: 'Required when using Alalayang Agila without a linked beneficiary.',
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<FinanceAccount>(
              initialValue: _selectedAccount,
              items: _accounts
                  .map((FinanceAccount row) => DropdownMenuItem<FinanceAccount>(
                        value: row,
                        child: Text(row.name),
                      ))
                  .toList(growable: false),
              onChanged: (FinanceAccount? value) {
                setState(() {
                  _selectedAccount = value;
                });
              },
              decoration: const InputDecoration(labelText: 'Finance Account'),
              validator: (FinanceAccount? value) => value == null ? 'Select an account' : null,
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Record Contribution'),
            ),
          ],
        ),
      ),
    );
  }
}

class ExpenseEntryScreen extends StatefulWidget {
  const ExpenseEntryScreen({super.key, required this.authStore});

  final AuthStore authStore;

  @override
  State<ExpenseEntryScreen> createState() => _ExpenseEntryScreenState();
}

class _ExpenseEntryScreenState extends State<ExpenseEntryScreen> {
  static const Map<String, String> _categoryLabels = <String, String>{
    'administrative_expense': 'Administrative Expense',
    'event_expense': 'Event Expense',
    'project_expense': 'Project Expense',
    'aid_expense': 'Aid Expense',
    'reimbursement_expense': 'Reimbursement Expense',
    'misc_expense': 'Miscellaneous Expense',
  };

  final FinanceRepository _repository = FinanceRepository();
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _payeeController = TextEditingController();
  final TextEditingController _supportController = TextEditingController();
  final TextEditingController _approvalController = TextEditingController();

  List<FinanceAccount> _accounts = <FinanceAccount>[];
  FinanceAccount? _selectedAccount;
  String _selectedCategory = 'administrative_expense';
  bool _loading = true;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _noteController.dispose();
    _payeeController.dispose();
    _supportController.dispose();
    _approvalController.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
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
      final accounts = await _repository.loadAccounts(token);
      if (!mounted) return;
      setState(() {
        _accounts = accounts;
        _selectedAccount = _accounts.isNotEmpty ? _accounts.first : null;
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

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final token = widget.authStore.session?.token;
    final account = _selectedAccount;
    final amount = double.tryParse(_amountController.text.trim());

    if (token == null || token.isEmpty || account == null || amount == null) {
      setState(() {
        _error = 'Complete the expense form before submitting.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await _repository.createExpense(
        token: token,
        category: _selectedCategory,
        expenseDate: DateTime.now().toIso8601String().split('T').first,
        amount: amount,
        note: _noteController.text.trim(),
        payeeName: _payeeController.text.trim(),
        financeAccountId: account.id,
        supportReference: _supportController.text.trim(),
        approvalReference: _approvalController.text.trim(),
      );
      if (!mounted) return;
      _amountController.clear();
      _noteController.clear();
      _payeeController.clear();
      _supportController.clear();
      _approvalController.clear();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Expense recorded.')),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _submitting = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            DropdownButtonFormField<String>(
              initialValue: _selectedCategory,
              items: _categoryLabels.entries
                  .map((MapEntry<String, String> entry) => DropdownMenuItem<String>(
                        value: entry.key,
                        child: Text(entry.value),
                      ))
                  .toList(growable: false),
              onChanged: (String? value) {
                setState(() {
                  _selectedCategory = value ?? _selectedCategory;
                });
              },
              decoration: const InputDecoration(labelText: 'Category'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Amount'),
              validator: (String? value) {
                final parsed = double.tryParse((value ?? '').trim());
                if (parsed == null || parsed <= 0) return 'Enter a valid amount';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _noteController,
              decoration: const InputDecoration(labelText: 'Remarks'),
              validator: (String? value) => (value ?? '').trim().isEmpty ? 'Remarks are required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _payeeController,
              decoration: const InputDecoration(labelText: 'Payee Name'),
              validator: (String? value) => (value ?? '').trim().isEmpty ? 'Payee name is required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _supportController,
              decoration: const InputDecoration(labelText: 'Support Reference'),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _approvalController,
              decoration: const InputDecoration(labelText: 'Approval Reference'),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<FinanceAccount>(
              initialValue: _selectedAccount,
              items: _accounts
                  .map((FinanceAccount row) => DropdownMenuItem<FinanceAccount>(
                        value: row,
                        child: Text(row.name),
                      ))
                  .toList(growable: false),
              onChanged: (FinanceAccount? value) {
                setState(() {
                  _selectedAccount = value;
                });
              },
              decoration: const InputDecoration(labelText: 'Finance Account'),
              validator: (FinanceAccount? value) => value == null ? 'Select an account' : null,
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Record Expense'),
            ),
          ],
        ),
      ),
    );
  }
}
