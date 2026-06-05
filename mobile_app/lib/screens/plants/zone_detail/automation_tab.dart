import 'package:flutter/material.dart';

import '../../../models/automation_config_model.dart';
import '../../../models/device_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/firestore/automation_config_service.dart';
import '../../../services/firestore/device_service.dart';

class AutomationTab extends StatefulWidget {
  final Zone zone;

  const AutomationTab({super.key, required this.zone});

  @override
  State<AutomationTab> createState() => _AutomationTabState();
}

class _AutomationTabState extends State<AutomationTab> {
  final _configService = AutomationConfigService();

  Stream<Device?>? _deviceStream;

  bool _autoWater     = false;
  bool _autoLight     = false;
  bool _autoFertilizer = false;

  final _wateringThresholdCtrl   = TextEditingController();
  final _wateringScheduleCtrl    = TextEditingController();
  final _wateringDurationCtrl    = TextEditingController();
  final _lightingScheduleCtrl    = TextEditingController();
  final _fertilizingScheduleCtrl = TextEditingController();
  final _fertilizingDurationCtrl = TextEditingController();

  String _savedWaterThreshold = '';
  String _savedWaterSchedule  = '';
  String _savedWaterDuration  = '';
  String _savedLightSchedule  = '';
  String _savedFertSchedule   = '';
  String _savedFertDuration   = '';

  @override
  void initState() {
    super.initState();
    _loadConfig();
    if (widget.zone.deviceId != null) {
      _deviceStream = DeviceService().watchDevice(widget.zone.deviceId!);
    }
  }

