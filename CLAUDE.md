# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

GrowNex is an IoT plant monitoring and automation system. The monorepo has three independent subprojects that share one Firebase project (Auth + Firestore + Storage):

- `firmware/` — ESP32 node (Arduino C++, PlatformIO). Publishes sensor readings and executes relay commands (irrigation, fertilizer, light) over MQTT (HiveMQ, TLS 8883).
- `firmware_cam/` — separate PlatformIO project for an AI-Thinker ESP32-CAM (flashed via the ESP32-CAM-MB board). Publishes one JPEG per 4-hour UTC bucket over the same broker for the zone's camera feed.
- `device_simulator/` — Node stand-in for both boards (no hardware needed): same MQTT contract, credentials from `firmware/include/secrets.h`; `npm start`, then type `dry`/`hot`/`photo`/`offline` to trigger features, and `forget` before deleting its devices (clears retained messages). `npm test` checks its MQTT contract against an in-process broker.
- `web_dashboard/server/` — Express API **plus the MQTT bridge** and the nightly notification/cleanup job (Firebase Admin, mqtt.js, node-cron, `openai` SDK pointed at OpenRouter).
- `web_dashboard/client/` — React 18 + Vite + Tailwind + Recharts dashboard.
- `mobile_app/` — Flutter app (Dart ≥ 3.12, fl_chart, firebase_storage, image_picker) with the same features as the web dashboard.

There is no root tooling; run commands inside each subproject. Env setup (Firebase web config, service account, HiveMQ, OpenRouter) is in `README.md` and the `.env.example` files.

## Commands

```bash
# web_dashboard/server   (needs server/.env)
npm run dev                            # node --watch → :5000, health check GET /api/health  (npm start = no watch)
node seed.js <FIREBASE_UID>            # demo zone/plants/7 days of statsDaily + claimable device GRX-DEMO-HUB02
node seed.js <FIREBASE_UID> --clean    # remove the demo data

# web_dashboard/client   (needs client/.env)
npm run dev                            # :3000
npm run build                          # → dist/

# web_dashboard   (Docker alternative to the two above; same .env files, same live side effects)
docker compose up -d --build           # client built with client/.env, served by nginx on :3000 (proxies /api); server on :5000

# mobile_app
flutter pub get
flutter run --dart-define=API_BASE_URL=http://<host-ip>:5000   # default 10.0.2.2:5000 (Android emulator → host); only AI calls and account deletion use it
flutter analyze
flutter test                                                  # logic tests (test/logic_test.dart; same cases as web client/test)
flutter test integration_test --dart-define=USE_FIREBASE_EMULATORS=true   # on-device walkthrough; needs the sandbox in web_dashboard/README.md

# firmware, firmware_cam   (if pio isn't on PATH, the VS Code extension installs it at ~/.platformio/penv/bin/pio)
pio run                                # build
pio run -t upload                      # flash
pio device monitor                     # serial @ 115200
```

- Tests: `npm test` in `client/` and `server/` (node:test, pure logic); `npm run test:integration` in `server/` runs the real server against the Firebase emulators (`demo-grownex`, needs Java) and an in-process MQTT broker — the safe way to exercise the bridge. `npm test` in `device_simulator/` too. To click around the apps safely, use the local sandbox in `web_dashboard/README.md` (emulators + `server/test/sandbox.js`, a local broker with a fake sensor node). No JS lint setup (mobile has `flutter analyze`); the firmware has no tests.
- **Starting the server has real side effects:** it attaches listeners and cron jobs to the live Firestore project and can publish actuator commands to physical hardware. Run only one instance per broker/project — the MQTT client ID is fixed (`grownex-bridge`), so two instances keep kicking each other off and both fire the same schedules (and send duplicate notifications). Run `seed.js` with the server stopped for a guaranteed no-op on the bridge side.

## Architecture

### Firestore is the integration point

Both clients read and write Firestore directly with the Firebase client SDK (live listeners). Neither talks to devices, and they barely use the REST API. `server/src/services/mqttBridge.js` is the only MQTT speaker: it mirrors device traffic into Firestore and turns Firestore changes into device commands.

