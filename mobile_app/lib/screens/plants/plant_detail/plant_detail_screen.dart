import 'package:flutter/material.dart';

import '../../../models/plant_model.dart';
import '../../../services/firestore/plant_service.dart';

class PlantDetailScreen extends StatefulWidget {
  final Plant plant;

  const PlantDetailScreen({super.key, required this.plant});

  @override
  State<PlantDetailScreen> createState() => _PlantDetailScreenState();
}

class _PlantDetailScreenState extends State<PlantDetailScreen> {
  late final TextEditingController _nameController;
  late final TextEditingController _speciesController;
  late final TextEditingController _notesController;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.plant.plantName);
    _speciesController = TextEditingController(text: widget.plant.species);
    _notesController = TextEditingController(text: widget.plant.notes);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _speciesController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      final updated = Plant(
        id: widget.plant.id,
        zoneId: widget.plant.zoneId,
        plantName: _nameController.text.trim(),
        species: _speciesController.text.trim(),
        status: widget.plant.status,
        slotNumber: widget.plant.slotNumber,
        preferredMoistureMin: widget.plant.preferredMoistureMin,
        preferredMoistureMax: widget.plant.preferredMoistureMax,
        preferredHumidityMin: widget.plant.preferredHumidityMin,
        preferredHumidityMax: widget.plant.preferredHumidityMax,
        preferredTemperatureMin: widget.plant.preferredTemperatureMin,
        preferredTemperatureMax: widget.plant.preferredTemperatureMax,
        preferredLightCondition: widget.plant.preferredLightCondition,
        notes: _notesController.text.trim().isEmpty ? null : _notesController.text.trim(),
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Plant details'),
        backgroundColor: Colors.green[700],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildPhotoSection(),
          const SizedBox(height: 20),
          _buildField('Name', _nameController),
          const SizedBox(height: 16),
          _buildField('Species', _speciesController),
          const SizedBox(height: 20),
          _buildSensorOverview(),
          const SizedBox(height: 20),
          _buildNotesField(),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _loading ? null : _save,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.green[700],
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

  Widget _buildPhotoSection() {
    return Container(
      height: 180,
      decoration: BoxDecoration(color: Colors.grey[200], borderRadius: BorderRadius.circular(18)),
      child: const Center(child: Icon(Icons.local_florist, size: 60, color: Colors.black38)),
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

  Widget _buildSensorOverview() {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Plant overview', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 14),
          const Text('Latest moisture: --'),
          const SizedBox(height: 8),
          const Text('Condition: Good', style: TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildNotesField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Notes', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        TextField(
          controller: _notesController,
          maxLines: 4,
          decoration: const InputDecoration(border: OutlineInputBorder(), hintText: 'Enter notes'),
        ),
      ],
    );
  }
}
