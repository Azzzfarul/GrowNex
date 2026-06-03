import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../../models/device_model.dart';
import '../../services/firestore/device_service.dart';
import 'add_device_screen.dart';
import 'device_detail_screen.dart';

class DevicesScreen extends StatefulWidget {
  const DevicesScreen({super.key});

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  late final Stream<List<Device>> _devicesStream;

  @override
  void initState() {
    super.initState();
    final userId = FirebaseAuth.instance.currentUser?.uid ?? '';
    _devicesStream = DeviceService().watchDevices(userId);
  }

  bool _isOnline(Device device) => device.status == 'online';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text('Devices', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Colors.grey[100],
        elevation: 0,
        foregroundColor: Colors.black,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: ElevatedButton.icon(
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AddDeviceScreen())),
              icon: const Icon(Icons.add),
              label: const Text('Add device'),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700]),
            ),
          ),
        ],
      ),
      body: StreamBuilder<List<Device>>(
        stream: _devicesStream,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting && !snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          final devices = snapshot.data ?? [];
          final onlineCount = devices.where(_isOnline).length;

          return ListView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            children: [
              _buildSummaryCard(devices.length, onlineCount),
              const SizedBox(height: 24),
              if (devices.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(child: Text('No devices registered yet.')),
                )
              else
                ...devices.map((device) => _buildDeviceCard(context, device)),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSummaryCard(int total, int online) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.green[700],
        borderRadius: BorderRadius.circular(20),
        boxShadow: [BoxShadow(color: Colors.green.withValues(alpha: 0.3), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Row(
        children: [
          Expanded(
            child: _summaryStatColumn('Total devices', total.toString(), Icons.developer_board),
          ),
          Container(width: 1, height: 48, color: Colors.white24),
          Expanded(
            child: _summaryStatColumn('Online', online.toString(), Icons.wifi),
          ),
          Container(width: 1, height: 48, color: Colors.white24),
          Expanded(
            child: _summaryStatColumn('Offline', (total - online).toString(), Icons.wifi_off),
          ),
        ],
      ),
    );
  }

  Widget _summaryStatColumn(String label, String value, IconData icon) {
    return Column(
      children: [
        Icon(icon, color: Colors.white70, size: 22),
        const SizedBox(height: 6),
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
        const SizedBox(height: 2),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
      ],
    );
  }

  Widget _buildDeviceCard(BuildContext context, Device device) {
    final online = _isOnline(device);
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => DeviceDetailScreen(device: device))),
      child: Container(
        margin: const EdgeInsets.only(bottom: 14),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 12, offset: const Offset(0, 6))],
        ),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: online ? Colors.green[50] : Colors.grey[100],
              child: Icon(Icons.developer_board, color: online ? Colors.green[700] : Colors.grey, size: 24),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(device.deviceName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(
                    device.deviceType == 'indoor' ? 'Indoor' : 'Outdoor',
                    style: const TextStyle(color: Colors.black45, fontSize: 13),
                  ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: online ? Colors.green[50] : Colors.grey[100],
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  CircleAvatar(radius: 4, backgroundColor: online ? Colors.green[700] : Colors.grey),
                  const SizedBox(width: 6),
                  Text(
                    online ? 'Online' : 'Offline',
                    style: TextStyle(
                      color: online ? Colors.green[700] : Colors.grey,
                      fontWeight: FontWeight.w600,
                      fontSize: 13,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
