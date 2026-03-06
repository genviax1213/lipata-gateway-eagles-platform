import 'dart:convert';

import 'package:http/http.dart' as http;

import 'constants.dart';

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = Uri.parse(ApiConstants.baseUrl);
    return base.replace(
      path: '${base.path}/${path.replaceFirst(RegExp(r'^/+'), '')}',
      queryParameters: query,
    );
  }

  Map<String, String> _headers({String? token}) {
    return <String, String>{
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Auth-Mode': ApiConstants.authModeHeader,
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<Map<String, dynamic>> getJson(
    String path, {
    String? token,
    Map<String, String>? query,
  }) async {
    final response = await _client.get(_uri(path, query), headers: _headers(token: token));
    return _handle(response);
  }

  Future<Map<String, dynamic>> postJson(
    String path,
    Map<String, dynamic> body, {
    String? token,
  }) async {
    final response = await _client.post(
      _uri(path),
      headers: _headers(token: token),
      body: jsonEncode(body),
    );
    return _handle(response);
  }

  Map<String, dynamic> _handle(http.Response response) {
    final parsed = response.body.isNotEmpty
        ? jsonDecode(response.body)
        : <String, dynamic>{};

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (parsed is Map<String, dynamic>) {
        return parsed;
      }
      return <String, dynamic>{'data': parsed};
    }

    String message = 'Request failed (${response.statusCode})';
    if (parsed is Map<String, dynamic>) {
      if (parsed['message'] is String) {
        message = parsed['message'] as String;
      } else if (parsed['errors'] is Map<String, dynamic>) {
        final firstError = (parsed['errors'] as Map<String, dynamic>).values.first;
        if (firstError is List && firstError.isNotEmpty) {
          message = firstError.first.toString();
        }
      }
    }

    throw ApiException(message, statusCode: response.statusCode);
  }
}
