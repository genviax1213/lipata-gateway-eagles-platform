class FinanceAccount {
  FinanceAccount({
    required this.id,
    required this.code,
    required this.name,
    required this.accountType,
  });

  final int id;
  final String code;
  final String name;
  final String accountType;

  factory FinanceAccount.fromJson(Map<String, dynamic> json) {
    return FinanceAccount(
      id: (json['id'] as num?)?.toInt() ?? (json['account']?['id'] as num?)?.toInt() ?? 0,
      code: json['code']?.toString() ?? json['account']?['code']?.toString() ?? '',
      name: json['name']?.toString() ?? json['account']?['name']?.toString() ?? '',
      accountType: json['account_type']?.toString() ?? json['account']?['account_type']?.toString() ?? '',
    );
  }
}
