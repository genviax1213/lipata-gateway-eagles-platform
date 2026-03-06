class UserSession {
  UserSession({
    required this.token,
    required this.name,
    required this.email,
    required this.userId,
  });

  final String token;
  final String name;
  final String email;
  final int userId;

  factory UserSession.fromJson(Map<String, dynamic> json) {
    return UserSession(
      token: json['token']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      userId: (json['user_id'] as num?)?.toInt() ?? 0,
    );
  }

  Map<String, dynamic> toJson() => <String, dynamic>{
        'token': token,
        'name': name,
        'email': email,
        'user_id': userId,
      };
}
