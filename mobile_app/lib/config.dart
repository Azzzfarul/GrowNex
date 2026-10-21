/// Base URL of the GrowNex Express API. Used by the AI features and account deletion (which
/// falls back to deleting through Firebase directly when this server can't be reached).
///
/// Defaults to the Android emulator's host-loopback address. On a real phone, set it per build:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:5000
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:5000',
);
