import 'package:flutter/material.dart';

import '../../models/plant_model.dart';
import '../../services/firestore/plant_service.dart';

class AddPlantScreen extends StatefulWidget {
  final String zoneId;
  final int totalPlantSlots;

  const AddPlantScreen({super.key, required this.zoneId, required this.totalPlantSlots});

  @override
  State<AddPlantScreen> createState() => _AddPlantScreenState();
}

class _AddPlantScreenState extends State<AddPlantScreen> {
  final _formKey = GlobalKey<FormState>();
  final _speciesCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _slotCtrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _speciesCtrl.dispose();
    _nameCtrl.dispose();
    _slotCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    try {
      final plant = Plant(
        id: '',
        zoneId: widget.zoneId,
        plantName: _nameCtrl.text.trim().isEmpty ? _speciesCtrl.text.trim() : _nameCtrl.text.trim(),
        species: _speciesCtrl.text.trim(),
        status: 'healthy',
        slotNumber: int.tryParse(_slotCtrl.text.trim()) ?? 0,
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
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextFormField(
                controller: _speciesCtrl,
                decoration: const InputDecoration(labelText: 'Species (e.g. Phalaenopsis)', border: OutlineInputBorder()),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Please enter the plant species' : null,
              ),
              const SizedBox(height: 8),
              const Text('Providing an accurate species helps the AI give better care recommendations.',
                  style: TextStyle(color: Colors.black54, fontSize: 12)),
              const SizedBox(height: 12),
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'Plant nickname (optional)', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _slotCtrl,
                decoration: InputDecoration(
                  labelText: 'Slot number (1–${widget.totalPlantSlots})',
                  border: const OutlineInputBorder(),
                ),
                keyboardType: TextInputType.number,
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return null;
                  final n = int.tryParse(v.trim());
                  if (n == null) return 'Enter a valid number';
                  if (n < 1 || n > widget.totalPlantSlots) return 'Slot must be between 1 and ${widget.totalPlantSlots}';
                  return null;
                },
              ),
              const SizedBox(height: 18),
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
      ),
    );
  }
}
