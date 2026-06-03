import 'package:flutter/material.dart';

class AddPlantScreen extends StatefulWidget {
  final String zoneId;

  const AddPlantScreen({super.key, required this.zoneId});

  @override
  State<AddPlantScreen> createState() => _AddPlantScreenState();
}

class _AddPlantScreenState extends State<AddPlantScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _speciesCtrl = TextEditingController();
  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _slotCtrl = TextEditingController();

  @override
  void dispose() {
    _speciesCtrl.dispose();
    _nameCtrl.dispose();
    _slotCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    final result = {
      'zoneId': widget.zoneId,
      'species': _speciesCtrl.text.trim(),
      'name': _nameCtrl.text.trim().isEmpty ? null : _nameCtrl.text.trim(),
      'slotNumber': _slotCtrl.text.trim().isEmpty ? null : int.tryParse(_slotCtrl.text.trim()),
    };

    Navigator.of(context).pop(result);
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
              const Text('Providing an accurate species helps the AI give better care recommendations.', style: TextStyle(color: Colors.black54, fontSize: 12)),
              const SizedBox(height: 12),
              TextFormField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'Plant nickname (optional)', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _slotCtrl,
                decoration: const InputDecoration(labelText: 'Slot number (optional)', border: OutlineInputBorder()),
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submit,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700], shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 14),
                    child: Text('Add plant'),
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
