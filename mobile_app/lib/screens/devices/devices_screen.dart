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
    // No app bar: the root screen's already titles this tab. "Add device" sits in the page header
    // (like "Add zone" on Plants): a FAB here would sit under the root scaffold's snackbars.
    return Scaffold(
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
              Row(
                children: [
                  Expanded(
                    child: Text('Your sensor nodes and cameras',
                        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  ),
                  FilledButton.icon(
                    onPressed: () => Navigator.push(
                        context, MaterialPageRoute(builder: (_) => const AddDeviceScreen())),
                    icon: const Icon(Icons.add),
                    label: const Text('Add device'),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              _buildSummaryCard(context, devices.length, onlineCount),
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

  Widget _buildSummaryCard(BuildContext context, int total, int online) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: cs.primaryContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(child: _summaryStatColumn('Total devices', total.toString(), Icons.developer_board)),
          Container(width: 1, height: 48, color: cs.onPrimaryContainer.withValues(alpha: 0.2)),
          Expanded(child: _summaryStatColumn('Online', online.toString(), Icons.wifi)),
          Container(width: 1, height: 48, color: cs.onPrimaryContainer.withValues(alpha: 0.2)),
          Expanded(child: _summaryStatColumn('Offline', (total - online).toString(), Icons.wifi_off)),
        ],
      ),
    );
  }

  Widget _summaryStatColumn(String label, String value, IconData icon) {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    return Column(
      children: [
        Icon(icon, color: cs.onPrimaryContainer, size: 22),
        const SizedBox(height: 6),
        Text(value,
            style: tt.headlineSmall?.copyWith(color: cs.onPrimaryContainer)),
        const SizedBox(height: 2),
        Text(label, style: tt.labelMedium?.copyWith(color: cs.onPrimaryContainer)),
      ],
    );
  }

  Widget _buildDeviceCard(BuildContext context, Device device) {
    final tt = Theme.of(context).textTheme;
    final cs     = Theme.of(context).colorScheme;
    final online = _isOnline(device);

    final chipBg    = online ? cs.primaryContainer : cs.surfaceContainerHighest;
    final chipColor = online ? cs.onPrimaryContainer : cs.onSurfaceVariant;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        onTap: () => Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => DeviceDetailScreen(device: device))),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Row(
            children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: chipBg,
                child: Icon(
                  device.isCamera ? Icons.camera_alt : Icons.developer_board,
                  color: chipColor,
                  size: 24,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(device.deviceName,
                        style: tt.titleMedium),
                    const SizedBox(height: 4),
                    Text(
                      device.typeLabel,
                      style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: chipBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(radius: 4, backgroundColor: chipColor),
                    const SizedBox(width: 6),
                    Text(
                      online ? 'Online' : 'Offline',
                      style: tt.labelLarge?.copyWith(color: chipColor),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
