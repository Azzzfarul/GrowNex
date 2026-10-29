import 'package:flutter/material.dart';

import '../../../models/automation_config_model.dart';
import '../../../models/device_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/ai_summary_service.dart';
import '../../../services/firestore/automation_config_service.dart';
import '../../../services/firestore/device_service.dart';

// Formats the bridge's schedule parsers accept (web_dashboard/server/src/services/mqttBridge.js).
// Same rules as the web Automation tab.
final _timeRe  = RegExp(r'^([01]?\d|2[0-3]):[0-5]\d$');
final _lightRe = RegExp(r'^([01]?\d|2[0-3]):[0-5]\d\s*[–-]\s*([01]?\d|2[0-3]):[0-5]\d$');
final _fertRe  = RegExp(r'^(MON|TUE|WED|THU|FRI|SAT|SUN) ([01]?\d|2[0-3]):[0-5]\d$');

class AutomationTab extends StatefulWidget {
  final Zone zone;

  const AutomationTab({super.key, required this.zone});

  @override
  State<AutomationTab> createState() => _AutomationTabState();
}

class _AutomationTabState extends State<AutomationTab> {
  final _configService = AutomationConfigService();

  AutomationPlanResult? _aiPlan;
  bool _aiLoading = false;

  Stream<Device?>? _deviceStream;

  // Until the saved config arrives the form shows defaults; a toggle then would overwrite
  // the real config, so nothing is editable before this is true.
  bool _loaded = false;
  String? _loadError;  // shown with a Retry button instead of an endless spinner
  bool _autoWater     = false;
  bool _autoLight     = false;
  bool _autoFertilizer = false;
  final _savingToggles = <String>{};  // config fields with a toggle save in flight

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
    if (_loadError != null) setState(() => _loadError = null);
    final AutomationConfig? config;
    try {
      config = await _configService.getConfig(widget.zone.id);
    } catch (e) {
      debugPrint('Could not load automation settings: $e');
      if (mounted) setState(() => _loadError = 'Could not load automation settings.');
      return;
    }
    if (!mounted) return;
    setState(() => _loaded = true);
    if (config case final config?) {
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

  void _snack(String msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));

  // A toggle writes only its own flag — never the (possibly unsaved) text fields.
  // On failure the switch flips back, so it never shows a setting that wasn't saved.
  // The switch is disabled until its save settles, so a failed save can't undo a newer flip.
  Future<void> _saveToggle(String field, bool value, VoidCallback revert) async {
    setState(() => _savingToggles.add(field));
    try {
      await _configService.saveFields(widget.zone.id, {field: value});
    } catch (e) {
      debugPrint('Failed to save: $e');
      if (!mounted) return;
      setState(revert);
      _snack('Failed to save. Please try again.');
    } finally {
      if (mounted) setState(() => _savingToggles.remove(field));
    }
  }

