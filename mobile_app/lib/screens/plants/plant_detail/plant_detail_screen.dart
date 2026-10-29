import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/plant_model.dart';
import '../../../models/sensor_reading_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/plant_service.dart';
import '../../../services/photo_service.dart';
import '../../../utils/plant_health.dart';
import '../../../theme.dart';
import '../../../widgets/status_label.dart';

class PlantDetailScreen extends StatefulWidget {
  final Plant plant;
  final num? currentMoisture;
  final Zone? zone;

  const PlantDetailScreen({super.key, required this.plant, this.currentMoisture, this.zone});

  @override
  State<PlantDetailScreen> createState() => _PlantDetailScreenState();
}

class _PlantDetailScreenState extends State<PlantDetailScreen> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _speciesCtrl;
  late final TextEditingController _notesCtrl;
  late final TextEditingController _moistureMinCtrl;
  late final TextEditingController _moistureMaxCtrl;
  late final TextEditingController _humidityMinCtrl;
  late final TextEditingController _humidityMaxCtrl;
  late final TextEditingController _tempMinCtrl;
  late final TextEditingController _tempMaxCtrl;
  String? _lightCondition;
  bool _loading = false;
  bool _photoBusy = false;
  late String? _photoUrl;
  List<SensorReading>? _stats;

  @override
  void initState() {
    super.initState();
    final p = widget.plant;
    _photoUrl = p.photoUrl;
    _loadStats();
    _nameCtrl = TextEditingController(text: p.plantName);
    _speciesCtrl = TextEditingController(text: p.species);
    _notesCtrl = TextEditingController(text: p.notes);
    _moistureMinCtrl = TextEditingController(text: p.preferredMoistureMin?.toString() ?? '');
    _moistureMaxCtrl = TextEditingController(text: p.preferredMoistureMax?.toString() ?? '');
    _humidityMinCtrl = TextEditingController(text: p.preferredHumidityMin?.toString() ?? '');
    _humidityMaxCtrl = TextEditingController(text: p.preferredHumidityMax?.toString() ?? '');
    _tempMinCtrl = TextEditingController(text: p.preferredTemperatureMin?.toString() ?? '');
    _tempMaxCtrl = TextEditingController(text: p.preferredTemperatureMax?.toString() ?? '');
    _lightCondition = p.preferredLightCondition;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _speciesCtrl.dispose();
    _notesCtrl.dispose();
    _moistureMinCtrl.dispose();
    _moistureMaxCtrl.dispose();
    _humidityMinCtrl.dispose();
    _humidityMaxCtrl.dispose();
    _tempMinCtrl.dispose();
    _tempMaxCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      final updated = Plant(
        id: widget.plant.id,
        zoneId: widget.plant.zoneId,
        // Same fallback as add-plant (and the web): an empty name shows the species
        plantName: _nameCtrl.text.trim().isEmpty ? _speciesCtrl.text.trim() : _nameCtrl.text.trim(),
        species: _speciesCtrl.text.trim(),
        status: widget.plant.status,
        slotNumber: widget.plant.slotNumber,
        preferredMoistureMin: double.tryParse(_moistureMinCtrl.text.trim()),
        preferredMoistureMax: double.tryParse(_moistureMaxCtrl.text.trim()),
        preferredHumidityMin: double.tryParse(_humidityMinCtrl.text.trim()),
        preferredHumidityMax: double.tryParse(_humidityMaxCtrl.text.trim()),
        preferredTemperatureMin: double.tryParse(_tempMinCtrl.text.trim()),
        preferredTemperatureMax: double.tryParse(_tempMaxCtrl.text.trim()),
        preferredLightCondition: _lightCondition,
        notes: _notesCtrl.text.trim().isEmpty ? null : _notesCtrl.text.trim(),
        photoUrl: _photoUrl,
        createdAt: widget.plant.createdAt,
      );
      await PlantService().updatePlant(updated);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Changes saved.')));
      }
    } catch (e) {
      debugPrint('Failed to save: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to save. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadStats() async {
    final zone = widget.zone;
    if (zone == null) return;
    try {
      final cutoff = DateTime.now().subtract(const Duration(days: 7));
      final snap = await FirebaseFirestore.instance
          .collection('zones').doc(zone.id).collection('stats')
          .where('timestamp', isGreaterThanOrEqualTo: Timestamp.fromDate(cutoff))
          .orderBy('timestamp')
          .get();
      if (!mounted) return;
      setState(() => _stats = snap.docs.map((d) => SensorReading.fromMap(d.id, d.data())).toList());
    } catch (_) {
      if (mounted) setState(() => _stats = const []);
    }
  }

  bool _hasAnyCondition() {
    final p = widget.plant;
    return p.preferredMoistureMin != null ||
        p.preferredMoistureMax != null ||
        p.preferredHumidityMin != null ||
        p.preferredHumidityMax != null ||
        p.preferredTemperatureMin != null ||
        p.preferredTemperatureMax != null ||
        p.preferredLightCondition != null;
  }

  Future<void> _confirmDelete() async {
    final cs = Theme.of(context).colorScheme;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove plant?'),
        content: Text('This will permanently remove "${widget.plant.plantName}". This cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: cs.error),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      await PlantService().deletePlant(widget.plant.id);
      if (_photoUrl != null) await PhotoService().deletePlantPhotoFile(widget.plant.id).catchError((_) {});
      if (mounted) Navigator.pop(context);
    } catch (e) {
      debugPrint('Failed to remove plant: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to remove plant. Please try again.')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Plant details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Remove plant',
            onPressed: _confirmDelete,
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildPhotoSection(cs),
          const SizedBox(height: 20),
          _buildField('Name', _nameCtrl),
          const SizedBox(height: 16),
          _buildField('Species', _speciesCtrl),
          const SizedBox(height: 20),
          _buildSensorOverview(cs),
          const SizedBox(height: 20),
          _buildPreferredConditions(cs),
          if (widget.zone != null && _stats != null) ...[
            const SizedBox(height: 20),
            _buildConditionCard(cs),
          ],
          const SizedBox(height: 20),
          _buildNotesField(),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _loading ? null : _save,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Save changes'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoSection(ColorScheme cs) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Stack(
          children: [
            Container(
              height: 180,
              width: double.infinity,
              decoration: BoxDecoration(
                color: cs.surfaceContainerHigh,
                borderRadius: BorderRadius.circular(18),
              ),
              clipBehavior: Clip.antiAlias,
              child: _photoUrl != null
                  ? Image.network(_photoUrl!, fit: BoxFit.contain)
                  : Center(child: Icon(Icons.local_florist, size: 60, color: cs.onSurface.withValues(alpha: 0.38))),
            ),
            if (_photoBusy)
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Center(child: CircularProgressIndicator(color: Colors.white)),
                ),
              ),
          ],
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            TextButton(
              onPressed: _photoBusy ? null : _pickPlantPhoto,
              child: Text(_photoUrl != null ? 'Change photo' : 'Add photo'),
            ),
            if (_photoUrl != null)
              TextButton(
                onPressed: _photoBusy ? null : _removePlantPhoto,
                style: TextButton.styleFrom(foregroundColor: cs.error),
                child: const Text('Remove'),
              ),
          ],
        ),
      ],
    );
  }

  Future<void> _pickPlantPhoto() async {
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

    final file = await ImagePicker().pickImage(source: source, maxWidth: 1280, imageQuality: 80);
    if (file == null || !mounted) return;

    setState(() => _photoBusy = true);
    try {
      final url = await PhotoService().uploadPlantPhoto(widget.plant.id, file);
      if (mounted) setState(() => _photoUrl = url);
    } catch (e) {
      debugPrint('Failed to upload photo: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload photo. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Future<void> _removePlantPhoto() async {
    setState(() => _photoBusy = true);
    try {
      await PhotoService().removePlantPhoto(widget.plant.id);
      if (mounted) setState(() => _photoUrl = null);
    } catch (e) {
      debugPrint('Failed to remove photo: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to remove photo. Please try again.')));
      }
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  Widget _buildField(String label, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w500)),
        const SizedBox(height: 8),
        TextField(controller: controller, decoration: const InputDecoration(border: OutlineInputBorder())),
      ],
    );
  }

  Widget _buildSensorOverview(ColorScheme cs) {
    final app = AppColors.of(context);
    final tt = Theme.of(context).textTheme;
    final moisture = widget.currentMoisture;
    final min = widget.plant.preferredMoistureMin;
    final max = widget.plant.preferredMoistureMax;

    final hasRange = min != null && max != null;
    final hasData  = moisture != null;

    final inRange = hasRange && hasData && moisture >= min && moisture <= max;
    final tooLow  = hasRange && hasData && moisture < min;

    final color = !hasData ? cs.onSurface
        : !hasRange        ? cs.tertiary
        : inRange          ? cs.primary
        : tooLow           ? app.warning
        : cs.error;

    final conditionText = !hasData ? 'No data'
        : !hasRange        ? '${moisture.toStringAsFixed(1)}%'
        : inRange          ? 'Within preferred range'
        : tooLow           ? 'Too dry (${moisture.toStringAsFixed(1)}%)'
        : 'Too wet (${moisture.toStringAsFixed(1)}%)';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Soil moisture', style: tt.titleMedium),
            const SizedBox(height: 14),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Slot ${widget.plant.slotNumber} reading',
                    style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
                Text(
                  hasData ? '${moisture.toStringAsFixed(1)}%' : '--',
                  style: tt.titleLarge?.copyWith(color: color),
                ),
              ],
            ),
            if (hasData) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: (moisture / 100).clamp(0.0, 1.0),
                  backgroundColor: cs.surfaceContainerHigh,
                  valueColor: AlwaysStoppedAnimation<Color>(color),
                  minHeight: 10,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(conditionText,
                      style: tt.labelLarge?.copyWith(color: color)),
                  if (hasRange)
                    Text('Ideal: ${min.toStringAsFixed(0)}–${max.toStringAsFixed(0)}%',
                        style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                ],
              ),
            ] else
              Text('No sensor data yet',
                  style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }

  Widget _buildPreferredConditions(ColorScheme cs) {
    final tt = Theme.of(context).textTheme;
    // Material (not a decorated Container) so the tile's tap ripple shows.
    return Material(
      color: cs.surfaceContainer,
      elevation: 2,
      shadowColor: cs.shadow.withValues(alpha: 0.3),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
          initiallyExpanded: _hasAnyCondition(),
          leading: Icon(Icons.tune, color: cs.primary),
          title: Text('Preferred growing conditions', style: tt.titleSmall),
          subtitle: Text('Used to compute ideal zone environment',
              style: tt.labelSmall?.copyWith(color: cs.onSurfaceVariant)),
          children: [
            _rangeRow('Moisture (%)', _moistureMinCtrl, _moistureMaxCtrl),
            const SizedBox(height: 12),
            _rangeRow('Humidity (%)', _humidityMinCtrl, _humidityMaxCtrl),
            const SizedBox(height: 12),
            _rangeRow('Temperature (°C)', _tempMinCtrl, _tempMaxCtrl),
            const SizedBox(height: 12),
            _lightDropdown(),
          ],
        ),
      ),
    );
  }

  Widget _rangeRow(String label, TextEditingController minCtrl, TextEditingController maxCtrl) {
    final tt = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: tt.labelLarge),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(child: _numField('Min', minCtrl)),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('–', style: TextStyle(fontWeight: FontWeight.w500))),
            Expanded(child: _numField('Max', maxCtrl)),
          ],
        ),
      ],
    );
  }

  Widget _numField(String hint, TextEditingController ctrl) {
    return TextField(
      controller: ctrl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'^\d*\.?\d*'))],
      decoration: InputDecoration(
        hintText: hint,
        border: const OutlineInputBorder(),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      ),
    );
  }

  Widget _lightDropdown() {
    final tt = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Light condition', style: tt.labelLarge),
        const SizedBox(height: 6),
        DropdownButtonFormField<String?>(
          initialValue: _lightCondition,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
          items: const [
            DropdownMenuItem(value: null, child: Text('Not specified')),
            DropdownMenuItem(value: 'low', child: Text('Low')),
            DropdownMenuItem(value: 'medium', child: Text('Medium')),
            DropdownMenuItem(value: 'high', child: Text('High')),
          ],
          onChanged: (v) => setState(() => _lightCondition = v),
        ),
      ],
    );
  }

  Widget _buildConditionCard(ColorScheme cs) {
    final tt = Theme.of(context).textTheme;
    final h = plantHealth(widget.plant, widget.zone!, _stats!);
    final s = h.score;
    final (:bg, :fg) = scoreColors(context, s);

    return Card(
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text('Condition', style: tt.titleSmall)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
                  child: Text(s != null ? '$s%' : '—',
                      style: tt.labelMedium?.copyWith(color: fg)),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(plantHealthSummary(h),
                style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
          ],
        ),
      ),
    );
  }

  Widget _buildNotesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Notes', style: TextStyle(fontWeight: FontWeight.w500)),
        const SizedBox(height: 8),
        TextField(
          controller: _notesCtrl,
          maxLines: 4,
          decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'Enter notes'),
        ),
      ],
    );
  }
}
