import 'package:flutter/material.dart';

import '../theme.dart';

/// Container colors for a zone/plant status (healthy / attention / critical / …).
({Color bg, Color fg}) statusColors(BuildContext context, String status) {
  final cs = Theme.of(context).colorScheme;
  final app = AppColors.of(context);
  final s = status.toLowerCase();
  if (s == 'healthy') return (bg: cs.primaryContainer, fg: cs.onPrimaryContainer);
  if (s == 'stable') return (bg: cs.tertiaryContainer, fg: cs.onTertiaryContainer);
  if (s.contains('attention')) return (bg: app.warningContainer, fg: app.onWarningContainer);
  if (s == 'critical' || s == 'wilting') return (bg: cs.errorContainer, fg: cs.onErrorContainer);
  return (bg: cs.surfaceContainerHighest, fg: cs.onSurfaceVariant);
}

/// M3 label chip for a zone/plant status (same mapping as the web's StatusLabel).
class StatusLabel extends StatelessWidget {
  final String status;
  const StatusLabel(this.status, {super.key});

  @override
  Widget build(BuildContext context) {
    final c = statusColors(context, status);
    final text = status.isEmpty ? 'Unknown' : status[0].toUpperCase() + status.substring(1);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: c.bg, borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: c.fg)),
    );
  }
}
