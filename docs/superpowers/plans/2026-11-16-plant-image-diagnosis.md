# Plant Image Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visual plant health from ESP32-CAM snapshots (coarse zone check) and phone close-ups (detailed diagnosis), with a repeatable accuracy evaluation.

**Architecture:** One server module (`aiVision.js`) owns both prompts and validators; the REST route, the MQTT bridge and the evaluation script all call it. Results land in Firestore (`plantDiagnoses`, snapshot `visual`, `zones.visual*`, `statsDaily` hours) and both clients render them with live listeners.

**Tech Stack:** Node (Express, firebase-admin, `openai` SDK on OpenRouter, node:test), React, Flutter. One new dev dependency: `sharp` (evaluation only).

**Spec:** `docs/superpowers/specs/2026-11-16-plant-image-diagnosis-design.md`

## Global Constraints

- Conditions: `healthy`, `nutrient_deficiency`, `fungal_disease`, `bacterial_disease`, `viral_disease`, `pest_damage`, `water_stress`, `light_heat_stress`, `unclear`, `not_plant`.
- Severities: `none`, `mild`, `moderate`, `severe`. Zone statuses: `healthy`, `stressed`, `unhealthy`, `unclear`.
- Model output is untrusted: only validator output is stored or returned.
- Images: JPEG only (`FF D8`), at most 1.5 MB. The server never fetches a client-supplied URL.
- Plant close-ups are downscaled to longest side 1280 px, JPEG quality 0.8 (web `downscaleToJpeg`; mobile `image_picker` `maxWidth/maxHeight: 1280, imageQuality: 80`; evaluation `sharp`).
- Zone check: at most 3 Firestore writes per snapshot. It never writes `zones.status` or any `*Active` field.
- Calls run at temperature 0. Model: `OPENROUTER_VISION_MODEL`, default `OPENROUTER_MODEL`.
- Caps: newest 20 diagnoses kept per plant; 30 per user per UTC day; notify at confidence ≥ 0.6 (`VISION_NOTIFY_MIN_CONFIDENCE`).
- Copy: "AI estimate, not a professional diagnosis"; "Diagnosis unavailable right now".
- Web: M3 classes and `components/ui/*`; roles not raw colors. Mobile: `Theme.of(context).colorScheme` / `AppColors`.
- No Claude attribution in commits.

## Review Focus

1. Phone photo that is not a JPEG (PNG screenshot, HEIC): the user gets a clear "use a JPEG photo" message and no orphan file stays in Storage. (Task 4 test.)
2. Model answers with near-miss labels (`"Fungal disease"`, `"fungal"`, `" PEST_DAMAGE "`): normalised to the class, not thrown away as `unclear`. (Task 1 test.)
3. AI call times out or errors after the image is uploaded: the image is deleted, nothing is written, the client leaves its busy state. (Task 4 test; Tasks 6, 7 manual.)
4. Night or blurred snapshot (`unclear`): no notification, `zones.visualStatus` keeps its last value. (Task 5 test.)
5. A plant or zone deleted while it has diagnoses: docs and images go with it; another user's are untouched. (Task 4 account-deletion test; Tasks 6, 7.)

---

### Task 1: Vision module (prompts, validators, image calls)

**Files:**
- Modify: `web_dashboard/server/src/services/aiClient.js`
- Create: `web_dashboard/server/src/services/aiVision.js`
- Test: `web_dashboard/server/test/unit.test.js`

**Interfaces (produces):**
- `chatJsonRaw({ system, user, maxTokens, images?, temperature?, model?, provider? }) → { data, model, provider, usage }`. `images` are data URLs sent as `image_url` parts after the text part. `provider` (a name) becomes OpenRouter `provider: { order: [name], allow_fallbacks: false }`. `chatJson(args)` stays and returns `.data`.
- `aiVision.js`: `VISION_PROMPT_V` (string, start `'1'`), `CONDITIONS`, `SEVERITIES`, `ZONE_STATUSES`, `isJpeg(buf)`, `MAX_IMAGE_BYTES`, `validateDiagnosis(raw)`, `validateZoneCheck(raw)`, `worseZoneStatus(next, prev) → boolean` (order healthy < stressed < unhealthy; `unclear` or missing on either side → false),
  `diagnosePlantImage({ jpeg, context, model, provider }) → { result, meta }`, `checkZoneImage(...)` same shape; `meta = { model, provider, promptV, usage, latencyMs }`. `context` (optional): plant `{ species, preferred: {...}, latest: {...} }`, zone `{ species: [..], latest: {...} }`.

