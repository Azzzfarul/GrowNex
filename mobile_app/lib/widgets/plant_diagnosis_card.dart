import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/plant_diagnosis_model.dart';
import '../models/plant_model.dart';
import '../services/firestore/diagnosis_service.dart';
import '../utils/plant_diagnosis.dart';
import 'status_label.dart';

String _relative(DateTime? d) {
  if (d == null) return 'just now';
  final s = DateTime.now().difference(d).inSeconds;
  if (s < 60) return 'just now';
  if (s < 3600) return '${s ~/ 60}m ago';
  if (s < 86400) return '${s ~/ 3600}h ago';
  if (s < 604800) return '${s ~/ 86400}d ago';
  return '${d.day}/${d.month}/${d.year}';
}

/// AI diagnosis of one plant from a close-up photo, with its history.
/// Web: client/src/components/PlantDiagnosisCard.jsx.
class PlantDiagnosisCard extends StatefulWidget {
  final Plant plant;
  const PlantDiagnosisCard({super.key, required this.plant});

  @override
  State<PlantDiagnosisCard> createState() => _PlantDiagnosisCardState();
}

class _PlantDiagnosisCardState extends State<PlantDiagnosisCard> {
  final _service = DiagnosisService();
  Stream<List<PlantDiagnosis>>? _stream;
  bool _busy = false;
  String? _error;
  String? _openId;  // a history entry shown in place of the latest

  @override
  void initState() {
    super.initState();
    final uid = FirebaseAuth.instance.currentUser?.uid;
    if (uid != null) _stream = _service.watch(uid, widget.plant.id);
  }

  Future<void> _pickAndDiagnose() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(ctx, ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(ctx, ImageSource.gallery),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;
    // Same downscale as the web (1280 px, JPEG quality 80), which is what the evaluation feeds the model.
    final file = await ImagePicker().pickImage(source: source, maxWidth: 1280, maxHeight: 1280, imageQuality: 80);
    if (file == null || !mounted) return;

    setState(() { _busy = true; _error = null; });
    final error = await _service.run(widget.plant.id, file);
    if (!mounted) return;
    setState(() { _busy = false; _error = error; if (error == null) _openId = null; });
  }

  Future<void> _delete(PlantDiagnosis d) async {
    try {
      await _service.delete(d);
    } catch (e) {
      debugPrint('Failed to delete diagnosis: $e');
      if (mounted) setState(() => _error = "Couldn't delete that diagnosis. Please try again.");
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Visual diagnosis', style: tt.titleSmall)),
                FilledButton.tonalIcon(
                  onPressed: _busy ? null : _pickAndDiagnose,
                  icon: _busy
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.add_a_photo_outlined, size: 18),
                  label: Text(_busy ? 'Diagnosing…' : 'Take photo'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              'A close-up of the affected leaves works best. AI estimate, not a professional diagnosis.',
              style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: cs.errorContainer, borderRadius: BorderRadius.circular(8)),
                child: Text(_error!, style: tt.bodyMedium?.copyWith(color: cs.onErrorContainer)),
              ),
            ],
            if (_stream != null)
              StreamBuilder<List<PlantDiagnosis>>(
                stream: _stream,
                builder: (context, snapshot) {
                  final items = snapshot.data ?? const <PlantDiagnosis>[];
                  if (items.isEmpty) return const SizedBox.shrink();
                  final shown = items.firstWhere((d) => d.id == _openId, orElse: () => items.first);
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 16),
                      _buildResult(shown, cs, tt),
                      const SizedBox(height: 16),
                      Text('History', style: tt.labelLarge?.copyWith(color: cs.onSurfaceVariant)),
                      for (final d in items)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          dense: true,
                          selected: d.id == shown.id,
                          onTap: () => setState(() => _openId = d.id),
                          title: Row(
                            children: [
                              StatusLabel(conditionLabel(d.condition), tone: conditionTone(d.condition, d.severity)),
                              const SizedBox(width: 8),
                              Flexible(
                                child: Text(_relative(d.createdAt),
                                    overflow: TextOverflow.ellipsis,
                                    style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                              ),
                            ],
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            tooltip: 'Delete diagnosis',
                            onPressed: () => _delete(d),
                          ),
                        ),
                    ],
                  );
                },
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildResult(PlantDiagnosis d, ColorScheme cs, TextTheme tt) {
    Widget list(String title, List<String> items) => Padding(
          padding: const EdgeInsets.only(top: 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: tt.labelLarge?.copyWith(color: cs.onSurfaceVariant)),
              for (final t in items) Padding(padding: const EdgeInsets.only(top: 2), child: Text('• $t', style: tt.bodyMedium)),
            ],
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (d.imageUrl != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Image.network(
                d.imageUrl!,
                fit: BoxFit.cover,
                semanticLabel: '${widget.plant.plantName} diagnosis photo',
                errorBuilder: (_, _, _) => ColoredBox(
                  color: cs.surfaceContainerHigh,
                  child: Icon(Icons.broken_image_outlined, color: cs.onSurfaceVariant),
                ),
              ),
            ),
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            StatusLabel(conditionLabel(d.condition), tone: conditionTone(d.condition, d.severity)),
            if (d.severity != 'none') StatusLabel(d.severity, tone: 'unknown'),
            Text('${(d.confidence * 100).round()}% confident · ${_relative(d.createdAt)}',
                style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
          ],
        ),
        if (d.summary.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(d.summary, style: tt.bodyMedium)),
        if (d.likelyCause.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text('Likely cause: ${d.likelyCause}', style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
          ),
        if (d.observations.isNotEmpty) list('What the photo shows', d.observations),
        if (d.advice.isNotEmpty) list('What to do', d.advice),
      ],
    );
  }
}
