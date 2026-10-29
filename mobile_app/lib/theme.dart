import 'package:flutter/material.dart';

/// Material 3 seed. The web dashboard's color tokens (web_dashboard/client/src/index.css) are
/// generated from this same seed, so change both together.
const seedColor = Color(0xFF4CAF50);

/// Colors M3's ColorScheme doesn't cover: a "warning" custom color harmonized to the seed, and
/// the chart series palette (validated for both modes). Same values as the web dashboard.
@immutable
class AppColors extends ThemeExtension<AppColors> {
  final Color warning, onWarning, warningContainer, onWarningContainer;
  final List<Color> series;

  const AppColors({
    required this.warning,
    required this.onWarning,
    required this.warningContainer,
    required this.onWarningContainer,
    required this.series,
  });

  static const light = AppColors(
    warning: Color(0xFF7B5900),
    onWarning: Color(0xFFFFFFFF),
    warningContainer: Color(0xFFFFDEA4),
    onWarningContainer: Color(0xFF261900),
    series: [Color(0xFF2A78D6), Color(0xFFEB6834), Color(0xFF1BAF7A), Color(0xFFEDA100)],
  );

  static const dark = AppColors(
    warning: Color(0xFFF5BE48),
    onWarning: Color(0xFF412D00),
    warningContainer: Color(0xFF5D4200),
    onWarningContainer: Color(0xFFFFDEA4),
    series: [Color(0xFF3987E5), Color(0xFFD95926), Color(0xFF199E70), Color(0xFFC98500)],
  );

  static AppColors of(BuildContext context) => Theme.of(context).extension<AppColors>()!;

  @override
  AppColors copyWith() => this;

  @override
  AppColors lerp(AppColors? other, double t) {
    if (other == null) return this;
    return AppColors(
      warning: Color.lerp(warning, other.warning, t)!,
      onWarning: Color.lerp(onWarning, other.onWarning, t)!,
      warningContainer: Color.lerp(warningContainer, other.warningContainer, t)!,
      onWarningContainer: Color.lerp(onWarningContainer, other.onWarningContainer, t)!,
      series: [for (var i = 0; i < series.length; i++) Color.lerp(series[i], other.series[i], t)!],
    );
  }
}

ThemeData buildTheme(Brightness brightness) {
  final cs = ColorScheme.fromSeed(seedColor: seedColor, brightness: brightness);
  return ThemeData(
    colorScheme: cs,
    useMaterial3: true,
    extensions: [brightness == Brightness.dark ? AppColors.dark : AppColors.light],
    inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
    // M3 elevated card, without the default outer margin (screens space cards themselves)
    cardTheme: const CardThemeData(margin: EdgeInsets.zero, clipBehavior: Clip.antiAlias),
    listTileTheme: const ListTileThemeData(contentPadding: EdgeInsets.symmetric(horizontal: 16)),
  );
}
