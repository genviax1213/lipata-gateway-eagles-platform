class ApiConstants {
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://www.lgec.org/api/v1',
  );
  static const String authModeHeader = 'token';
}