- [ ] **Step 1: failing unit tests**
  - `validateDiagnosis`: `{}` → `condition: 'unclear'`, `severity: 'none'`, `confidence: 0`, empty arrays; `"Fungal disease"`, `"fungal"`, `" PEST_DAMAGE "` → `fungal_disease`, `fungal_disease`, `pest_damage`; unknown label → `unclear`; `healthy` + `severe` → `none`; confidence `7` → `1`, `"0.4"` → `0.4`, `NaN` → `0`; 9 observations → 5; 9 advice → 4; non-string items dropped; strings cut at 200 chars.
  - `validateZoneCheck`: junk → `unclear`; 6 observations → 4.
  - `worseZoneStatus`: `('unhealthy','stressed')` true; `('stressed','stressed')` false; `('stressed', undefined)` false; `('unclear','healthy')` false.
  - `isJpeg`: `FF D8…` true; PNG header false; empty false.
- [ ] **Step 2:** `npm test` in `server/` fails on the new cases.
- [ ] **Step 3:** implement. Prompts follow the spec's four-part order; label normalisation is lowercase, trim, spaces/hyphens → `_`, then exact match, then unique-prefix match (`fungal` → `fungal_disease`).
- [ ] **Step 4:** `npm test` passes.

### Task 2: Evaluation metrics

**Files:**
- Create: `web_dashboard/server/eval/metrics.js`
- Test: `web_dashboard/server/test/unit.test.js`

**Interfaces (produces):** rows are `{ label, predicted, confidence }`.
- `scoreRows(rows, classes, { abstain = ['unclear','not_plant'], minSupport = 20 }) → { n, accuracy, wilson: [lo, hi], macroF1, coverage, answeredAccuracy, perClass: [{ label, support, precision, recall, f1, reported }], confusion }`. An abstain prediction on a labelled row is wrong. `macroF1` averages only `reported` classes. `confusion[label][predicted]` counts.
- `calibration(rows, binWidth = 0.1) → [{ lo, hi, n, accuracy }]` (non-empty bins).
- `cohenKappa(pairs) → { kappa, agreement, matrix }` for `[a, b]` pairs.

- [ ] **Step 1: failing tests** with hand-computed cases: 4 rows (3 right, 1 `unclear`) → accuracy 0.75, coverage 0.75, answeredAccuracy 1; a class with support 3 → `reported: false`; Wilson for 8/10 ≈ `[0.490, 0.943]` (±0.005); kappa of identical lists 1, of `[[a,a],[a,b],[b,a],[b,b]]` 0; calibration puts 0.95 and 1.0 in the top bin.
- [ ] **Step 2:** fails. **Step 3:** implement. **Step 4:** `npm test` passes.

### Task 3: Evaluation scripts and protocol files

**Files:**
- Create: `web_dashboard/server/eval/visionEval.js`, `eval/pullSnapshots.js`, `eval/LABELS.md`, `eval/plantdoc-map.json`, `eval/README.md`
- Modify: `web_dashboard/server/package.json` (devDependency `sharp`), `.gitignore` (`web_dashboard/server/eval/data/`, `web_dashboard/server/eval/out/`)

**Interfaces (consumes):** Task 1 `diagnosePlantImage` / `checkZoneImage`, Task 2 metrics.

- [ ] **Step 1:** `visionEval.js` with the CLI in the spec. `labels.csv` columns `file,label,split[,species]`; rows of the other split are skipped; an unknown label aborts before any call. Plant images pass through `sharp` (`resize 1280 inside, withoutEnlargement`, `jpeg quality 80`); zone images are sent raw. Sequential calls; a failed call is recorded as `predicted: 'error'` and counted wrong. Writes `out/<task>-<split>-<timestamp>/results.json` and `report.md` with every item in the spec's Output list, including returned model/provider, date, `VISION_PROMPT_V` and `git rev-parse --short HEAD`.
- [ ] **Step 2:** `--task agreement [--zone id]`: read `statsDaily` hours carrying `visualStatus` + `sensorStatus`, map sensor `attention` → `stressed`, `critical` → `unhealthy`, skip `unknown`/`unclear`, print matrix, kappa and the disagreeing hours.
- [ ] **Step 3:** `pullSnapshots.js`: download every current snapshot image of every zone to `eval/data/zone/<zoneId>_<bucket>.jpg`, skipping existing files, and append new file names to `eval/data/zone/labels.csv` with an empty label.
- [ ] **Step 4:** `LABELS.md` (class definitions matching the prompt, tie-break rules, split-by-plant rule) and `plantdoc-map.json`; `README.md` with the protocol from the spec and the run order (dev runs, calibration, one test run).
- [ ] **Step 5: verify** `node eval/visionEval.js --task plant --split dev --dir <tmp with 2 jpegs> --labels <csv>` with `OPENROUTER_API_KEY` empty: exits non-zero with "OPENROUTER_API_KEY is not set" and makes no call.

