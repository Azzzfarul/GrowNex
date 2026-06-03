import 'package:flutter/material.dart';

class AddZoneScreen extends StatefulWidget {
  const AddZoneScreen({super.key});

  @override
  State<AddZoneScreen> createState() => _AddZoneScreenState();
}

class _AddZoneScreenState extends State<AddZoneScreen> {
  final _formKey = GlobalKey<FormState>();
  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _deviceCtrl = TextEditingController();
  String _zoneType = 'indoor';

  @override
  void dispose() {
    _nameCtrl.dispose();
    _deviceCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;

    final result = {
      'zoneName': _nameCtrl.text.trim(),
      'zoneType': _zoneType,
      'deviceId': _deviceCtrl.text.trim().isEmpty ? null : _deviceCtrl.text.trim(),
    };

    Navigator.of(context).pop(result);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Zone'),
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
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: 'Zone name', border: OutlineInputBorder()),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Please enter a zone name' : null,
              ),
              const SizedBox(height: 12),
              InputDecorator(
                decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Zone type'),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _zoneType,
                    items: const [
                      DropdownMenuItem(value: 'indoor', child: Text('Indoor')),
                      DropdownMenuItem(value: 'outdoor', child: Text('Outdoor')),
                    ],
                    onChanged: (v) => setState(() => _zoneType = v ?? 'indoor'),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _deviceCtrl,
                decoration: const InputDecoration(labelText: 'Assign device ID (optional)', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submit,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700], shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  child: const Padding(
                    padding: EdgeInsets.symmetric(vertical: 14),
                    child: Text('Create zone'),
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
