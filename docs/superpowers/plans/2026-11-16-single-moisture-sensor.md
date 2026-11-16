# One Hero Soil Sensor, Unlimited Plants: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 4 per-plant soil "slots" with one zone soil reading, and drop the 4-plant cap on every platform.

**Architecture:** The board sends one `soilMoisture` value. The bridge stores it in the fields that already exist
(`zones.latestMoisture`, `statsDaily.hours.HH.moisture`). Both clients judge every plant against that one
reading and stop reading or writing anything slot-shaped.

**Tech Stack:** Arduino C++ (PlatformIO), Node (mqtt.js, firebase-admin, node:test), React + Recharts, Flutter + fl_chart.

**Spec:** `docs/superpowers/specs/2026-11-16-single-moisture-sensor-design.md`

## Global Constraints
- MQTT sensor payload: `{deviceId, temperature, humidity, lightLevel, soilMoisture}`.
- Bridge: `moisture = soilMoisture ?? average(soilMoisture1..4) ?? null` (was `soilMoisture1`; changed after review). Never write `latestMoisture1..4`, `soilMoisture1..4` or `totalSlots`.
- Clients: never write `slotNumber` or `totalPlantSlots`. No plant cap anywhere.
- Firestore cost per reading cycle is unchanged (3 writes, 2 reads).
- Web and mobile logic must keep passing the same test cases (the two ports must agree).
- No commits unless the user asks (user rule). Work on the current tree.

## Review Focus
1. An un-reflashed board sends `soilMoisture1..4`: the bridge must still set the zone's moisture (Task 2 test).
2. Old zone docs still carry `latestMoisture1`: plant health must use `latestMoisture`, not the stale slot field (Task 3 and 4 tests).
3. Old `statsDaily` hours carry both `moisture` and `soilMoisture1..4`: the moisture series is `moisture` only, with no double counting (Task 3 and 4 tests).
4. A zone with 0 plants must still offer "Add plant" (Task 3 and 4 sandbox check).
5. A zone with more than 4 plants: Add stays enabled, and every plant renders (Task 5 sandbox check).

---

### Task 1: Device contract (firmware + simulator)

**Files:**
- Modify: `firmware/src/main.cpp` (pins/calibration ~L39-46, `publishSensors` ~L207-217)
- Modify: `device_simulator/simulator.js` (help, `--slots` option + validation, `sim.moisture`, reading, log, dry/wet, status print)
- Modify: `device_simulator/README.md` (drop the `--slots` row and example)
- Test: `device_simulator/test/contract.test.js`

**Interfaces:** Produces the payload in Global Constraints.

- [ ] Test: in `readings have the firmware payload shape`, expect keys `['deviceId','humidity','lightLevel','soilMoisture','temperature']`, each value a number. Drop `--slots 2` from `runSim`.
- [ ] Run `npm test` in `device_simulator/`. Expected: FAIL on the keys.
- [ ] Simulator: `sim.moisture` becomes one number (start 55). Publish `soilMoisture`. Delete `--slots`.
- [ ] Firmware: `MOISTURE_PIN 34`, `MOISTURE_DRY 2800`, `MOISTURE_WET 1200`, and one `doc["soilMoisture"]`. Keep GPIO 32/33/36 unused.
- [ ] Run `npm test` (PASS) and `pio run` in `firmware/` (SUCCESS).

### Task 2: Server (bridge, AI prompt, seed, sandbox)

**Files:**
- Modify: `web_dashboard/server/src/services/mqttBridge.js` (`getOrCreateDevice` totalSlots, `handleSensors`)
- Modify: `web_dashboard/server/src/services/aiAnalytics.js` (drop `slot` from the plant payload)
- Modify: `web_dashboard/server/seed.js` (one moisture series, no slot/totalSlots/totalPlantSlots/latestMoistureN)
- Modify: `web_dashboard/server/test/sandbox.js` (`soilMoisture`)
- Test: `web_dashboard/server/test/integration.test.js`

**Interfaces:** Consumes the Task 1 payload. Produces zone `latestMoisture` and stats `moisture` only.

- [ ] Test: change sensor payloads to `soilMoisture` (60/64 pairs → `soilMoisture: 62`, 40/40 → `40`). Drop `slotNumber` and `totalPlantSlots` from the fixtures. Assert `zone.latestMoisture1 === undefined` and `cam.totalSlots === undefined`. Replace the "soil probe stops reporting" tail with a legacy payload `{soilMoisture1: 60, soilMoisture2: 10}` → `stats.moisture === 60` and `latestMoisture === 60`.
- [ ] Run `npm run test:integration`. Expected: FAIL.
- [ ] Implement the bridge per Global Constraints.
- [ ] Run `npm test` and `npm run test:integration`. Expected: PASS.

### Task 3: Web client

