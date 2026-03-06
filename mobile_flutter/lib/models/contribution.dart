class Contribution {
  Contribution({
    required this.id,
    required this.amount,
    required this.note,
    required this.category,
    required this.categoryLabel,
    required this.contributionDate,
    required this.recipientIndicator,
  });

  final int id;
  final double amount;
  final String note;
  final String category;
  final String categoryLabel;
  final String contributionDate;
  final String recipientIndicator;

  factory Contribution.fromJson(Map<String, dynamic> json) {
    return Contribution(
      id: (json['id'] as num?)?.toInt() ?? 0,
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      note: json['note']?.toString() ?? '',
      category: json['category']?.toString() ?? 'monthly_contribution',
      categoryLabel: json['category_label']?.toString() ?? 'Contribution',
      contributionDate: json['contribution_date']?.toString() ?? '',
      recipientIndicator: json['recipient_indicator']?.toString() ?? '',
    );
  }
}
