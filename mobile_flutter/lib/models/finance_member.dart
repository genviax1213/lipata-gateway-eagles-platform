class FinanceMember {
  FinanceMember({
    required this.id,
    required this.memberNumber,
    required this.firstName,
    required this.middleName,
    required this.lastName,
    required this.email,
  });

  final int id;
  final String memberNumber;
  final String firstName;
  final String middleName;
  final String lastName;
  final String email;

  String get name {
    final values = <String>[firstName, middleName, lastName]
        .where((String value) => value.trim().isNotEmpty)
        .toList(growable: false);
    return values.join(' ');
  }

  factory FinanceMember.fromJson(Map<String, dynamic> json) {
    return FinanceMember(
      id: (json['id'] as num?)?.toInt() ?? 0,
      memberNumber: json['member_number']?.toString() ?? '',
      firstName: json['first_name']?.toString() ?? '',
      middleName: json['middle_name']?.toString() ?? '',
      lastName: json['last_name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
    );
  }
}
