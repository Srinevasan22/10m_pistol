# Fixing `GoogleSignIn` constructor errors in Flutter

When Flutter reports `Couldn't find constructor 'GoogleSignIn'` in code like `GoogleSignIn(serverClientId: ...)`, it usually means the `google_sign_in` package is either missing from `pubspec.yaml` or not imported in the file that uses it. The backend in this repository already expects Google ID tokens, so the Flutter client should be set up to produce them correctly.

## Steps to resolve

1. **Declare the dependency.** Add the package to your app’s `pubspec.yaml`:

   ```yaml
   dependencies:
     google_sign_in: ^6.2.1
   ```

   Then run `flutter pub get`.

2. **Import the package where used.** Each Dart file that references the class needs:

   ```dart
   import 'package:google_sign_in/google_sign_in.dart';
   ```

3. **Use the constructor from the package.** After the import, the existing calls in `lib/screens/my_account_page.dart`, `lib/screens/login_page.dart`, and `lib/screens/real_login_tab.dart` can keep using:

   ```dart
   final googleSignIn = GoogleSignIn(serverClientId: clientId);
   ```

4. **Confirm the server client ID matches this API.** Set the `GOOGLE_CLIENT_ID` environment variable for the Node server so the `/pistol/auth/google` and `/pistol/auth/link-google` endpoints accept the tokens produced by the Flutter client.

Following these steps ensures the Flutter build can find the constructor and that Google sign-in works end-to-end with this backend.
