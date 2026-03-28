class UserSession {
  UserSession({
    required this.token,
    required this.name,
    required this.email,
    required this.userId,
    required this.mustChangePassword,
    required this.mobileAccessEnabled,
    required this.permissions,
    this.primaryRole,
    this.financeRole,
  });

  final String token;
  final String name;
  final String email;
  final int userId;
  final bool mustChangePassword;
  final bool mobileAccessEnabled;
  final List<String> permissions;
  final String? primaryRole;
  final String? financeRole;

  bool hasPermission(String value) => permissions.contains(value);

  UserSession copyWith({
    String? token,
    String? name,
    String? email,
    int? userId,
    bool? mustChangePassword,
    bool? mobileAccessEnabled,
    List<String>? permissions,
    String? primaryRole,
    String? financeRole,
  }) {
    return UserSession(
      token: token ?? this.token,
      name: name ?? this.name,
      email: email ?? this.email,
      userId: userId ?? this.userId,
      mustChangePassword: mustChangePassword ?? this.mustChangePassword,
      mobileAccessEnabled: mobileAccessEnabled ?? this.mobileAccessEnabled,
      permissions: permissions ?? this.permissions,
      primaryRole: primaryRole ?? this.primaryRole,
      financeRole: financeRole ?? this.financeRole,
    );
  }

  factory UserSession.fromJson(Map<String, dynamic> json) {
    final permissions = (json['permissions'] as List<dynamic>? ?? const <dynamic>[])
        .map((dynamic value) => value.toString())
        .toList(growable: false);

    return UserSession(
      token: json['token']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      userId: (json['user_id'] as num?)?.toInt() ?? 0,
      mustChangePassword: json['must_change_password'] == true,
      mobileAccessEnabled: json['mobile_access_enabled'] == true,
      permissions: permissions,
      primaryRole: json['primary_role']?.toString(),
      financeRole: json['finance_role']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'token': token,
        'name': name,
        'email': email,
        'user_id': userId,
        'must_change_password': mustChangePassword,
        'mobile_access_enabled': mobileAccessEnabled,
        'permissions': permissions,
        'primary_role': primaryRole,
        'finance_role': financeRole,
      };
}