  Future<void> _saveTextConfig() async {
    String? text(TextEditingController c, {bool upper = false}) {
      final v = upper ? c.text.trim().toUpperCase() : c.text.trim();
      return v.isEmpty ? null : v;
    }
    final ws = text(_wateringScheduleCtrl), ls = text(_lightingScheduleCtrl), fs = text(_fertilizingScheduleCtrl, upper: true);
    // Only check fields the user changed: a hidden field (e.g. lighting without a light
    // module) holding an old value must not block saving the others.
    bool bad(String? v, String saved, RegExp re) => v != null && v != saved.trim() && !re.hasMatch(v);
    final error = bad(ws, _savedWaterSchedule, _timeRe) ? 'Watering time must look like 07:00 (24-hour).'
        : bad(ls, _savedLightSchedule, _lightRe) ? 'Lighting schedule must look like 08:00–18:00.'
        : bad(fs, _savedFertSchedule, _fertRe) ? 'Fertilizing schedule must look like MON 06:00.'
        : null;
    if (error != null) return _snack(error);

    try {
      await _configService.saveFields(widget.zone.id, {
        'wateringThreshold':   num.tryParse(_wateringThresholdCtrl.text.trim()),
        'wateringSchedule':    ws,
        'wateringDuration':    int.tryParse(_wateringDurationCtrl.text.trim()),
        'lightingSchedule':    ls,
        'fertilizingSchedule': fs,
        'fertilizingDuration': int.tryParse(_fertilizingDurationCtrl.text.trim()),
      });
    } catch (e) {
      debugPrint('Failed to save: $e');
      if (mounted) _snack('Failed to save. Please try again.');
      return;
    }
    if (!mounted) return;
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

  Future<void> _requestAiPlan() async {
    setState(() => _aiLoading = true);
    final res = await const AiSummaryService().fetchAutomationPlan({'zoneId': widget.zone.id});
    if (!mounted) return;
    setState(() {
      _aiPlan = res;
      _aiLoading = false;
    });
  }

  Future<void> _applyAiPlan(Map<String, dynamic> plan) async {
    num? asNum(dynamic v) => v is num ? v : (v is String ? num.tryParse(v) : null);
    int? asInt(dynamic v) => v is int ? v : (v is num ? v.toInt() : (v is String ? int.tryParse(v) : null));
    String? asStr(dynamic v) => (v is String && v.trim().isNotEmpty) ? v.trim() : null;

    final config = AutomationConfig(
      autoWateringEnabled:    plan['autoWateringEnabled'] == true,
      wateringThreshold:      asNum(plan['wateringThreshold']),
      wateringSchedule:       asStr(plan['wateringSchedule']),
      wateringDuration:       asInt(plan['wateringDuration']),
      autoLightingEnabled:    plan['autoLightingEnabled'] == true,
      lightingSchedule:       asStr(plan['lightingSchedule']),
      autoFertilizingEnabled: plan['autoFertilizingEnabled'] == true,
      fertilizingSchedule:    asStr(plan['fertilizingSchedule']),
      fertilizingDuration:    asInt(plan['fertilizingDuration']),
      aiRecommended:          true,
    );
    await _configService.saveConfig(widget.zone.id, config);
    if (!mounted) return;
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
      _aiPlan = null;
    });
  }

  Widget _buildAiPlanPreview() {
    final tt = Theme.of(context).textTheme;
    final cs = Theme.of(context).colorScheme;
    final result = _aiPlan!;
    if (result.plan == null) {
      return Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: cs.surfaceContainerHigh, borderRadius: BorderRadius.circular(14)),
        child: Row(
          children: [
            const Expanded(child: Text("Couldn't reach the AI service. Try again in a moment.")),
            TextButton(onPressed: () => setState(() => _aiPlan = null), child: const Text('Dismiss')),
          ],
        ),
      );
    }
    final plan = result.plan!;
    String s(dynamic v) => (v == null || (v is String && v.isEmpty)) ? '—' : '$v';
    final rows = <List<String>>[
      ['Auto watering',            _autoWater ? 'On' : 'Off',                s(plan['autoWateringEnabled'] == true ? 'On' : 'Off')],
      ['Moisture threshold (%)',   s(_wateringThresholdCtrl.text),           s(plan['wateringThreshold'])],
      ['Watering time',            s(_wateringScheduleCtrl.text),            s(plan['wateringSchedule'])],
      ['Watering duration (s)',    s(_wateringDurationCtrl.text),            s(plan['wateringDuration'])],
      ['Auto lighting',            _autoLight ? 'On' : 'Off',                plan['autoLightingEnabled'] == true ? 'On' : 'Off'],
      ['Lighting schedule',        s(_lightingScheduleCtrl.text),            s(plan['lightingSchedule'])],
      ['Auto fertilizing',         _autoFertilizer ? 'On' : 'Off',           plan['autoFertilizingEnabled'] == true ? 'On' : 'Off'],
      ['Fertilizing schedule',     s(_fertilizingScheduleCtrl.text),         s(plan['fertilizingSchedule'])],
      ['Fertilizing duration (s)', s(_fertilizingDurationCtrl.text),         s(plan['fertilizingDuration'])],
    ];
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.auto_awesome, size: 18, color: cs.primary),
              const SizedBox(width: 8),
              Expanded(child: Text('Suggested automation plan', style: tt.titleSmall)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: cs.primaryContainer,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(result.source == 'ai' ? 'AI' : 'Auto',
                    style: tt.labelSmall?.copyWith(color: cs.onPrimaryContainer)),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...rows.map((r) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  children: [
                    Expanded(child: Text(r[0], style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant))),
                    Text(r[1], style: tt.bodyMedium?.copyWith(color: cs.onSurfaceVariant)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      child: Icon(Icons.arrow_forward, size: 14, color: cs.onSurfaceVariant),
                    ),
                    Text(r[2], style: tt.labelLarge),
                  ],
                ),
              )),
          if (result.rationale.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...result.rationale.map((r) => Padding(
                  padding: const EdgeInsets.only(bottom: 3),
                  child: Text('• ${r.text}',
                      style: tt.bodySmall?.copyWith(color: cs.onSurfaceVariant)),
                )),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: () => setState(() => _aiPlan = null),
                  child: const Text('Dismiss'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: () => _applyAiPlan(plan),
                  child: const Text('Apply'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    if (widget.zone.deviceId == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.settings_remote, size: 64, color: cs.outlineVariant),
              const SizedBox(height: 20),
              Text('No device connected', style: tt.titleMedium),
              const SizedBox(height: 10),
              Text(
                'Connect a device to this zone from the Overview tab to access automation controls.',
                textAlign: TextAlign.center,
                style: TextStyle(color: cs.onSurfaceVariant),
              ),
            ],
          ),
        ),
      );
    }

    if (!_loaded) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: _loadError == null
              ? const CircularProgressIndicator()
              : Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(_loadError!, textAlign: TextAlign.center),
                  const SizedBox(height: 12),
                  OutlinedButton(onPressed: _loadConfig, child: const Text('Retry')),
                ]),
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
        final tt = Theme.of(context).textTheme;
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
            Text('Manual controls', style: tt.titleMedium),
            const SizedBox(height: 12),
            if (hasFert)
              Row(
                children: [
                  Expanded(child: _buildActionCard('Water', Icons.water_drop,
                    isOn: isWaterOn,
                    onToggle: () => svc.updateIrrigationState(deviceId, !isWaterOn))),
                  const SizedBox(width: 12),
                  Expanded(child: _buildActionCard('Fertilize', Icons.grass,
                    isOn: isFertOn,
                    onToggle: () => svc.updateFertilizerState(deviceId, !isFertOn))),
                ],
              )
            else
              _buildActionCard('Water', Icons.water_drop,
                isOn: isWaterOn,
                onToggle: () => svc.updateIrrigationState(deviceId, !isWaterOn)),
            if (hasLight) ...[
              const SizedBox(height: 12),
              _buildActionCard('Light', Icons.sunny,
                isOn: isLightOn,
                onToggle: () => svc.updateLightState(deviceId, !isLightOn)),
            ],
            const SizedBox(height: 24),
            Row(
              children: [
                Expanded(
                  child: Text('Automation settings', style: tt.titleMedium),
                ),
                FilledButton.tonalIcon(
                  onPressed: _aiLoading ? null : _requestAiPlan,
                  icon: _aiLoading
                      ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.auto_awesome),
                  label: Text(_aiLoading ? 'Thinking…' : 'Use AI recommendation'),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_aiPlan != null) _buildAiPlanPreview(),
            _buildToggleSetting(
              title: 'Water automation',
              subtitle: 'Trigger at moisture threshold or schedule',
              value: _autoWater,
              busy: _savingToggles.contains('autoWateringEnabled'),
              onChanged: (v) {
                setState(() => _autoWater = v);
                _saveToggle('autoWateringEnabled', v, () => _autoWater = !v);
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
                busy: _savingToggles.contains('autoLightingEnabled'),
                onChanged: (v) {
                  setState(() => _autoLight = v);
                  _saveToggle('autoLightingEnabled', v, () => _autoLight = !v);
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
                busy: _savingToggles.contains('autoFertilizingEnabled'),
                onChanged: (v) {
                  setState(() => _autoFertilizer = v);
                  _saveToggle('autoFertilizingEnabled', v, () => _autoFertilizer = !v);
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
                    child: FilledButton(
                      onPressed: _saveTextConfig,
                      child: const Text('Save'),
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

  // M3 toggle tile: primary when the actuator is on, a tonal surface when off
  Widget _buildActionCard(String title, IconData icon, {required bool isOn, required VoidCallback onToggle}) {
    final cs = Theme.of(context).colorScheme;
    return SizedBox(
      height: 110,
      child: FilledButton(
        onPressed: onToggle,
        style: FilledButton.styleFrom(
          backgroundColor: isOn ? cs.primary : cs.surfaceContainerHigh,
          foregroundColor: isOn ? cs.onPrimary : cs.onSurfaceVariant,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.all(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 28),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(child: Text(title)),
                Text(isOn ? 'ON' : 'OFF', style: const TextStyle(fontSize: 11)),
              ],
            ),
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
    required bool busy,
    required Widget expandedContent,
  }) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(title, style: Theme.of(context).textTheme.titleMedium)),
                Switch(value: value, onChanged: busy ? null : onChanged),
              ],
            ),
            Text(subtitle, style: TextStyle(color: cs.onSurfaceVariant)),
            if (value) ...[
              const SizedBox(height: 14),
              expandedContent,
            ],
          ],
        ),
      ),
    );
  }
}
