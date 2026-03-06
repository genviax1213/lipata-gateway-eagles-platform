import 'contribution.dart';

class ContributionPayload {
  ContributionPayload({
    required this.totalAmount,
    required this.categoryLabels,
    required this.categoryTotals,
    required this.data,
  });

  final double totalAmount;
  final Map<String, String> categoryLabels;
  final Map<String, double> categoryTotals;
  final List<Contribution> data;

  factory ContributionPayload.fromJson(Map<String, dynamic> json) {
    final labelsRaw = (json['category_labels'] as Map<String, dynamic>? ?? <String, dynamic>{});
    final totalsRaw = (json['category_totals'] as Map<String, dynamic>? ?? <String, dynamic>{});
    final dataRaw = (json['data'] as List<dynamic>? ?? <dynamic>[]);

    return ContributionPayload(
      totalAmount: (json['total_amount'] as num?)?.toDouble() ?? 0,
      categoryLabels: labelsRaw.map((key, value) => MapEntry(key, value.toString())),
      categoryTotals: totalsRaw.map((key, value) => MapEntry(key, (value as num?)?.toDouble() ?? 0)),
      data: dataRaw
          .whereType<Map<String, dynamic>>()
          .map(Contribution.fromJson)
          .toList(growable: false),
    );
  }
}
