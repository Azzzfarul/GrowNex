/// Base URL of the GrowNex Express API (used only by the AI features).
///
/// Defaults to the Android emulator's host-loopback address. Override per run:
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.20:5000
const String apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:5000',
);