```
ESP32 ──MQTT──▶ mqttBridge ──writes──▶ Firestore ◀──SDK read/write── web client, mobile app
ESP32 ◀──MQTT── mqttBridge ◀─onSnapshot─ Firestore (devices.*Active, automationConfig, plants)
```

REST endpoints actually called by clients: `POST /api/auth/register` (web only — mobile writes `users/{uid}` directly), `DELETE /api/auth/me` (both — it removes every zone subcollection, notifications and Storage photos; mobile falls back to the same cleanup in `auth_service.dart` when the server is unreachable, so keep the two in step) and `/api/ai/*` (both). `/api/zones|plants|devices` exist but nothing calls them. Every route except `/api/health` requires a Firebase ID token (`middleware/verifyToken.js`); zone/device-scoped routes also check `userId` ownership.

### MQTT contract (firmware ↔ bridge)

Device ID = `ESP32-` + uppercase MAC hex (`ESP32CAM-` for camera nodes; the bridge uses that prefix to create them with `deviceType: 'camera'`). It doubles as the `devices/{id}` doc ID that users enter to claim a device.

| Topic | Direction | Payload |
|---|---|---|
| `grownex/{id}/sensors` | device → bridge, every 5 min (`PUBLISH_INTERVAL_MS`; simulator `--interval`) | `{deviceId, temperature, humidity, lightLevel, soilMoisture1..4}` |
| `grownex/{id}/status` | device → bridge, retained + LWT | `"online"` / `"offline"` |
| `grownex/{id}/actuators/state` | device → bridge, retained | `{deviceId, lightState, fertilizerState, irrigationState}`, plus `irrigationTimedOut` / `fertilizerTimedOut: true` while that pump is latched off at its safety limit |
| `grownex/{id}/actuators/command` | bridge → device, retained | `{irrigationState, fertilizerState, lightState}` |
| `grownex/{id}/camera` | camera → bridge, not retained | raw JPEG bytes (not JSON; ≤ 1.5 MB, must start `FF D8`) |

Camera nodes also publish `status` (same retained/LWT contract). The camera firmware streams the JPEG with PubSubClient `beginPublish`/`write`/`endPublish`, so its 64 KB buffer limit doesn't apply. `services/cameraSnapshots.js` stores the image exactly like a manual camera-feed upload (same Storage path + `snapshots` doc, plus `source: 'camera'`, `deviceId`), using an admin-set download token for `imageUrl`.

The firmware reads four capacitive soil probes (v1.2) into `soilMoisture1..4`, each with its own dry/wet calibration; `lightLevel` is an LDR module's 0–100 % brightness (not lux), and `temperature`/`humidity` are `null` when the DHT11 read fails (`computeZoneStatus` then keeps a worse previous status instead of improving on the incomplete reading, and its summary names the missing reading). Relay polarity is `RELAY_ON` (HIGH, matching the module's H trigger jumper); the 4-channel relay's IN4 (`PIN_SPARE`) has no actuator yet and is held off, and the analog calibration constants are at the top of `firmware/src/main.cpp`. Whenever WiFi or MQTT is down the firmware switches every relay off (`failSafe`), retries every 10 s without blocking and restarts after 10 min offline (`firmware_cam` reconnects the same way, and starts NTP once connected); reconnecting re-delivers the retained command, which restores the intended state. Each pump also has a hard limit (`Pump`: irrigation 20 min, fertilizer 40 min, above the longest runs `validatePlan` allows), counted from its "on" command including time offline: past it the pump goes off and ignores "on" until an "off" arrives. The latch and the time run so far (saved up to a minute ahead, so a reboot can only stop it early) are kept in flash (`Preferences`), so a reboot with a stale retained "on" can neither restart the pump nor restart its countdown. The bridge then turns that intent off and warns the user (`handleActuatorState`). Both clients reject durations above `validatePlan`'s caps, so a configured run never reaches the limit. The device simulator mirrors all of this (`--pump-limit` shortens the limit). WiFi/MQTT credentials (SSID, password, broker host, MQTT user/pass) live in each project's gitignored `include/secrets.h`; copy `include/secrets.example.h` to create it. The `src/*.bak` files are old versions and aren't compiled.

