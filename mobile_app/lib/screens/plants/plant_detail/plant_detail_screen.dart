import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../models/plant_model.dart';
import '../../../services/firestore/plant_service.dart';

class PlantDetailScreen extends StatefulWidget {
  final Plant plant;

  const PlantDetailScreen({super.key, required this.plant});

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

  @override
  void initState() {
    super.initState();
    final p = widget.plant;
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
        plantName: _nameCtrl.text.trim(),
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
        createdAt: widget.plant.createdAt,
      );
      await PlantService().updatePlant(updated);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Changes saved.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to save: $e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
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

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Plant details'),
        backgroundColor: Colors.green[700],
        foregroundColor: Colors.white,
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
          const SizedBox(height: 20),
          _buildNotesField(),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _loading ? null : _save,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green[700],
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Save changes'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoSection(ColorScheme cs) {
    return Container(
      height: 180,
      decoration: BoxDecoration(color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(18)),
      child: Center(child: Icon(Icons.local_florist, size: 60, color: cs.onSurface.withValues(alpha: 0.38))),
    );
  }

  Widget _buildField(String label, TextEditingController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        TextField(controller: controller, decoration: const InputDecoration(border: OutlineInputBorder())),
      ],
    );
  }

  Widget _buildSensorOverview(ColorScheme cs) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Plant overview', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          SizedBox(height: 14),
          Text('Latest moisture: --'),
          SizedBox(height: 8),
          Text('Condition: Good', style: TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildPreferredConditions(ColorScheme cs) {
    return Container(
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
          initiallyExpanded: _hasAnyCondition(),
          leading: Icon(Icons.tune, color: Colors.green[700]),
          title: const Text('Preferred growing conditions', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          subtitle: Text('Used to compute ideal zone environment',
              style: TextStyle(fontSize: 11, color: cs.onSurface.withValues(alpha: 0.45))),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        const SizedBox(height: 6),
        Row(
          children: [
            Expanded(child: _numField('Min', minCtrl)),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('–', style: TextStyle(fontWeight: FontWeight.bold))),
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
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Light condition', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
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

  Widget _buildNotesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Notes', style: TextStyle(fontWeight: FontWeight.bold)),
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
