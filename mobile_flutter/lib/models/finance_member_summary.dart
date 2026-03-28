import 'contribution.dart';

class FinanceMemberSummary {
  FinanceMemberSummary({
    required this.memberId,
    required this.memberNumber,
    required this.name,
    required this.email,
    required this.totalAmount,
    required this.categoryTotals,
    required this.categoryLabels,
    required this.latestEntries,
  });

  final int memberId;
  final String memberNumber;
  final String name;
  final String email;
  final double totalAmount;
  final Map<String, double> categoryTotals;
  final Map<String, String> categoryLabels;
  final List<Contribution> latestEntries;

  factory FinanceMemberSummary.fromJson(Map<String, dynamic> json) {
    final member = json['member'] as Map<String, dynamic>? ?? const <String, dynamic>{};
    final totals = (json['category_totals'] as Map<String, dynamic>? ?? const <String, dynamic>{})
        .map((String key, dynamic value) => MapEntry(key, (value as num?)?.toDouble() ?? 0));
    final labels = (json['category_labels'] as Map<String, dynamic>? ?? const <String, dynamic>{})
        .map((String key, dynamic value) => MapEntry(key, value.toString()));

    return FinanceMemberSummary(
      memberId: (member['id'] as num?)?.toInt() ?? 0,
      memberNumber: member['member_number']?.toString() ?? '',
      name: member['name']?.toString() ?? '',
      email: member['email']?.toString() ?? '',
      totalAmount: (json['total_amount'] as num?)?.toDouble() ?? 0,
      categoryTotals: totals,
      categoryLabels: labels,
      latestEntries: (json['latest_entries'] as List<dynamic>? ?? const <dynamic>[])
          .whereType<Map<String, dynamic>>()
          .map(Contribution.fromJson)
          .toList(growable: false),
    );
  }
}