### Firestore data model

Use `mqttBridge.js` and `server/seed.js` as the schema reference — `mobile_app/docs/data_design.md` is an outdated early sketch.

- `zones/{zoneId}` — owned via `userId`; linked sensor/relay node in `deviceId`, linked camera node in `cameraDeviceId`. The bridge maintains denormalized `latestTemp|Humid|Light|Moisture`, `latestMoisture1..4`, `latestTimestamp`, `deviceOnline`, and `status` (`healthy|attention|critical|unknown`) + `alertSummary`, computed against the zone's plants' averaged preferred ranges (these only update while the bridge runs). Subcollections:
  - `statsDaily/{YYYY-MM-DD}` (UTC) — the only sensor history: `hours.{HH}` holds that hour's latest value of each metric plus `timestamp` (deep-merged; a null temperature/humidity is left out, so a failed DHT11 read doesn't blank the hour). One doc per day so 7 days of charts cost 8 reads, not 168; **analytics and plant-health scoring on both clients read it** through `lib/zoneStats.js` `fetchZoneStats` / `ZoneService.getStats`, which flatten it (`flattenDailyStats`) into the hourly readings `buildChartData`, `plantHealth` etc. take. Pruned after 30 days by the nightly job. There are no raw per-reading docs; the legacy `sensorReadings/` and hourly `stats/` collections are only still named in the delete cascades.
  - Firestore free tier (Spark: 50k reads, 20k writes, 20k deletes per day) is the budget: at the 5-min cadence each reading cycle costs the bridge 3 writes (`statsDaily`, zone, and the device's `lastSync`, which is refreshed when > 4 min old, so every reading at this cadence) and 2 reads (the device doc, once for the sensor message and once for the actuator-state message the firmware sends alongside it; that one writes only when the state changed). The automation config comes from `watchAutomationConfig`'s `automationConfigs` cache, with a direct read only before it loads or after its listener fails. That's ~860 writes per device per day, so ~23 always-on devices per 20k. Keep it that way, and keep client history reads on daily docs.
  - `aiCache/{today|7days}` — AI analytics summary cache (input hash + TTL).
  - `snapshots/{YYYY-MM-DDTHH}` — "camera feed" photos, one per 4-hour UTC bucket (later uploads overwrite the bucket). `{imageUrl, storagePath, capturedAt}`; the nightly job deletes docs + Storage objects older than 48 h.
- `zones.zonePhotoUrl` / `plants.photoUrl` — download URLs for Storage objects at `zonePhotos/{zoneId}.jpg` / `plantPhotos/{plantId}.jpg`. Uploads go straight from the client to Storage (web `lib/photoUpload.js`, which downscales to a 1280px JPEG first; mobile `services/photo_service.dart`). Mobile's add-plant/add-zone screens pre-allocate the doc ID (`newPlantRef` / `newZoneRef` + `create*WithId`) so the photo can be uploaded under that ID.
- `plants/{plantId}` — top-level, linked by `zoneId`. `slotNumber` 1–4 maps to `soilMoistureN` / `latestMoistureN`. Ranges: `preferred{Moisture,Humidity,Temperature}{Min,Max}` and `preferredLightCondition` (`low|medium|high`).
- `devices/{deviceId}` — auto-created by the bridge on a device's first MQTT message; empty/missing `userId` means unclaimed. Claiming sets `userId` (both clients' Add Device screens list online devices with `userId == ''` for one-click claiming, plus a type-the-ID fallback, and claim in a transaction); `assignedZoneId` links to a zone. `deviceType` is `indoor`/`outdoor` for sensor nodes or `camera`. Both a zone's sensor node and its camera have that zone as `assignedZoneId`, so to find a zone's relay node, read `zones.deviceId` instead of querying `assignedZoneId` (`triggerActuator` does this). Device-assign dropdowns filter by `deviceType` (cameras only in the Camera card), on both clients.
- `automationConfig/{zoneId}` — one per zone, keyed by zone ID.
- `aiPlantProfiles/{slug}` — global per species + zone type, shared by all users.
- `notifications/{id}` — top-level, append-only, written only by the server's `services/notifications.js` `notify()`: `{userId, zoneId, zoneName, type: threshold|actuator|daily, severity: info|warn|critical, title, message, isRead, createdAt, expiresAt}`. Clients query newest 50 by `userId` + `orderBy createdAt` (needs a composite index) and set `isRead` themselves.
- `users/{uid}` — `notificationPrefs: {threshold, actuator, daily}` opts out of each type (missing = enabled); `notify()` checks it before writing. `fcmTokens` (array) holds the user's phones' FCM tokens, kept by mobile `services/push_service.dart`: added on every sign-in (incl. a restored session) and token refresh, removed + `deleteToken()` on logout (before `signOut`; if `deleteToken()` fails, the next sign-in retries it before registering, via a `shared_preferences` flag). Write this doc with `merge: true` everywhere, or the tokens get wiped.

