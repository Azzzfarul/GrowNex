import 'dart:io';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/zone_model.dart';
import '../../services/firestore/zone_service.dart';
import '../../services/photo_service.dart';

class AddZoneScreen extends StatefulWidget {
  const AddZoneScreen({super.key});

  @override
  State<AddZoneScreen> createState() => _AddZoneScreenState();
}

class _AddZoneScreenState extends State<AddZoneScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  String _zoneType = 'indoor';
  bool _loading = false;
  XFile? _photoFile;

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
      final zoneRef = ZoneService().newZoneRef();
      final zone = Zone(
        id: zoneRef.id,
        userId: userId,
        zoneName: _nameCtrl.text.trim(),
        zoneType: _zoneType,
        status: 'healthy',
        totalPlantSlots: 0,
        createdAt: DateTime.now(),
      );

      await ZoneService().createZoneWithId(zone);
      if (_photoFile != null) {
        try {
          await PhotoService().uploadZonePhoto(zone.id, _photoFile!);
        } catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('Zone created, but photo upload failed: $e')),
            );
          }
        }
      }

      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to create zone: $e')));
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Widget _buildPhotoPicker() {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: cs.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(14),
          ),
          clipBehavior: Clip.antiAlias,
          child: _photoFile != null
              ? Image.file(File(_photoFile!.path), fit: BoxFit.cover)
              : Icon(Icons.photo_outlined, size: 28, color: cs.onSurfaceVariant),
        ),
        const SizedBox(width: 12),
        TextButton(
          onPressed: _pickPhoto,
          child: Text(_photoFile != null ? 'Change photo' : 'Add photo (optional)'),
        ),
      ],
    );
  }

  Future<void> _pickPhoto() async {
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
    if (file != null && mounted) setState(() => _photoFile = file);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Zone'),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildPhotoPicker(),
              const SizedBox(height: 16),
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
              const SizedBox(height: 8),
              Text(
                'You can assign a device to this zone after creation from the zone\'s Overview tab.',
                style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant),
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _loading ? null : _submit,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: _loading
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
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