### Task 4: Plant diagnosis endpoint, rules, account cascade

**Files:**
- Modify: `web_dashboard/server/src/routes/ai.js`, `server/src/routes/auth.js`, `web_dashboard/firestore.rules`, `web_dashboard/storage.rules`
- Test: `web_dashboard/server/test/integration.test.js`

**Interfaces (produces):** `POST /api/ai/plant-diagnosis`, body `{ plantId, diagnosisId }` (`diagnosisId` matches `^[A-Za-z0-9]{10,40}$`).
- `200 { source: 'ai', diagnosis }` where `diagnosis` is the stored doc plus `id`.
- `200 { source: 'fallback', reason: 'disabled' | 'error' | 'limit' }`.
- `400 { error }` for a missing, oversized or non-JPEG image ("Use a JPEG photo under 1.5 MB").
- Not the owner: the same status the other AI routes return.
- Doc `plantDiagnoses/{diagnosisId}`: `{ userId, plantId, zoneId, imageUrl, storagePath, createdAt, model, promptV, observations, condition, severity, confidence, likelyCause, advice, summary }`. `imageUrl` uses an admin-set download token as `cameraSnapshots.js` does. Image path `plantDiagnoses/{uid}/{diagnosisId}.jpg`.
- Quota in `users/{uid}.diagnosisQuota: { day, count }`, written with `merge: true`, counted on success only.

- [ ] **Step 1: failing integration tests** (AI key empty in the emulator run):
  - second user's plant → refused, nothing written;
  - own plant, JPEG uploaded → `{ source: 'fallback', reason: 'disabled' }`, no `plantDiagnoses` doc, the image is gone from Storage;
  - own plant, PNG bytes uploaded → 400, image gone;
  - rules: user B cannot read or delete A's `plantDiagnoses` doc, nobody can create one from a client, B cannot read or write `plantDiagnoses/{A}/x.jpg`;
  - account deletion: A's `plantDiagnoses` docs and images are removed, B's stay.
- [ ] **Step 2:** `npm run test:integration` fails on them.
- [ ] **Step 3:** implement the route in the spec's order (owner, quota, read + check image, call, write, prune to 20 with images, bump quota); any failure after the image check deletes the image. Rules as in the spec. `auth.js`: delete by `userId` query, images first.
- [ ] **Step 4:** `npm run test:integration` passes.

### Task 5: Zone check on camera snapshots

**Files:**
- Create: `web_dashboard/server/src/services/zoneVisualCheck.js`
- Modify: `web_dashboard/server/src/services/mqttBridge.js` (`handleCameraImage`)
- Test: `web_dashboard/server/test/unit.test.js`, `test/integration.test.js`

**Interfaces (produces):**
- `applyZoneCheck({ zone, result, minConfidence }) → { snapshotVisual, zoneUpdate | null, statsHour, notification | null }` (pure; `zone` is the zone doc data).
- `checkZoneSnapshot(zoneId, bucketId, jpeg) → Promise<void>`; returns at once when `aiEnabled()` is false; never throws.

- [ ] **Step 1: failing unit tests** for `applyZoneCheck`: `unclear` → `zoneUpdate: null`, `notification: null`; first check (`zone.visualStatus` missing) `unhealthy` 0.9 → update, no notification; `healthy` → `stressed` at 0.7 → notification `{ type: 'threshold', severity: 'warn' }`; same at 0.5 → update, no notification; `stressed` → `healthy` → no notification; `statsHour` always `{ visualStatus, visualConfidence, sensorStatus: zone.status }`.
- [ ] **Step 2:** fails. **Step 3:** implement; `checkZoneSnapshot` reads the zone and its plants (species), calls `checkZoneImage`, then writes snapshot `visual` (merge), the zone fields, and `statsDaily/{UTC day}.hours.{HH}` (merge), then `notify()`. `handleCameraImage` calls it without `await`, with `.catch` logging.
- [ ] **Step 4:** integration: extend the camera JPEG test to assert the snapshot is stored unchanged and no `visual` field appears with AI off. Confirm `flattenDailyStats` (web `lib/analytics.js`, mobile `utils/analytics.dart`) ignores the three new hour fields; add a case to each side's existing flatten test.
- [ ] **Step 5:** `npm test`, `npm run test:integration`, client `npm test`, `flutter test` pass.

