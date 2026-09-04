import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../models/plant_model.dart';
import '../../models/zone_model.dart';
import '../../services/ai_summary_service.dart';
import '../../services/firestore/plant_service.dart';
import '../../utils/zone_fit.dart';

class AddPlantScreen extends StatefulWidget {
  final String zoneId;
  final Set<int> takenSlots;
  final String zoneType;
  final String userId;

  const AddPlantScreen({
    super.key,
    required this.zoneId,
    required this.takenSlots,
    this.zoneType = 'indoor',
    this.userId = '',
  });

  @override
  State<AddPlantScreen> createState() => _AddPlantScreenState();
}

class _AddPlantScreenState extends State<AddPlantScreen> {
  static const int _maxSlots = 4;

  final _formKey = GlobalKey<FormState>();
  final _speciesCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _moistureMinCtrl = TextEditingController();
  final _moistureMaxCtrl = TextEditingController();
  final _humidityMinCtrl = TextEditingController();
  final _humidityMaxCtrl = TextEditingController();
  final _tempMinCtrl = TextEditingController();
  final _tempMaxCtrl = TextEditingController();
  String? _lightCondition;
  int? _selectedSlot;
  bool _loading = false;
  late final List<int> _availableSlots;

  bool _aiLoading = false;
  String _aiSource = '';           // '' | 'ai' | 'cache' | 'fallback' | 'error'
  String? _aiCommonName;
  String _aiConfidence = 'high';
  String? _aiCareNotes;
  Map<String, ({Zone zone, List<Plant> plants})> _zonesById = {};
  bool _hintDismissed = false;

  @override
  void initState() {
    super.initState();
    _availableSlots = List.generate(_maxSlots, (i) => i + 1)
        .where((s) => !widget.takenSlots.contains(s))
        .toList();
    _loadSiblingZones();
  }

  Future<void> _loadSiblingZones() async {
    if (widget.userId.isEmpty) return;
    try {
      final db = FirebaseFirestore.instance;
      final zonesSnap = await db.collection('zones').where('userId', isEqualTo: widget.userId).get();
      final map = <String, ({Zone zone, List<Plant> plants})>{};
      for (final zd in zonesSnap.docs) {
        final zone = Zone.fromMap(zd.id, zd.data());
        final ps = await db.collection('plants').where('zoneId', isEqualTo: zd.id).get();
        map[zd.id] = (zone: zone, plants: ps.docs.map((d) => Plant.fromMap(d.id, d.data())).toList());
      }
      if (mounted) setState(() => _zonesById = map);
    } catch (_) {/* hint just won't show */}
  }

  num? _n(TextEditingController c) => num.tryParse(c.text.trim());

  ZoneSuggestion? get _zoneHint {
    if (_hintDismissed || _zonesById.length < 2) return null;
    if (_n(_tempMinCtrl) == null && _n(_moistureMinCtrl) == null) return null;
    return zoneFitHint(
      moistureMin: _n(_moistureMinCtrl), moistureMax: _n(_moistureMaxCtrl),
      humidityMin: _n(_humidityMinCtrl), humidityMax: _n(_humidityMaxCtrl),
      temperatureMin: _n(_tempMinCtrl), temperatureMax: _n(_tempMaxCtrl),
      lightCondition: _lightCondition,
      currentZoneId: widget.zoneId,
      zonesById: _zonesById,
    );
  }

  Future<void> _suggestConditions() async {
    final species = _speciesCtrl.text.trim();
    if (species.length < 3) return;
    setState(() => _aiLoading = true);
    try {
      final res = await const AiSummaryService().fetchPlantProfile({
        'species': species,
        'zoneType': widget.zoneType,
      });
      final p = res.profile;
      if (!mounted) return;
      setState(() {
        _aiSource = res.source;
        if (p != null) {
          void fill(TextEditingController c, dynamic v) { if (v is num) c.text = v.toString(); }
          fill(_moistureMinCtrl, p['preferredMoistureMin']);
          fill(_moistureMaxCtrl, p['preferredMoistureMax']);
          fill(_humidityMinCtrl, p['preferredHumidityMin']);
          fill(_humidityMaxCtrl, p['preferredHumidityMax']);
          fill(_tempMinCtrl, p['preferredTemperatureMin']);
          fill(_tempMaxCtrl, p['preferredTemperatureMax']);
          final light = p['preferredLightCondition'];
          if (light is String && ['low', 'medium', 'high'].contains(light)) _lightCondition = light;
          _aiCommonName = p['commonName'] as String?;
          _aiConfidence = (p['confidence'] as String?) ?? 'high';
          _aiCareNotes = p['careNotes'] as String?;
        }
      });
    } finally {
      if (mounted) setState(() => _aiLoading = false);
    }
  }

