# One "hero" soil sensor per zone, unlimited plants

## Intent
The supervisor wants one system to hold many plants, with a single soil moisture probe as the zone's
only moisture reading. Today each plant must take one of 4 "slots", and each slot is its own probe,
so a zone is capped at 4 plants.

## Goals
- Any number of plants per zone, on web and mobile.
- The board reads one soil probe. Every plant in the zone is judged against that one reading
  (health score, status, alerts, threshold watering).
- Slots disappear from the UI: no slot picker, no "Slot N" tags, no "X of 4", no per-slot chart lines.

## Non-goals
- Per-plant moisture, multiple probes, or a multiplexer.
- Migrating or cleaning old fields (`slotNumber`, `latestMoisture1..4`, `totalSlots`, `totalPlantSlots`)
  on existing docs. They stay and are ignored.
- A new plant cap.

## Anti-goals
- Threshold watering or zone status stopping because the moisture value went missing.
- Extra Firestore reads or writes per reading cycle.

## Approaches
1. **Remove slots and use one zone reading (picked).** The firmware sends `soilMoisture`. The bridge
   stores it in the fields that already exist (`zones.latestMoisture`, `statsDaily` `moisture`). All
   slot code goes away. Old history still charts, because `moisture` already held the average.
2. **Keep slots and only lift the cap.** The firmware sends slot 1, and extra plants fall back to the zone
   average. The diff is smaller, but people would still pick slots that mean nothing and see "Slot 1"
   tags. Rejected.
3. **One probe per plant through a multiplexer.** Contradicts the one-sensor requirement. Rejected.

## Design
- **MQTT contract:** `grownex/{id}/sensors` payload becomes `{deviceId, temperature, humidity, lightLevel, soilMoisture}`.
- **Firmware:** one probe on GPIO 34 (the old slot 1 pin), with one `MOISTURE_DRY` / `MOISTURE_WET` calibration pair.
- **Bridge:** `moisture = soilMoisture ?? average(soilMoisture1..4)` (a board not yet reflashed keeps its old zone reading; changed from `soilMoisture1` after review).
  It writes `latestMoisture` and `statsDaily` `moisture` only. It no longer writes `latestMoisture1..4`,
  `soilMoisture1..4` or `totalSlots`.
- **Plants:** no `slotNumber` on create or edit. No cap.
- **Zones:** `totalPlantSlots` is no longer written or copied on device assign. The UI shows the plant count.
- **Health and analytics:** both clients use `moisture` / `latestMoisture`. The moisture chart has one line.
- **AI:** drop `slot` from the plant payload sent to the model.
- **Simulator:** drop `--slots` and publish `soilMoisture`.
- **Tests, seed, docs:** update the web, mobile, server, integration and simulator tests, `seed.js`,
  `CLAUDE.md` (contract table and data model) and the simulator README.

## Left to the builder
- Exact layout of the plant grid once the empty-slot cards are gone (keep the current card component).
- Wording of the device detail page once "Plant slots" is gone.