Nothing enforces cross-document integrity server-side; client code maintains it:
- `zones.deviceId` ⇄ `devices.assignedZoneId` must change together, and assigning copies `hasLight` / `hasFertilizer` / `totalPlantSlots` from the device onto the zone. Same for `zones.cameraDeviceId` ⇄ the camera's `assignedZoneId` (nothing copied). Camera `status` is not mirrored to `zones.deviceOnline`.
- Cascading deletes are hand-written in web `pages/ZoneDetailPage.jsx`, mobile `zone_detail_screen.dart`, and `server/src/routes/auth.js` (account deletion, used by both clients). Firestore doesn't delete subcollections for you, so update every cascade when adding a collection. Account deletion covers every subcollection, notifications and Storage photos. The client-side zone deletes can't list subcollections, so they delete a named list (`ZONE_SUBCOLLECTIONS` in `ZoneDetailPage.jsx`, `ZoneService.zoneSubcollections` in mobile, which the mobile account-deletion fallback also uses): add any new subcollection there.

### Actuators and automation (`mqttBridge.js`)

- **Intent vs. confirmed:** `devices.{irrigation,fertilizer,light}Active` are intent — written by clients for manual toggles and by the bridge for schedules/thresholds. `*Confirmed` fields are device-reported and written only by `handleActuatorState`. Never write `*Active` from device-state handling; that creates a publish feedback loop. (One exception: a pump the device reports as timed out is switched off through `triggerActuator`, which syncs the cache, and only once, since it then needs `*Active` to still be on.) All publishes go through `publishCommand`, which syncs `actuatorCache` first so the Firestore echo doesn't re-publish. Manual toggles are debounced 600 ms. On startup and every broker reconnect, `reconcileCommands` compares the broker's retained commands with the stored intent and re-sends the intent where they differ, so changes made while the bridge was down still reach the devices.
- **Schedules:** `watchAutomationConfig` turns each config doc into node-cron jobs (server local time). The string formats are a contract shared by both client UIs, `validatePlan` in `services/aiAnalytics.js`, and the bridge's parsers: `wateringSchedule` `"07:00"` (daily), `lightingSchedule` `"08:00–18:00"` (en dash; hyphen accepted), `fertilizingSchedule` `"MON 06:00"` (weekly); `wateringDuration` / `fertilizingDuration` are seconds (defaults 300 / 600).
- **Threshold watering:** irrigation fires when the average soil moisture drops below `wateringThreshold`, with a 30-minute per-device cooldown (also kept in `devices.lastAutoWateringAt`, so a restart doesn't water the same dry soil again).
- **Notifications** (`notify()` calls in the bridge): `threshold` when a zone's computed status *worsens* to `attention`/`critical` (30-min cooldown per zone; the first status seen after a restart never alerts), and `actuator` when automation turns an actuator on (`triggerActuator` with `true`), or with severity `warn` when a device stopped a pump at its safety limit or never confirmed a manual "on". Those warnings pass `always: true`, so they're sent even to users who turned actuator notifications off. Manual toggles and auto-offs don't notify.
- **Unconfirmed manual "on":** a device that drops off silently still looks online for ~20 s, so a manual toggle can go to a dead device, and its retained "on" would fire whenever it reconnects. `expectConfirmation` gives each manual "on" `CONFIRM_MS` (15 s) to show up in `*Confirmed`; otherwise it's switched back off with a `warn` notification. Automation isn't checked (a schedule that fires while the device is away resumes when it's back). Telling the two apart relies on `isOwnEcho`: `applyActuator` records each intent write it makes, and its Firestore echo is not treated as a manual toggle (or re-published).
- **Push:** `notify()` also sends each notification it writes to the user's `fcmTokens` via FCM (`firebase-admin/messaging`), after the Firestore write and without awaiting it, so FCM latency never delays callers. Tokens FCM reports as unregistered/invalid are pruned (`deadTokens`). Mobile only (no web push); no in-app pop-up while the app is open. FCM isn't emulated, so pushes fail or hang in the emulator tests, and mobile skips `PushService.init()` when `USE_FIREBASE_EMULATORS` is set. Needs "Firebase Cloud Messaging API (V1)" enabled on the project.
- **Nightly job** (`services/dailySummary.js`, scheduled in `mqttBridge.init()` by `DAILY_SUMMARY_CRON` / `DAILY_SUMMARY_TZ`, default 20:00 Asia/Kuala_Lumpur): sends each user a `daily` "Evening summary" notification, then prunes notifications older than 30 days, `statsDaily` docs older than 30 days, and snapshots older than 48 h. This runs in the timezone you configure; the schedule crons, and the summary's "today", run in server local time, so `TZ` in `server/.env` must be the growers' timezone (the Docker image and most hosts default to UTC).
- Cron jobs, the zone-alert cooldown, debounce and confirmation timers and auto-off `setTimeout`s all live in memory. A restart mid-cycle, including a `node --watch` reload while editing server code, loses the pending "off", and the retained command keeps the actuator on: a pump until the firmware's safety limit, the light until the next schedule or toggle.

### AI features (`server/src/routes/ai.js`)

OpenRouter via the `openai` SDK (`services/aiClient.js`, JSON mode, model from `OPENROUTER_MODEL`). AI is optional: with `OPENROUTER_API_KEY` empty, or on any model/validation error, endpoints return `source: 'fallback'`, and clients keep their local rule-based output. Model output is untrusted — `validateSummary` / `validatePlan` / `validatePlantProfile` clamp and sanitize it, and `fallbackPlan` builds a plan with no model. `automation-plan` never writes Firestore; the client saves the plan (with `aiRecommended: true`) after the user confirms. Bump `PROFILE_V` when changing the plant-profile prompt or shape, so the `aiPlantProfiles` cache is invalidated.

### Web ↔ mobile parity

The two clients implement the same features separately, and some logic is hand-ported between them — change both sides together:

| Web (`web_dashboard/client/src/`) | Mobile (`mobile_app/lib/`) |
|---|---|
| `lib/zoneFit.js` | `utils/zone_fit.dart` |
| `lib/plantHealth.js` | `utils/plant_health.dart` |
| `lib/aiSummary.js` | `services/ai_summary_service.dart` |
| `lib/analytics.js` (`buildChartData`, `describeTrend`, `buildOverviewSummary`, …) | `utils/analytics.dart` (`groupByTime`, same names otherwise) |
| `AddDeviceModal` discovery + transactional claim in `pages/DevicesPage.jsx` | `screens/devices/add_device_screen.dart` + `watchUnclaimedDevices` / `claimDevice` in `services/firestore/device_service.dart` |
| `CameraCard` in `pages/zones/OverviewTab.jsx` | `_CameraCard` in `screens/plants/zone_detail/overview_tab.dart` |
| M3 tokens in `index.css` (`--md-*`, `--chart-*`) | `theme.dart` (`seedColor`, `AppColors`) |
| `components/ui/StatusLabel.jsx` | `widgets/status_label.dart` |

- **Web** has no data layer: pages subscribe with `onSnapshot` and write inline. Routes are in `App.jsx` behind `PrivateRoute`. Styling follows Material Design 3: `src/index.css` holds the M3 color roles as CSS variables (light + `.dark`, toggled by `ThemeContext`; generated from the mobile seed, so keep both in step) plus the M3 component classes (`.btn-*`, `.icon-btn-*`, `.fab`, `.card|card-filled|card-outlined` + `.card-link`, `.tag`, `.banner-*`, `.chip`, `.segmented`, `.tab`, `.switch`, `.checkbox`, `.table`, `.list-row`, `.progress-linear`, `.nav-item`). Use the shared components in `components/ui/` (`TextField` = outlined field with floating label, `Dialog` / `Sheet`, `Loading`, `EmptyState`) and `components/layout/PageHeader` (title row + actions + notification bell) rather than hand-rolled markup; the FAB's Add zone dialog lives in `Layout` and pages open it via `useOutletContext().openAddZone`. Buttons size to their label (no full-width buttons); `tailwind.config.js` maps the roles to color names (`bg-primary`, `text-on-surface-variant`, …) and adds the M3 type scale (`text-title-lg`, …). Use roles, not raw palette colors. Icons are Material Symbols via `components/ui/Icon.jsx`; the font is self-hosted (`src/assets/fonts/material-symbols-rounded.woff2`, every icon included). Roboto still loads from Google Fonts (`index.html`) and falls back to the system sans offline.
- **Mobile** uses `models/*` (`fromDocument` / `toMap`) plus `services/firestore/*` streams consumed with `StreamBuilder` (no state-management package), though the analytics, plant-detail, add-plant and zone-detail screens also query Firestore directly. `RootScreen` hosts the five `NavigationBar` tabs; light/dark is the global `themeNotifier`. The M3 theme is `lib/theme.dart` (`buildTheme`, seed color, and the `AppColors` extension for the warning role and chart series, which `ColorScheme` lacks); use `Theme.of(context).colorScheme` / `AppColors.of(context)`, not `Colors.*`.

### Environment gotchas

- With `VITE_API_URL` set (as in `.env.example`), web API calls go straight to `:5000` and bypass the Vite `/api` proxy, so the server's CORS allow-list applies: `CLIENT_ORIGIN` in `server/.env` (comma-separated, default `http://localhost:3000`). Add `vite preview` (:4173) or a deployed origin there.
- Mobile Firebase is wired for Android only: `main.dart` calls `Firebase.initializeApp()` with no options, relying on `android/app/google-services.json`. There's no iOS `GoogleService-Info.plist`, and `firebase_options.dart` throws on web/desktop, so iOS and `flutter run -d chrome` need `flutterfire configure` plus `options: DefaultFirebaseOptions.currentPlatform` first.
- The server needs `FIREBASE_STORAGE_BUCKET` (`firebase-admin.js` → `getStorage().bucket()` is called when `dailySummary.js` is imported, so a missing bucket breaks bridge startup). Web Storage uses the bucket from the client Firebase config.
- Security rules are `web_dashboard/firestore.rules` and `storage.rules` (deploy from `web_dashboard/`: `npx firebase-tools deploy --only firestore:rules,storage --project grownex-iot`). Both apps hit Firestore/Storage directly, so the rules are the only thing keeping users apart: every collection a client reads or writes needs a rule, and a rule may only use what the query or doc provides (e.g. plants are checked through their zone's `userId`). The emulators load them through `firebase.json`, so `npm run test:integration` enforces them (its security-rules test checks a second user is refused); the run-grownex sandbox uses open rules unless switched with `sandbox.sh rules real`. Composite indexes still live only in the Firebase console: a new query combining `where` and `orderBy` on different fields needs one created there.