### Task 6: Web client

**Files:**
- Create: `web_dashboard/client/src/lib/plantDiagnosis.js`, `client/src/components/PlantDiagnosisCard.jsx`
- Modify: `client/src/lib/photoUpload.js` (export `downscaleToJpeg`), `pages/zones/PlantsTab.jsx`, `pages/zones/OverviewTab.jsx` (`CameraCard`), `pages/ZoneDetailPage.jsx`
- Test: `web_dashboard/client/test/` (existing runner)

**Interfaces (produces):** `conditionLabel(condition) → string`, `conditionTone(condition, severity) → 'healthy' | 'attention' | 'critical' | 'unknown'` (healthy → healthy; unclear/not_plant → unknown; severe → critical; otherwise attention), `runPlantDiagnosis(user, plantId, file) → { diagnosis } | { error }`, `deletePlantDiagnoses(uid, plantId)`, `deleteDiagnosis(diagnosis)`.

- [ ] **Step 1:** failing tests for `conditionLabel` / `conditionTone` (every condition has a label; the tone table above). **Step 2:** fails.
- [ ] **Step 3:** `plantDiagnosis.js`: new doc ID, downscale, upload to `plantDiagnoses/{uid}/{id}.jpg`, POST with the ID token as `aiSummary.js` does; map `fallback` reasons and 400 to messages (`limit`: "Daily diagnosis limit reached").
- [ ] **Step 4:** `PlantDiagnosisCard` per the spec (button "Upload photo", latest result, history newest first with delete, the two fixed copy lines), listening on `plantDiagnoses` where `userId` and `plantId`, sorted in code. Mount it in the plant view in `PlantsTab.jsx`.
- [ ] **Step 5:** `CameraCard`: status label, summary and check time when `zone.visualStatus` exists.
- [ ] **Step 6:** cascades: plant delete in `PlantsTab.jsx` and the per-plant loop in `ZoneDetailPage.jsx` call `deletePlantDiagnoses` before deleting the plant doc.
- [ ] **Step 7:** `npm test` and `npm run build` pass; walk through it in the sandbox (run-grownex skill) including the simulator's `photo`.

### Task 7: Mobile client

**Files:**
- Create: `mobile_app/lib/models/plant_diagnosis_model.dart`, `lib/services/firestore/diagnosis_service.dart`, `lib/utils/plant_diagnosis.dart`, `lib/widgets/plant_diagnosis_card.dart`
- Modify: `lib/services/photo_service.dart`, `lib/services/ai_summary_service.dart` (or a sibling call using its HTTP helper), `screens/plants/plant_detail/plant_detail_screen.dart`, `screens/plants/zone_detail/overview_tab.dart` (`_CameraCard`), `zone_detail_screen.dart`, `services/auth_service.dart`, `models/zone_model.dart`
- Test: `mobile_app/test/logic_test.dart`

**Interfaces:** same names and tone table as Task 6 in Dart (`conditionLabel`, `conditionTone`); `DiagnosisService.watch(uid, plantId)`, `.run(plantId, XFile)`, `.deleteForPlant(uid, plantId)`, `.deleteAllForUser(uid)`.

- [ ] **Step 1:** the same label/tone cases in `logic_test.dart`; fails.
- [ ] **Step 2:** model, service, card ("Take photo": camera or gallery), camera-card status, as Task 6.
- [ ] **Step 3:** cascades: plant delete, zone delete per plant, and the account-deletion fallback in `auth_service.dart`.
- [ ] **Step 4:** `flutter analyze` clean, `flutter test` passes.

### Task 8: Documentation

**Files:** `CLAUDE.md`, `web_dashboard/server/.env.example`, `README.md` (env list)

- [ ] **Step 1:** `CLAUDE.md`: data model (`plantDiagnoses`, snapshot `visual`, `zones.visual*`, the `statsDaily` hour fields, `users.diagnosisQuota`), cascades, AI section (`aiVision.js`, bump `VISION_PROMPT_V` on any prompt change, the evaluation scripts), write budget (18 extra writes per camera zone per day), parity table rows.
- [ ] **Step 2:** `.env.example`: `OPENROUTER_VISION_MODEL`, `VISION_NOTIFY_MIN_CONFIDENCE`.
- [ ] **Step 3:** `graphify update .`
