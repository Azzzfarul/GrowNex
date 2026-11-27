import 'package:flutter/material.dart';

import '../../../models/automation_config_model.dart';
import '../../../models/device_model.dart';
import '../../../models/zone_model.dart';
import '../../../services/ai_summary_service.dart';
import '../../../services/firestore/automation_config_service.dart';
import '../../../services/firestore/device_service.dart';
import '../../../utils/schedules.dart';

const _maxWateringS = 900, _maxFertilizingS = 1800;  // validatePlan's caps (server/src/services/aiAnalytics.js)

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
  final _wateringDurationCtrl    = TextEditingController();
  final _fertilizingDurationCtrl = TextEditingController();
  List<String> _waterSchedule = [], _lightSchedule = [], _fertSchedule = [];
  // Bumped when the lists are replaced from outside (load, Cancel, AI plan), so each
  // _ScheduleList drops a half-done edit that would point at the wrong entry.
  int _formEpoch = 0;
  final _pending = <String>{};  // kinds with a typed time not yet added to their list
  void _setPending(String kind, bool p) => setState(() => p ? _pending.add(kind) : _pending.remove(kind));

  String _savedWaterThreshold = '';
  List<String> _savedWaterSchedule = [];
  String _savedWaterDuration  = '';
  List<String> _savedLightSchedule = [];
  List<String> _savedFertSchedule = [];
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
    _wateringDurationCtrl.dispose();
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
    if (config case final config?) setState(() => _showConfig(config));
  }

  // Puts a saved config into the form and marks it as saved.
  void _showConfig(AutomationConfig config) {
    _autoWater      = config.autoWateringEnabled;
    _autoLight      = config.autoLightingEnabled;
    _autoFertilizer = config.autoFertilizingEnabled;
    _wateringThresholdCtrl.text   = config.wateringThreshold?.toString() ?? '';
    _wateringDurationCtrl.text    = config.wateringDuration?.toString() ?? '';
    _fertilizingDurationCtrl.text = config.fertilizingDuration?.toString() ?? '';
    _waterSchedule = config.wateringSchedule;
    _lightSchedule = config.lightingSchedule;
    _fertSchedule  = config.fertilizingSchedule;
    _markSaved();
    _formEpoch++;
    _pending.clear();
  }

  void _markSaved() {
    _savedWaterThreshold = _wateringThresholdCtrl.text;
    _savedWaterSchedule  = _waterSchedule;
    _savedWaterDuration  = _wateringDurationCtrl.text;
    _savedLightSchedule  = _lightSchedule;
    _savedFertSchedule   = _fertSchedule;
    _savedFertDuration   = _fertilizingDurationCtrl.text;
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
    // Schedule entries are checked as they're added to their list (upsertSchedule).
    // Only check durations the user changed: a hidden field (e.g. fertilizing without a
    // fertilizer module) holding an old value must not block saving the others.
    bool tooLong(TextEditingController c, String saved, int max) {
      final v = c.text.trim(), n = int.tryParse(v);
      return v.isNotEmpty && v != saved.trim() && !(n != null && n > 0 && n <= max);
    }
    // The board stops a pump by itself after 20 / 40 min (firmware safety limit), so runs stay well inside it.
    final error = _pending.isNotEmpty ? 'Add or update the time you typed (or clear it) before saving.'
        : tooLong(_wateringDurationCtrl, _savedWaterDuration, _maxWateringS) ? 'Watering duration must be 1 to $_maxWateringS seconds.'
        : tooLong(_fertilizingDurationCtrl, _savedFertDuration, _maxFertilizingS) ? 'Fertilizing duration must be 1 to $_maxFertilizingS seconds.'
        : null;
    if (error != null) return _snack(error);

    try {
      await _configService.saveFields(widget.zone.id, {
        'wateringThreshold':   num.tryParse(_wateringThresholdCtrl.text.trim()),
        'wateringSchedule':    _waterSchedule,
        'wateringDuration':    int.tryParse(_wateringDurationCtrl.text.trim()),
        'lightingSchedule':    _lightSchedule,
        'fertilizingSchedule': _fertSchedule,
        'fertilizingDuration': int.tryParse(_fertilizingDurationCtrl.text.trim()),
      });
    } catch (e) {
      debugPrint('Failed to save: $e');
      if (mounted) _snack('Failed to save. Please try again.');
      return;
    }
    if (mounted) setState(_markSaved);
  }

  void _cancelTextConfig() {
    setState(() {
      _wateringThresholdCtrl.text   = _savedWaterThreshold;
      _waterSchedule                = _savedWaterSchedule;
      _wateringDurationCtrl.text    = _savedWaterDuration;
      _lightSchedule                = _savedLightSchedule;
      _fertSchedule                 = _savedFertSchedule;
      _fertilizingDurationCtrl.text = _savedFertDuration;
      _formEpoch++;
      _pending.clear();
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
    // The plan suggests one time per actuator; it replaces the lists.
    List<String> asList(dynamic v) => scheduleList(v is String ? v.trim() : v);

    final config = AutomationConfig(
      autoWateringEnabled:    plan['autoWateringEnabled'] == true,
      wateringThreshold:      asNum(plan['wateringThreshold']),
      wateringSchedule:       asList(plan['wateringSchedule']),
      wateringDuration:       asInt(plan['wateringDuration']),
      autoLightingEnabled:    plan['autoLightingEnabled'] == true,
      lightingSchedule:       asList(plan['lightingSchedule']),
      autoFertilizingEnabled: plan['autoFertilizingEnabled'] == true,
      fertilizingSchedule:    asList(plan['fertilizingSchedule']),
      fertilizingDuration:    asInt(plan['fertilizingDuration']),
      aiRecommended:          true,
    );
    await _configService.saveConfig(widget.zone.id, config);
    if (!mounted) return;
    setState(() {
      _showConfig(config);
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
      ['Watering times',           s(_waterSchedule.join(', ')),            s(plan['wateringSchedule'])],
      ['Watering duration (s)',    s(_wateringDurationCtrl.text),            s(plan['wateringDuration'])],
      ['Auto lighting',            _autoLight ? 'On' : 'Off',                plan['autoLightingEnabled'] == true ? 'On' : 'Off'],
      ['Lighting schedule',        s(_lightSchedule.join(', ')),            s(plan['lightingSchedule'])],
      ['Auto fertilizing',         _autoFertilizer ? 'On' : 'Off',           plan['autoFertilizingEnabled'] == true ? 'On' : 'Off'],
      ['Fertilizing schedule',     s(_fertSchedule.join(', ')),             s(plan['fertilizingSchedule'])],
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

    bool changed(List<String> a, List<String> b) => a.join('\n') != b.join('\n');
    final isDirty = _wateringThresholdCtrl.text != _savedWaterThreshold ||
        changed(_waterSchedule, _savedWaterSchedule) ||
        _wateringDurationCtrl.text    != _savedWaterDuration  ||
        changed(_lightSchedule, _savedLightSchedule) ||
        changed(_fertSchedule, _savedFertSchedule)   ||
        _fertilizingDurationCtrl.text != _savedFertDuration ||
        _pending.isNotEmpty;

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
        // An offline device can't take a toggle now; it would fire whenever the device reconnects, maybe hours later.
        final offline    = device?.status == 'offline';
        final deviceId   = widget.zone.deviceId!;
        final svc        = DeviceService();

        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text('Manual controls', style: tt.titleMedium),
            if (offline) ...[
              const SizedBox(height: 4),
              Text('Device offline. Everything is off until it reconnects, then these settings resume.',
                style: tt.bodySmall?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant)),
            ],
            const SizedBox(height: 12),
            if (hasFert)
              Row(
                children: [
                  Expanded(child: _buildActionCard('Water', Icons.water_drop,
                    isOn: isWaterOn,
                    onToggle: offline ? null : () => svc.updateIrrigationState(deviceId, !isWaterOn))),
                  const SizedBox(width: 12),
                  Expanded(child: _buildActionCard('Fertilize', Icons.grass,
                    isOn: isFertOn,
                    onToggle: offline ? null : () => svc.updateFertilizerState(deviceId, !isFertOn))),
                ],
              )
            else
              _buildActionCard('Water', Icons.water_drop,
                isOn: isWaterOn,
                onToggle: offline ? null : () => svc.updateIrrigationState(deviceId, !isWaterOn)),
            if (hasLight) ...[
              const SizedBox(height: 12),
              _buildActionCard('Light', Icons.sunny,
                isOn: isLightOn,
                onToggle: offline ? null : () => svc.updateLightState(deviceId, !isLightOn)),
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
              subtitle: 'Trigger at moisture threshold or set daily times',
              value: _autoWater,
              busy: _savingToggles.contains('autoWateringEnabled'),
              onChanged: (v) {
                setState(() { _autoWater = v; if (!v) _pending.remove('water'); });
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
                    controller: _wateringDurationCtrl,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Watering duration (seconds, e.g. 300)',
                      border: OutlineInputBorder(),
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 12),
                  _ScheduleList(
                    key: ValueKey('water$_formEpoch'),
                    kind: 'water', onPending: _setPending, label: 'Daily time (e.g. 07:00)',
                    list: _waterSchedule,
                    onChanged: (l) => setState(() => _waterSchedule = l),
                  ),
                ],
              ),
            ),
            if (hasLight) ...[
              const SizedBox(height: 12),
              _buildToggleSetting(
                title: 'Light automation',
                subtitle: 'One or more daily light windows',
                value: _autoLight,
                busy: _savingToggles.contains('autoLightingEnabled'),
                onChanged: (v) {
                  setState(() { _autoLight = v; if (!v) _pending.remove('light'); });
                  _saveToggle('autoLightingEnabled', v, () => _autoLight = !v);
                },
                expandedContent: _ScheduleList(
                  key: ValueKey('light$_formEpoch'),
                  kind: 'light', onPending: _setPending, label: 'Light window', hint: '08:00–18:00',
                  list: _lightSchedule,
                  onChanged: (l) => setState(() => _lightSchedule = l),
                ),
              ),
            ],
            if (hasFert) ...[
              const SizedBox(height: 12),
              _buildToggleSetting(
                title: 'Fertilizer automation',
                subtitle: 'One or more weekly times',
                value: _autoFertilizer,
                busy: _savingToggles.contains('autoFertilizingEnabled'),
                onChanged: (v) {
                  setState(() { _autoFertilizer = v; if (!v) _pending.remove('fert'); });
                  _saveToggle('autoFertilizingEnabled', v, () => _autoFertilizer = !v);
                },
                expandedContent: Column(
                  children: [
                    TextField(
                      controller: _fertilizingDurationCtrl,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Fertilizing duration (seconds, e.g. 600)',
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 12),
                    _ScheduleList(
                      key: ValueKey('fert$_formEpoch'),
                      kind: 'fert', onPending: _setPending, label: 'Weekly time', hint: 'MON 06:00',
                      list: _fertSchedule,
                      onChanged: (l) => setState(() => _fertSchedule = l),
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
  Widget _buildActionCard(String title, IconData icon, {required bool isOn, required VoidCallback? onToggle}) {
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

// Times are added to (or edited in) the list below the field; Save at the bottom stores the list.
class _ScheduleList extends StatefulWidget {
  final String kind, label;
  final String? hint;  // example value, shown in the empty field
  final List<String> list;
  final ValueChanged<List<String>> onChanged;
  final void Function(String kind, bool pending) onPending;  // a typed time not yet added, so Save can't drop it

  const _ScheduleList({super.key, required this.kind, required this.label, this.hint, required this.list, required this.onChanged, required this.onPending});

  @override
  State<_ScheduleList> createState() => _ScheduleListState();
}

class _ScheduleListState extends State<_ScheduleList> {
  final _ctrl = TextEditingController();
  int _editing = -1;  // index of the entry in the field, or -1 when adding
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _submit() {
    final r = upsertSchedule(widget.list, widget.kind, _ctrl.text, _editing);
    if (r.error != null) return setState(() => _error = r.error);
    widget.onChanged(r.list!);
    _reset();
  }

  void _reset() {
    setState(() {
      _ctrl.clear();
      _editing = -1;
      _error = null;
    });
    widget.onPending(widget.kind, false);
  }

  void _edit(int i) {
    setState(() {
      _ctrl.text = widget.list[i];
      _editing = i;
      _error = null;
    });
    widget.onPending(widget.kind, true);
  }

  void _remove(int i) {
    widget.onChanged([...widget.list]..removeAt(i));
    if (_editing == i) {
      _reset();
    } else if (_editing > i) {
      setState(() => _editing--);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final editing = _editing >= 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: TextField(
                controller: _ctrl,
                decoration: InputDecoration(
                  labelText: editing ? 'Edit ${widget.list[_editing]}' : widget.label,
                  hintText: widget.hint,
                  border: const OutlineInputBorder(),
                  errorText: _error,
                  errorMaxLines: 2,
                ),
                textInputAction: TextInputAction.done,
                onChanged: (v) {
                  setState(() => _error = null);
                  widget.onPending(widget.kind, v.trim().isNotEmpty);
                },
                onSubmitted: (_) => _submit(),
              ),
            ),
            const SizedBox(width: 8),
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: FilledButton.tonalIcon(
                onPressed: _ctrl.text.trim().isEmpty ? null : _submit,
                icon: Icon(editing ? Icons.check : Icons.add),
                label: Text(editing ? 'Update' : 'Add'),
              ),
            ),
            if (editing)
              IconButton(onPressed: _reset, tooltip: 'Cancel edit', icon: const Icon(Icons.close)),
          ],
        ),
        const SizedBox(height: 8),
        if (widget.list.isEmpty)
          Text('No times yet.', style: TextStyle(color: cs.onSurfaceVariant))
        else
          Material(
            color: cs.surfaceContainer,
            borderRadius: BorderRadius.circular(12),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < widget.list.length; i++)
                  ListTile(
                    dense: true,
                    selected: _editing == i,
                    selectedTileColor: cs.secondaryContainer,
                    leading: const Icon(Icons.schedule, size: 20),
                    title: Text(widget.list[i], style: Theme.of(context).textTheme.bodyLarge),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(onPressed: () => _edit(i), tooltip: 'Edit ${widget.list[i]}', icon: const Icon(Icons.edit_outlined)),
                        IconButton(onPressed: () => _remove(i), tooltip: 'Delete ${widget.list[i]}', icon: const Icon(Icons.delete_outline)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
