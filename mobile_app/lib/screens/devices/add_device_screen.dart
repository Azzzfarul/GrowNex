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
  final _deviceIdCtrl = TextEditingController();
  Device? _foundDevice;
  bool _searching = false;
  String? _searchError;
  bool _claiming = false;

  @override
  void dispose() {
    _deviceIdCtrl.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final id = _deviceIdCtrl.text.trim();
    if (id.isEmpty) return;
    setState(() { _searching = true; _searchError = null; _foundDevice = null; });
    try {
      final device = await DeviceService().getDevice(id);
      if (!mounted) return;
      if (device == null) {
        setState(() => _searchError = 'Device not found. Check the ID and try again.');
      } else {
        final currentUserId = FirebaseAuth.instance.currentUser?.uid ?? '';
        final alreadyClaimed = device.userId.isNotEmpty && device.userId != currentUserId;
        if (alreadyClaimed) {
          setState(() => _searchError = 'This device is already registered to another account.');
        } else {
          setState(() => _foundDevice = device);
        }
      }
    } catch (e) {
      if (mounted) setState(() => _searchError = 'Search failed: $e');
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _claim() async {
    final device = _foundDevice;
    if (device == null) return;
    setState(() => _claiming = true);
    try {
      final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
      await DeviceService().claimDevice(device.id, userId);
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to claim device: $e')));
      }
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Add Device'),
        backgroundColor: Colors.green[700],
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Enter your ESP32 device ID to link it to your account.',
              style: TextStyle(color: Colors.black54, fontSize: 13),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _deviceIdCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Device ID',
                      hintText: 'e.g. ESP32-ABCD1234',
                      border: OutlineInputBorder(),
                      isDense: true,
                    ),
                    onSubmitted: (_) => _search(),
                  ),
                ),
                const SizedBox(width: 10),
                SizedBox(
                  height: 48,
                  child: ElevatedButton(
                    onPressed: _searching ? null : _search,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.green[700],
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                    child: _searching
                        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('Find'),
                  ),
                ),
              ],
            ),
            if (_searchError != null) ...[
              const SizedBox(height: 10),
              Text(_searchError!, style: TextStyle(color: Colors.red[400], fontSize: 13)),
            ],
            if (_foundDevice != null) ...[
              const SizedBox(height: 16),
              _buildFoundCard(_foundDevice!),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _claiming ? null : _claim,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.green[700],
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    child: _claiming
                        ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : const Text('Claim device'),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildFoundCard(Device device) {
    final isIndoor = device.deviceType.toLowerCase() == 'indoor';
    final isOnline = device.status == 'online';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.green[50],
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.green[200]!),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.check_circle, color: Colors.green[700], size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(device.deviceName,
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              CircleAvatar(radius: 4, backgroundColor: isOnline ? Colors.green[600] : Colors.grey),
              const SizedBox(width: 6),
              Text(
                '${isIndoor ? 'Indoor' : 'Outdoor'} · ${isOnline ? 'Online' : 'Offline'}',
                style: const TextStyle(color: Colors.black54, fontSize: 12),
              ),
            ],
          ),
          if (device.hasFertilizerModule || (isIndoor && device.hasLightingModule)) ...[
            const SizedBox(height: 12),
            const Text('Installed modules', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.black54)),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              children: [
                if (device.hasFertilizerModule) _moduleChip('Fertilizer', Icons.science_outlined),
                if (isIndoor && device.hasLightingModule) _moduleChip('Light', Icons.wb_sunny_outlined),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Widget _moduleChip(String label, IconData icon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.green[100],
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: Colors.green[700]),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 12, color: Colors.green[700], fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