  @override
  void didUpdateWidget(AutomationTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.zone.deviceId != widget.zone.deviceId) {
      setState(() {
        _deviceStream = widget.zone.deviceId != null
            ? DeviceService().watchDevice(widget.zone.deviceId!)
            : null;
      });
    }
  }

  @override
  void dispose() {
    _wateringThresholdCtrl.dispose();
    _wateringScheduleCtrl.dispose();
    _wateringDurationCtrl.dispose();
    _lightingScheduleCtrl.dispose();
    _fertilizingScheduleCtrl.dispose();
    _fertilizingDurationCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadConfig() async {
    final config = await _configService.getConfig(widget.zone.id);
    if (config != null && mounted) {
      setState(() {
        _autoWater      = config.autoWateringEnabled;
        _autoLight      = config.autoLightingEnabled;
        _autoFertilizer = config.autoFertilizingEnabled;

        _wateringThresholdCtrl.text   = config.wateringThreshold?.toString() ?? '';
        _wateringScheduleCtrl.text    = config.wateringSchedule ?? '';
        _wateringDurationCtrl.text    = config.wateringDuration?.toString() ?? '';
        _lightingScheduleCtrl.text    = config.lightingSchedule ?? '';
        _fertilizingScheduleCtrl.text = config.fertilizingSchedule ?? '';
        _fertilizingDurationCtrl.text = config.fertilizingDuration?.toString() ?? '';

        _savedWaterThreshold = _wateringThresholdCtrl.text;
        _savedWaterSchedule  = _wateringScheduleCtrl.text;
        _savedWaterDuration  = _wateringDurationCtrl.text;
        _savedLightSchedule  = _lightingScheduleCtrl.text;
        _savedFertSchedule   = _fertilizingScheduleCtrl.text;
        _savedFertDuration   = _fertilizingDurationCtrl.text;
      });
    }
  }

  Future<void> _saveToggle(AutomationConfig config) async {
    await _configService.saveConfig(widget.zone.id, config);
  }

  Future<void> _saveTextConfig() async {
    final config = AutomationConfig(
      autoWateringEnabled:    _autoWater,
      wateringThreshold:      num.tryParse(_wateringThresholdCtrl.text),
      wateringSchedule:       _wateringScheduleCtrl.text.trim().isEmpty ? null : _wateringScheduleCtrl.text.trim(),
      wateringDuration:       int.tryParse(_wateringDurationCtrl.text),
      autoLightingEnabled:    _autoLight,
      lightingSchedule:       _lightingScheduleCtrl.text.trim().isEmpty ? null : _lightingScheduleCtrl.text.trim(),
      autoFertilizingEnabled: _autoFertilizer,
      fertilizingSchedule:    _fertilizingScheduleCtrl.text.trim().isEmpty ? null : _fertilizingScheduleCtrl.text.trim(),
      fertilizingDuration:    int.tryParse(_fertilizingDurationCtrl.text),
    );
    await _configService.saveConfig(widget.zone.id, config);
    setState(() {
      _savedWaterThreshold = _wateringThresholdCtrl.text;
      _savedWaterSchedule  = _wateringScheduleCtrl.text;
      _savedWaterDuration  = _wateringDurationCtrl.text;
      _savedLightSchedule  = _lightingScheduleCtrl.text;
      _savedFertSchedule   = _fertilizingScheduleCtrl.text;
      _savedFertDuration   = _fertilizingDurationCtrl.text;
    });
  }

  void _cancelTextConfig() {
    setState(() {
      _wateringThresholdCtrl.text   = _savedWaterThreshold;
      _wateringScheduleCtrl.text    = _savedWaterSchedule;
      _wateringDurationCtrl.text    = _savedWaterDuration;
      _lightingScheduleCtrl.text    = _savedLightSchedule;
      _fertilizingScheduleCtrl.text = _savedFertSchedule;
      _fertilizingDurationCtrl.text = _savedFertDuration;
    });
  }

  AutomationConfig _currentConfig() => AutomationConfig(
    autoWateringEnabled:    _autoWater,
    wateringThreshold:      num.tryParse(_wateringThresholdCtrl.text),
    wateringSchedule:       _wateringScheduleCtrl.text.trim().isEmpty ? null : _wateringScheduleCtrl.text.trim(),
    wateringDuration:       int.tryParse(_wateringDurationCtrl.text),
    autoLightingEnabled:    _autoLight,
    lightingSchedule:       _lightingScheduleCtrl.text.trim().isEmpty ? null : _lightingScheduleCtrl.text.trim(),
    autoFertilizingEnabled: _autoFertilizer,
    fertilizingSchedule:    _fertilizingScheduleCtrl.text.trim().isEmpty ? null : _fertilizingScheduleCtrl.text.trim(),
    fertilizingDuration:    int.tryParse(_fertilizingDurationCtrl.text),
  );

  @override
  Widget build(BuildContext context) {
    if (widget.zone.deviceId == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.settings_remote, size: 64, color: Colors.grey[350]),
              const SizedBox(height: 20),
              const Text('No device connected', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              const Text(
                'Connect a device to this zone from the Overview tab to access automation controls.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54),
              ),
            ],
          ),
        ),
      );
    }

    final isDirty = _wateringThresholdCtrl.text != _savedWaterThreshold ||
        _wateringScheduleCtrl.text    != _savedWaterSchedule  ||
        _wateringDurationCtrl.text    != _savedWaterDuration  ||
        _lightingScheduleCtrl.text    != _savedLightSchedule  ||
        _fertilizingScheduleCtrl.text != _savedFertSchedule   ||
        _fertilizingDurationCtrl.text != _savedFertDuration;

    return StreamBuilder<Device?>(
      stream: _deviceStream,
      builder: (context, snap) {
        final device   = snap.data;
        final hasFert  = device?.hasFertilizerModule ?? false;
        final hasLight = device?.hasLightingModule   ?? false;
        final isWaterOn  = device?.irrigationActive  ?? false;
        final isFertOn   = device?.fertilizerActive  ?? false;
        final isLightOn  = device?.lightActive        ?? false;
        final deviceId   = widget.zone.deviceId!;
        final svc        = DeviceService();

        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            const Text('Manual controls', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            if (hasFert)
              Row(
                children: [
                  Expanded(child: _buildActionCard('Water', Icons.water_drop, Colors.blue,
                    isOn: isWaterOn,
                    onToggle: () => svc.updateIrrigationState(deviceId, !isWaterOn))),
                  const SizedBox(width: 12),
                  Expanded(child: _buildActionCard('Fertilize', Icons.grass, Colors.amber,
                    isOn: isFertOn,
                    onToggle: () => svc.updateFertilizerState(deviceId, !isFertOn))),
                ],
              )
            else
              _buildActionCard('Water', Icons.water_drop, Colors.blue,
                isOn: isWaterOn,
                onToggle: () => svc.updateIrrigationState(deviceId, !isWaterOn)),
            if (hasLight) ...[
              const SizedBox(height: 12),
              _buildActionCard('Light', Icons.sunny, Colors.orange,
                isOn: isLightOn,
                onToggle: () => svc.updateLightState(deviceId, !isLightOn)),
            ],
            const SizedBox(height: 24),
            const Text('Automation settings', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            _buildToggleSetting(
              title: 'Water automation',
              subtitle: 'Trigger at moisture threshold or schedule',
              value: _autoWater,
              onChanged: (v) {
                setState(() => _autoWater = v);
                _saveToggle(_currentConfig().copyWith(autoWateringEnabled: v));
              },
              expandedContent: Column(
                children: [
                  TextField(
                    controller: _wateringThresholdCtrl,
                    decoration: const InputDecoration(labelText: 'Moisture threshold (%)', border: OutlineInputBorder()),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _wateringScheduleCtrl,
                    decoration: const InputDecoration(labelText: 'Daily schedule (e.g. 07:00)', border: OutlineInputBorder()),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _wateringDurationCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Watering duration (seconds, e.g. 300)',
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
              ),
            ),
            if (hasLight) ...[
              const SizedBox(height: 12),
              _buildToggleSetting(
                title: 'Light automation',
                subtitle: 'Schedule lighting times',
                value: _autoLight,
                onChanged: (v) {
                  setState(() => _autoLight = v);
                  _saveToggle(_currentConfig().copyWith(autoLightingEnabled: v));
                },
                expandedContent: TextField(
                  controller: _lightingScheduleCtrl,
                  decoration: const InputDecoration(labelText: 'Schedule (e.g. 08:00–18:00)', border: OutlineInputBorder()),
                  onChanged: (_) => setState(() {}),
                ),
              ),
            ],
            if (hasFert) ...[
              const SizedBox(height: 12),
              _buildToggleSetting(
                title: 'Fertilizer automation',
                subtitle: 'Trigger on schedule',
                value: _autoFertilizer,
                onChanged: (v) {
                  setState(() => _autoFertilizer = v);
                  _saveToggle(_currentConfig().copyWith(autoFertilizingEnabled: v));
                },
                expandedContent: Column(
                  children: [
                    TextField(
                      controller: _fertilizingScheduleCtrl,
                      decoration: const InputDecoration(labelText: 'Weekly schedule (e.g. MON 06:00)', border: OutlineInputBorder()),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _fertilizingDurationCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Fertilizing duration (seconds, e.g. 600)',
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                ),
              ),
            ],
            if (isDirty) ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _cancelTextConfig,
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _saveTextConfig,
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.green[700]),
                      child: const Text('Save', style: TextStyle(color: Colors.white)),
                    ),
                  ),
                ],
              ),
            ],
          ],
        );
      },
    );
  }

  Widget _buildActionCard(String title, IconData icon, Color color, {required bool isOn, required VoidCallback onToggle}) {
    final cs = Theme.of(context).colorScheme;
    return SizedBox(
      height: 110,
      child: ElevatedButton(
        onPressed: onToggle,
        style: ElevatedButton.styleFrom(
          backgroundColor: isOn ? Colors.green[700] : cs.surfaceContainer,
          foregroundColor: isOn ? Colors.white : color,
          elevation: 1,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
          padding: const EdgeInsets.all(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 28),
            const SizedBox(height: 16),
            Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: isOn ? Colors.white : color)),
          ],
        ),
      ),
    );
  }

  Widget _buildToggleSetting({
    required String title,
    required String subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
    required Widget expandedContent,
  }) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: cs.surfaceContainer,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [BoxShadow(color: cs.shadow.withValues(alpha: 0.08), blurRadius: 12, offset: const Offset(0, 6))],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.bold))),
              Switch(value: value, onChanged: onChanged, activeThumbColor: Colors.green[700]),
            ],
          ),
          Text(subtitle, style: TextStyle(color: cs.onSurface.withValues(alpha: 0.55))),
          if (value) ...[
            const SizedBox(height: 14),
            expandedContent,
          ],
        ],
      ),
    );
  }
}
