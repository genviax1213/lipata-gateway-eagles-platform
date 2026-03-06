# LGEC Members Mobile (Flutter)

Android-focused Flutter app for members to:
- Login using LGEC portal credentials
- View their personal contribution history
- Filter contributions by category
- Submit contribution edit requests

## API Target
- Base URL: `https://lgec.org/api/index.php/api/v1`
- Auth mode: token (`X-Auth-Mode: token`)

## Features Implemented
- Session login/logout with local persistence (`shared_preferences`)
- Pull-to-refresh contribution list
- Total contribution summary
- Category filter
- Edit request dialog (`requested_amount`, `reason`) for each contribution

## Project Structure
- `lib/screens/login_screen.dart` - login flow
- `lib/screens/contributions_screen.dart` - contribution list + edit requests
- `lib/repositories/` - API-facing repositories
- `lib/core/` - API client and auth storage
- `lib/models/` - typed models for session and contributions

## Run (once Flutter SDK is installed)
```bash
cd mobile_flutter
flutter pub get
flutter run -d android
```

## Build APK
```bash
cd mobile_flutter
flutter build apk --release
```

## Notes
- This environment does not include Flutter SDK, so `flutter pub get`, `flutter analyze`, and `flutter run` were not executed here.
- If your backend permissions restrict creating/editing contributions for regular members, the app will show API messages from the server.
