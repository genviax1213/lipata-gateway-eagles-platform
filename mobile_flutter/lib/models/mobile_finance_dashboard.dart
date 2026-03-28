class FinanceBalance {
  FinanceBalance({
    required this.accountName,
    required this.balance,
  });

  final String accountName;
  final double balance;

  factory FinanceBalance.fromJson(Map<String, dynamic> json) {
    return FinanceBalance(
      accountName: json['account_name']?.toString() ??
          json['name']?.toString() ??
          json['code']?.toString() ??
          'Account',
      balance: (json['balance'] as num?)?.toDouble() ?? 0,
    );
  }
}

class FinanceTransaction {
  FinanceTransaction({
    required this.id,
    required this.type,
    required this.category,
    required this.amount,
    required this.date,
    this.memberName,
    this.payeeName,
    this.accountName,
  });

  final int id;
  final String type;
  final String category;
  final double amount;
  final DateTime? date;
  final String? memberName;
  final String? payeeName;
  final String? accountName;

  factory FinanceTransaction.fromJson(Map<String, dynamic> json) {
    final member = json['member'] as Map<String, dynamic>?;
    final account = json['finance_account'] as Map<String, dynamic>?;
    return FinanceTransaction(
      id: (json['id'] as num?)?.toInt() ?? 0,
      type: json['type']?.toString() ?? '',
      category: json['category']?.toString() ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      date: DateTime.tryParse(json['date']?.toString() ?? ''),
      memberName: member?['name']?.toString(),
      payeeName: json['payee_name']?.toString(),
      accountName: account?['name']?.toString(),
    );
  }
}

class NonCompliantMember {
  NonCompliantMember({
    required this.memberNumber,
    required this.name,
    required this.monthlyGap,
  });

  final String memberNumber;
  final String name;
  final double monthlyGap;

  factory NonCompliantMember.fromJson(Map<String, dynamic> json) {
    return NonCompliantMember(
      memberNumber: json['member_number']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      monthlyGap: (json['monthly_gap'] as num?)?.toDouble() ?? 0,
    );
  }
}

class MobileFinanceDashboard {
  MobileFinanceDashboard({
    required this.month,
    required this.collectionsThisMonth,
    required this.expensesThisMonth,
    required this.unassignedContributionTotal,
    required this.accountBalances,
    required this.latestTransactions,
    required this.nonCompliantMembers,
  });

  final String month;
  final double collectionsThisMonth;
  final double expensesThisMonth;
  final double unassignedContributionTotal;
  final List<FinanceBalance> accountBalances;
  final List<FinanceTransaction> latestTransactions;
  final List<NonCompliantMember> nonCompliantMembers;

  factory MobileFinanceDashboard.fromJson(Map<String, dynamic> json) {
    final period = json['period'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final totals = json['totals'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final compliance = json['compliance'] as Map<String, dynamic>? ?? const <String, dynamic>{};

    return MobileFinanceDashboard(
      month: period['month']?.toString() ?? '',
      collectionsThisMonth: (totals['collections_this_month'] as num?)?.toDouble() ?? 0,
      expensesThisMonth: (totals['expenses_this_month'] as num?)?.toDouble() ?? 0,
      unassignedContributionTotal: (json['unassigned_contribution_total'] as num?)?.toDouble() ?? 0,
      accountBalances: (json['account_balances'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(FinanceBalance.fromJson)
          .toList(growable: false),
      latestTransactions: (json['latest_transactions'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(FinanceTransaction.fromJson)
          .toList(growable: false),
      nonCompliantMembers: (compliance['non_compliant_members'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(NonCompliantMember.fromJson)
          .toList(growable: false),
    );
  }
}