**Files:**
- Modify: `src/lib/analytics.js`: `buildChartData` drops `sm1..4`. `moistureBucketSeries(chartData) → chartData.map(d => d.moisture)`. Delete `getMoistureLines`. `healthScoreForPlant` uses `zone.latestMoisture`.
- Modify: `src/lib/plantHealth.js`: the moisture metric reads `field: 'moisture'`, `latest: zone.latestMoisture`, with no fallback.
- Modify: `src/pages/AnalyticsPage.jsx`: a single `<Line dataKey="moisture" stroke="var(--chart-1)">` and no legend. Drop `slotNumber` from the AI plant payload.
- Modify: `src/pages/zones/PlantsTab.jsx`: delete `MAX_PLANTS`, `SlotPicker`, slot validation, `slotNumber` write, slot tags, `bySlot`/`unslotted`/`isFull`. The grid shows all plants plus one dashed "Add a plant" card. The header reads "N plant(s)".
- Modify: `src/pages/zones/OverviewTab.jsx`, `src/components/AddZoneDialog.jsx`, `src/pages/ZoneDetailPage.jsx`, `src/pages/DeviceDetailPage.jsx`: no `totalPlantSlots`/`totalSlots`. Show the plant count ("Plants" fact on the device page when assigned). The zone subtitle shows the type only.
- Test: `test/lib.test.js`

- [ ] Test: replace the slot cases with these:
  - `moistureBucketSeries([{ moisture: 40, soilMoisture1: 50 }, { moisture: null }])` → `[40, null]`.
  - `plantStatus({ latestMoisture: 50, latestTemp: 25 }, p)` → healthy, 90 → needs attention, 90 + 40 °C → critical.
  - `plantHealth(basil, { latestMoisture: 50, latestMoisture1: 90, latestTemp: 25 }, [{ moisture: 50, soilMoisture1: 90, temperature: 25 }]).score` → `100` (stale slot fields ignored).
  - The dry case uses `latestMoisture: 20` and `{ moisture: 20 }` → score 33.
  - Drop `slotNumber` from fixtures.
- [ ] Run `npm test`. Expected: FAIL.
- [ ] Implement, then run `npm test` (PASS) and `npm run build` (no errors).

### Task 4: Mobile app

**Files:**
- Modify: `lib/models/{plant,zone,device,sensor_reading}_model.dart`: remove `slotNumber`, `totalPlantSlots`, `latestMoisture1..4`, `totalSlots`, `soilMoisture1..4`, `moistureForSlot`.
- Modify: `lib/utils/analytics.dart` (`healthScoreForPlant` → `zone.latestMoisture`; `moistureBucketSeries` → `groupByTime(readings, timeRange, (r) => r.moisture)`) and `lib/utils/plant_health.dart` (`sel: (r) => r.moisture`, `latest: zone.latestMoisture`, delete `_zoneSlotMoisture`).
- Modify: `lib/screens/analytics/analytics_screen.dart`: delete `_getMoistureLines` and `_buildMoistureChart`, and use `_buildSingleChart(groupByTime(..., (r) => r.moisture), series[0])`. Drop `slotNumber` from the AI payload.
- Modify: `lib/screens/plants/add_plant_screen.dart`: delete `takenSlots`, `_maxSlots`, the slot picker, the full message and the slot check.
- Modify: `lib/screens/plants/zone_detail/plants_tab.dart` (no cap; the card uses `zone.latestMoisture`; no Slot chip), `overview_tab.dart` ("Plants: N"; no `totalPlantSlots` on assign), `plant_detail_screen.dart` ("Zone reading"), `device_detail_screen.dart` ("Plants: N"), `add_zone_screen.dart`, `services/firestore/zone_service.dart` (drop the `totalPlantSlots` param/field), and the `device_service.dart` comment.
- Test: `test/logic_test.dart`, `integration_test/app_test.dart` (no "Slot 1" tap; seed `soilMoisture`)

- [ ] Test: mirror the Task 3 cases in `logic_test.dart`. The helpers lose `s1/s2/m1/slot`, and zone/readings use `m:`/`moisture:`. The models no longer parse slot fields, so stale data can't reach the logic. Add a `SensorReading.fromMap` case where `{'moisture': 40, 'soilMoisture1': 50}` gives `moisture == 40`. Drop the per-slot bucket test, and keep an alignment test on `temperature`/`moisture`.
- [ ] Run `flutter test`. Expected: FAIL (compile errors).
- [ ] Implement, then run `flutter analyze` (no issues) and `flutter test` (PASS).

### Task 5: Docs and end-to-end check

**Files:**
- Modify: `CLAUDE.md` (MQTT table, firmware paragraph, data model: zones/statsDaily/plants/devices, integrity bullet on `totalPlantSlots`, Firestore budget unchanged)
- Run: `graphify update .`

- [ ] Update the docs.
- [ ] Run the sandbox (run-grownex skill), make a zone with 6 plants on the web, and confirm the Add card stays, the moisture chart has one line, and plant cards show the zone moisture.
- [ ] Run `graphify update .`.
