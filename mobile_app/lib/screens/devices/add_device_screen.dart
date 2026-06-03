import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/device_model.dart';
import '../../services/firestore/device_service.dart';

class AddDeviceScreen extends StatefulWidget {
  const AddDeviceScreen({super.key});

  @override
  State<AddDeviceScreen> createState() => _AddDeviceScreenState();
}

class _AddDeviceScreenState extends State<AddDeviceScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  String _deviceType = 'indoor';
  bool _hasLightingModule = false;
  bool _hasFertilizerModule = false;
  bool _loading = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    try {
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      final device = Device(
        id: '',
        userId: userId,
        deviceName: _nameCtrl.text.trim(),
        deviceType: _deviceType,
        status: 'offline',
        totalSlots: 4,
        hasLightingModule: _hasLightingModule,
        hasFertilizerModule: _hasFertilizerModule,
      );
      await DeviceService().createDevice(device);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to add device: $e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Device'),
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
                decoration: const InputDecoration(labelText: 'Device name', border: OutlineInputBorder()),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Please enter a device name' : null,
              ),
              const SizedBox(height: 12),
              InputDecorator(
                decoration: const InputDecoration(border: OutlineInputBorder(), labelText: 'Device type'),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _deviceType,
                    items: const [
                      DropdownMenuItem(value: 'indoor', child: Text('Indoor')),
                      DropdownMenuItem(value: 'outdoor', child: Text('Outdoor')),
                    ],
                    onChanged: (v) => setState(() => _deviceType = v ?? 'indoor'),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              const Text('Optional modules', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              const SizedBox(height: 4),
              const Text('Camera module is built-in on all devices.', style: TextStyle(color: Colors.black45, fontSize: 12)),
              const SizedBox(height: 12),
              _buildModuleToggle(
                icon: Icons.wb_sunny_outlined,
                label: 'Light module',
                value: _hasLightingModule,
                onChanged: (v) => setState(() => _hasLightingModule = v),
              ),
              const SizedBox(height: 10),
              _buildModuleToggle(
                icon: Icons.science_outlined,
                label: 'Fertilizer module',
                value: _hasFertilizerModule,
                onChanged: (v) => setState(() => _hasFertilizerModule = v),
              ),
              const SizedBox(height: 24),
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
                        : const Text('Register device'),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildModuleToggle({required IconData icon, required String label, required bool value, required ValueChanged<bool> onChanged}) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.green[700], size: 22),
          const SizedBox(width: 12),
          Expanded(child: Text(label, style: const TextStyle(fontSize: 15))),
          Switch(value: value, onChanged: onChanged, activeThumbColor: Colors.green[700]),
        ],
      ),
    );
  }
}
