import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/zone_model.dart';
import '../../services/firestore/device_service.dart';
import '../../services/firestore/zone_service.dart';

class AddZoneScreen extends StatefulWidget {
  const AddZoneScreen({super.key});

  @override
  State<AddZoneScreen> createState() => _AddZoneScreenState();
}

class _AddZoneScreenState extends State<AddZoneScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _deviceCtrl = TextEditingController();
  String _zoneType = 'indoor';
  bool _loading = false;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _deviceCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _loading = true);
    try {
      final deviceId = _deviceCtrl.text.trim().isEmpty ? null : _deviceCtrl.text.trim();

      if (deviceId != null) {
        final device = await DeviceService().getDevice(deviceId);
        if (device == null) {
          _showError('Device "$deviceId" not found. Check the device ID and try again.');
          return;
        }
        if (device.assignedZoneId != null && device.assignedZoneId!.isNotEmpty) {
          _showError('Device "$deviceId" is already assigned to another zone.');
          return;
        }
      }

      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      final zone = Zone(
        id: '',
        userId: userId,
        zoneName: _nameCtrl.text.trim(),
        zoneType: _zoneType,
        status: 'healthy',
        totalPlantSlots: 0,
        deviceId: deviceId,
        createdAt: DateTime.now(),
      );

      final newZoneId = await ZoneService().createZone(zone);

      if (deviceId != null) {
        await DeviceService().assignDeviceToZone(deviceId, newZoneId);
      }

      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) _showError('Failed to create zone: $e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
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
                  onPressed: _loading ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green[700],
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: _loading
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('Create zone'),
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