  @override
  void dispose() {
    _speciesCtrl.dispose();
    _nameCtrl.dispose();
    _moistureMinCtrl.dispose();
    _moistureMaxCtrl.dispose();
    _humidityMinCtrl.dispose();
    _humidityMaxCtrl.dispose();
    _tempMinCtrl.dispose();
    _tempMaxCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_selectedSlot == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please select a slot.')));
      return;
    }

    setState(() => _loading = true);
    try {
      final plant = Plant(
        id: '',
        zoneId: widget.zoneId,
        plantName: _nameCtrl.text.trim().isEmpty ? _speciesCtrl.text.trim() : _nameCtrl.text.trim(),
        species: _speciesCtrl.text.trim(),
        status: 'healthy',
        slotNumber: _selectedSlot!,
        preferredMoistureMin: double.tryParse(_moistureMinCtrl.text.trim()),
        preferredMoistureMax: double.tryParse(_moistureMaxCtrl.text.trim()),
        preferredHumidityMin: double.tryParse(_humidityMinCtrl.text.trim()),
        preferredHumidityMax: double.tryParse(_humidityMaxCtrl.text.trim()),
        preferredTemperatureMin: double.tryParse(_tempMinCtrl.text.trim()),
        preferredTemperatureMax: double.tryParse(_tempMaxCtrl.text.trim()),
        preferredLightCondition: _lightCondition,
        notes: (_aiCareNotes != null && _aiCareNotes!.trim().isNotEmpty) ? _aiCareNotes!.trim() : null,
        createdAt: DateTime.now(),
      );
      await PlantService().createPlant(plant);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to add plant: $e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Plant'),
        backgroundColor: Colors.green[700],
      ),
      body: _availableSlots.isEmpty ? _buildFullMessage() : _buildForm(),
    );
  }

  Widget _buildFullMessage() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.grass, size: 64, color: Colors.grey[400]),
            const SizedBox(height: 16),
            const Text('Zone is full', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(
              'All $_maxSlots plant slots are occupied. Remove a plant to free up a slot.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildForm() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Form(
        key: _formKey,
        child: ListView(
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _speciesCtrl,
                    decoration: const InputDecoration(labelText: 'Species (e.g. Phalaenopsis)', border: OutlineInputBorder()),
                    onChanged: (_) => setState(() { _aiSource = ''; _aiCommonName = null; }),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Please enter the plant species' : null,
                  ),
                ),
                const SizedBox(width: 8),
                SizedBox(
                  height: 56,
                  child: ElevatedButton(
                    onPressed: _aiLoading || _speciesCtrl.text.trim().length < 3 ? null : _suggestConditions,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green[50],
                      foregroundColor: Colors.green[800],
                      elevation: 0,
                    ),
                    child: _aiLoading
                        ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Text('✨ Suggest'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            _buildSpeciesCaption(),
            const SizedBox(height: 12),
            TextFormField(
              controller: _nameCtrl,
              decoration: const InputDecoration(labelText: 'Plant nickname (optional)', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 20),
            _buildSlotPicker(),
            const SizedBox(height: 20),
            _buildPreferredConditions(),
            const SizedBox(height: 20),
            if (_zoneHint != null) ...[
              _buildZoneHint(_zoneHint!),
              const SizedBox(height: 16),
            ],
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green[700],
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  child: _loading
                      ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : const Text('Add plant'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool get _aiApplied => _aiSource == 'ai' || _aiSource == 'cache';

  Widget _buildSpeciesCaption() {
    if (_aiSource == 'fallback' || _aiSource == 'error') {
      return const Text('Couldn’t fetch suggestions — enter the conditions manually.',
          style: TextStyle(color: Colors.black54, fontSize: 12));
    }
    if (_aiApplied) {
      return Wrap(
        children: [
          if (_aiCommonName != null && _aiCommonName!.trim().isNotEmpty)
            Text('Interpreted as $_aiCommonName. ',
                style: const TextStyle(color: Colors.black87, fontSize: 12, fontWeight: FontWeight.w500)),
          if (_aiConfidence == 'low')
            const Text('Low-confidence guess — double-check these. ',
                style: TextStyle(color: Colors.orange, fontSize: 12)),
          if (_aiCareNotes != null && _aiCareNotes!.trim().isNotEmpty)
            const Text('Care tips added to Notes below.',
                style: TextStyle(color: Colors.black54, fontSize: 12)),
        ],
      );
    }
    return const Text(
      '✨ Suggest fills in the preferred conditions below and adds care tips for this species to Notes.',
      style: TextStyle(color: Colors.black54, fontSize: 12),
    );
  }

  static const _hintReason = {
    'temperature': 'needs a different temperature range than',
    'light': 'needs a different light level than',
    'humidity': 'prefers a different humidity than',
    'moisture': 'prefers different soil moisture than',
  };

  Widget _buildZoneHint(ZoneSuggestion hint) {
    final reason = _hintReason[hint.reason] ?? 'is a poorer fit for';
    final msg = hint.kind == 'move'
        ? 'This plant $reason this zone’s other plants — "${hint.zone!.zoneName}" is a closer match.'
        : 'This plant $reason this zone’s other plants, and none of your other zones suit it either. '
            'Consider giving it its own zone.';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.amber.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(msg, style: TextStyle(color: Colors.orange[900], fontSize: 13)),
          GestureDetector(
            onTap: () => setState(() => _hintDismissed = true),
            child: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Dismiss',
                  style: TextStyle(color: Colors.orange[800], fontSize: 12, decoration: TextDecoration.underline)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSlotPicker() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Plant slot', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
        const SizedBox(height: 4),
        const Text('Select an available slot for this plant.', style: TextStyle(color: Colors.black54, fontSize: 12)),
        const SizedBox(height: 12),
        Row(
          children: List.generate(_maxSlots, (i) {
            final slot = i + 1;
            final isTaken = widget.takenSlots.contains(slot);
            final isSelected = _selectedSlot == slot;

            return Padding(
              padding: const EdgeInsets.only(right: 10),
              child: GestureDetector(
                onTap: isTaken ? null : () => setState(() => _selectedSlot = isSelected ? null : slot),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: isTaken
                        ? Colors.grey[100]
                        : isSelected
                            ? Colors.green[700]
                            : Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: isTaken
                          ? Colors.grey[300]!
                          : isSelected
                              ? Colors.green[700]!
                              : Colors.grey[300]!,
                      width: isSelected ? 2 : 1,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        isTaken ? Icons.block : Icons.local_florist_outlined,
                        size: 22,
                        color: isTaken ? Colors.grey[400] : isSelected ? Colors.white : Colors.green[700],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Slot $slot',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: isTaken ? Colors.grey[400] : isSelected ? Colors.white : Colors.black87,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
        if (_selectedSlot == null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('No slot selected', style: TextStyle(color: Colors.black45, fontSize: 12)),
          ),
      ],
    );
  }

  Widget _buildPreferredConditions() {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.grey[200]!),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          leading: Icon(Icons.tune, color: Colors.green[700]),
          initiallyExpanded: _aiApplied,
          title: const Text('Preferred growing conditions', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
          subtitle: const Text('Optional — helps compute ideal zone environment', style: TextStyle(fontSize: 11, color: Colors.black45)),
          children: [
            if (_aiApplied) ...[
              Text(
                'AI suggestion — adjust as needed. Different growth stages need different soil '
                'moisture and feeding; revisit these as the plant matures.',
                style: TextStyle(fontSize: 11, color: Colors.green[800]),
              ),
              const SizedBox(height: 12),
            ],
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
      onChanged: (_) => setState(() {}),
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
}
