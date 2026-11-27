# Graph Report - GrowNex  (2026-11-27)

## Corpus Check
- 192 files · ~118,599 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 71 file(s) not represented in the graph (top: (none) 17, .xcconfig 8, .xml 7)
- WARNING: 71 of 275 files seen (26%) have no supported extractor and are missing from this graph entirely. It may look complete while representing only part of the codebase.

## Summary
- 2299 nodes · 4014 edges · 131 communities (114 shown, 17 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 130 edges (avg confidence: 0.91)
- Token cost: 469,489 input · 0 output

## Graph Freshness
- Built from commit: `d44cb08b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- package:flutter/material.dart
- mqttBridge.js
- Web Analytics Logic
- Mobile Analytics Utils
- simulator.js
- Mobile Add Plant Screen
- Mobile Zone Overview & Camera
- Mobile Analytics Screen
- Apple Platform Runners
- add_device_screen.dart
- ESP32 Firmware (Node + Cam)
- Mobile Automation Tab
- Mobile Plant Detail
- Web Client Deps & Tailwind
- schedules.dart
- visionEval.js
- Linux Flutter Runner
- Mobile Zone Fit
- plant_diagnosis_model.dart
- Mobile Push & Notifications UI
- aiAnalytics.js
- Mobile Zone Model
- Mobile Monitoring Tab
- Mobile pubspec Dependencies
- Mobile Integration Test
- zone_summary_card.dart
- Mobile AI Summary Service
- string
- Mobile Device Detail
- Mobile Auth Service
- win32_window.cpp
- Mobile Device Service
- Mobile Plant Model
- Server Dependencies
- dashboard_screen.dart
- Mobile Devices Screen
- ProfilePage.jsx
- Mobile Edit Profile
- Mobile Plant Health
- OverviewTab.jsx
- AddPlantModal
- useAuth
- Point
- root_screen.dart
- Mobile Zone Detail Screen
- Mobile Photo Service
- Mobile Add Zone Screen
- Docker Compose Setup
- MonitoringTab.jsx
- Simulator Package Config
- register_screen.dart
- Mobile Automation Config Model
- Mobile Sensor Reading Model
- Icon
- Server Express & Auth Middleware
- Mobile Zone Service
- register_screen.dart
- Mobile Notification Model
- Architecture
- State
- Desktop CMake Build
- Actuators and automation (`mqttBridge.js`)
- Win32 Window Content
- One "hero" soil sensor per zone, unlimited plants
- AI Plan Validation
- Flutter Window Destroy
- Flutter Web Manifest
- aiVision.js
- Windows Plugin Registrant
- mqttBridge.js (sole MQTT speaker)
- GrowNex
- Flutter Window Messages
- Win32 WndProc Handling
- Mobile Plant Service
- data_design.md
- auth_text_field.dart
- firebase_options.dart
- Dart Analyzer Config
- plant_diagnosis_card.dart
- plant_diagnosis_model.dart
- diagnosis_service.dart
- Sim Camera Morning Frame
- Sim Camera Night Frame
- init
- README.md
- Sim Camera Midday Frame
- Sim Camera Evening Frame
- Android MainActivity
- HTML Shells
- Mobile API Config
- main.dart
- CLAUDE.md
- PlantsTab.jsx
- notify() notification service
- Setup
- Design.md
- package:cloud_firestore/cloud_firestore.dart
- StatelessWidget
- logic_test.dart
- Plant health image diagnosis: design
- Vision evaluation
- cameraSnapshots.js
- zoneVisualCheck.js
- dailySummary.js
- Labelling guide
- zones/{zoneId} collection
- plants_tab.dart
- Size
- integration.test.js
- contract.test.js
- plant_diagnosis.dart
- status_label.dart
- log
- plant_screen.dart
- app_bottom_nav.dart
- FirebaseFirestore
- plantdocLabels.js
- MembersCard
- static const
- AddPlantScreen
- PlantDetailScreen

## God Nodes (most connected - your core abstractions)
1. `Icon()` - 71 edges
2. `useAuth()` - 35 edges
3. `AnalyticsPage()` - 32 edges
4. `TextField()` - 31 edges
5. `Win32Window` - 27 edges
6. `react` - 26 edges
7. `Dialog()` - 24 edges
8. `PlantDetailModal()` - 19 edges
9. `ZoneDetailPage()` - 19 edges
10. `firebase-admin` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Constraints` --references--> `validatePlan()`  [INFERRED]
  docs/superpowers/specs/2026-11-16-plant-image-diagnosis-design.md → web_dashboard/server/src/services/aiAnalytics.js
- `Global Constraints` --references--> `downscaleToJpeg()`  [INFERRED]
  docs/superpowers/plans/2026-11-16-plant-image-diagnosis.md → web_dashboard/client/src/lib/photoUpload.js
- `Evaluation` --references--> `downscaleToJpeg()`  [INFERRED]
  docs/superpowers/specs/2026-11-16-plant-image-diagnosis-design.md → web_dashboard/client/src/lib/photoUpload.js
- `AI features (`server/src/routes/ai.js`)` --references--> `validateSummary()`  [INFERRED]
  CLAUDE.md → web_dashboard/server/src/services/aiAnalytics.js
- `Actuators and automation (`mqttBridge.js`)` --references--> `validatePlan()`  [INFERRED]
  CLAUDE.md → web_dashboard/server/src/services/aiAnalytics.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Firestore-centred integration of bridge and clients** — claude_firestore_integration_point, claude_firebase_project, claude_mqttbridge, claude_web_dashboard_client, claude_mobile_app, claude_security_rules [EXTRACTED 1.00]
- **Linux Flutter desktop build (GTK runner)** — mobile_app_linux_runner_cmakelists_runner_executable, mobile_app_linux_flutter_cmakelists_flutter, mobile_app_linux_flutter_cmakelists_flutter_assemble, mobile_app_linux_cmakelists_apply_standard_settings, mobile_app_linux_cmakelists_install_bundle [EXTRACTED 1.00]
- **Windows Flutter desktop build (Win32 runner + C++ wrappers)** — mobile_app_windows_runner_cmakelists_runner_executable, mobile_app_windows_flutter_cmakelists_flutter, mobile_app_windows_flutter_cmakelists_flutter_wrapper_app, mobile_app_windows_flutter_cmakelists_flutter_wrapper_plugin, mobile_app_windows_flutter_cmakelists_flutter_assemble, mobile_app_windows_cmakelists_apply_standard_settings [EXTRACTED 1.00]
- **Speakers of the shared MQTT contract** — claude_mqtt_contract, claude_firmware_esp32_node, claude_firmware_cam_esp32_cam, claude_device_simulator, claude_mqttbridge [EXTRACTED 1.00]
- **Actuator command delivery and safety net** — claude_intent_vs_confirmed, claude_reconcilecommands, claude_expectconfirmation, claude_pump_safety_limit, claude_failsafe, claude_topic_actuators_command, claude_topic_actuators_state, claude_in_memory_timers [INFERRED 0.85]

## Communities (131 total, 17 thin omitted)

### Community 0 - "package:flutter/material.dart"
Cohesion: 0.11
Nodes (15): createState, _email, icon, initState, _loadingProfile, _loadProfile, onTap, ProfileScreen (+7 more)

### Community 1 - "mqttBridge.js"
Cohesion: 0.07
Nodes (35): ACTUATOR_LABEL, actuatorCache, actuatorQueues, ACTUATORS, ALL_OFF, automationConfigs, BROKER_PORT, cancelCronJobs() (+27 more)

### Community 2 - "Web Analytics Logic"
Cohesion: 0.06
Nodes (66): Firestore data model, Web ↔ mobile parity, Global Constraints, One Hero Soil Sensor, Unlimited Plants: Implementation Plan, Review Focus, Task 3: Web client, Task 4: Mobile app, Task 5: Docs and end-to-end check (+58 more)

### Community 3 - "Mobile Analytics Utils"
Cohesion: 0.03
Nodes (59): above, avgPref, b, below, buckets, buildOverviewSummary, checked, compliancePercent (+51 more)

### Community 4 - "simulator.js"
Cohesion: 0.13
Nodes (14): broker, brokerConfig(), clamp(), clients(), fail(), HERE, loadImages(), noise() (+6 more)

### Community 5 - "Mobile Add Plant Screen"
Cohesion: 0.04
Nodes (46): _aiApplied, _aiCareNotes, _aiCommonName, _aiConfidence, _aiLoading, _aiSource, build, _buildForm (+38 more)

### Community 6 - "Mobile Zone Overview & Camera"
Cohesion: 0.04
Nodes (45): _add, _assign, _assignedDeviceStream, _assignLoading, _availableCamerasFuture, _availableDevicesFuture, build, _buildAssignDropdown (+37 more)

### Community 7 - "Mobile Analytics Screen"
Cohesion: 0.04
Nodes (45): advice, _aiAdvice, _aiSource, _aiSummaries, AnalyticsScreen, _AnalyticsScreenState, build, _buildSingleChart (+37 more)

### Community 8 - "Apple Platform Runners"
Cohesion: 0.05
Nodes (20): cloud_firestore, Cocoa, file_selector_macos, firebase_auth, firebase_core, firebase_messaging, firebase_storage, Flutter (+12 more)

### Community 9 - "add_device_screen.dart"
Cohesion: 0.09
Nodes (21): build, _buildFoundCard, _buildManualEntry, _buildNearbyDevices, _buildNearbyTile, _claim, _claimError, _claiming (+13 more)

### Community 10 - "ESP32 Firmware (Node + Cam)"
Cohesion: 0.08
Nodes (30): captureAndPublish(), captureFrame(), connectMQTT(), currentBucket(), initCamera(), loop(), publishImage(), setup() (+22 more)

### Community 11 - "Mobile Automation Tab"
Cohesion: 0.04
Nodes (54): _aiLoading, _aiPlan, _applyAiPlan, _autoFertilizer, _autoLight, _autoWater, build, _buildActionCard (+46 more)

### Community 12 - "Mobile Plant Detail"
Cohesion: 0.05
Nodes (36): build, _buildConditionCard, _buildField, _buildNotesField, _buildPhotoSection, _buildPreferredConditions, _buildSensorOverview, _confirmDelete (+28 more)

### Community 13 - "Web Client Deps & Tailwind"
Cohesion: 0.07
Nodes (33): autoprefixer, postcss, recharts, tailwindcss, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+25 more)

### Community 14 - "schedules.dart"
Cohesion: 0.12
Nodes (15): b, _canonical, _clashes, _days, formatError, _formats, _minutes, others (+7 more)

### Community 15 - "visionEval.js"
Cohesion: 0.22
Nodes (12): calibration(), cohenKappa(), scoreRows(), wilson(), accuracy(), agreement(), fail(), pct() (+4 more)

### Community 16 - "Linux Flutter Runner"
Cohesion: 0.08
Nodes (14): fl_register_plugins(), main(), first_frame_cb(), my_application_activate(), my_application_class_init(), my_application_dispose(), my_application_init(), my_application_local_command_line() (+6 more)

### Community 17 - "Mobile Zone Fit"
Cohesion: 0.07
Nodes (29): _avgRange, b, byMetric, cur, currentFit, hi, kind, lo (+21 more)

### Community 18 - "plant_diagnosis_model.dart"
Cohesion: 0.12
Nodes (11): AppColors, buildTheme, copyWith, cs, dark, lerp, light, of (+3 more)

### Community 19 - "Mobile Push & Notifications UI"
Cohesion: 0.12
Nodes (10): _deleteToken, _deleting, init, _messaging, _pendingDeleteKey, PushService, _register, _save (+2 more)

### Community 20 - "aiAnalytics.js"
Cohesion: 0.18
Nodes (21): AI features (`server/src/routes/ai.js`), avg(), buildSummaryMessages(), canonical(), clamp(), cleanSchedule(), DAYS, dominantLightCondition() (+13 more)

### Community 21 - "Mobile Zone Model"
Cohesion: 0.07
Nodes (28): alertSummary, allMemberIds, cameraDeviceId, createdAt, deviceId, deviceOnline, fromDocument, fromMap (+20 more)

### Community 22 - "Mobile Monitoring Tab"
Cohesion: 0.07
Nodes (26): _avg, build, _buildDeviceStatus, _buildIdealConditions, _buildIdealRows, _buildImagePreview, _buildSensorOverview, _cameraStream (+18 more)

### Community 23 - "Mobile pubspec Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, cloud_firestore, cupertino_icons, firebase_auth, firebase_core, firebase_messaging, firebase_storage, fl_chart (+19 more)

### Community 24 - "Mobile Integration Test"
Cohesion: 0.07
Nodes (22): _admin, adminCount, adminCountWhere, _adminDocs, adminExists, button, deviceId, end (+14 more)

### Community 25 - "zone_summary_card.dart"
Cohesion: 0.09
Nodes (19): Zone, _badge, build, createState, initState, onTap, _plantsStream, _sensorInfo (+11 more)

### Community 26 - "Mobile AI Summary Service"
Cohesion: 0.07
Nodes (24): Advice, aiSummaryKinds, AiSummaryResult, AiSummaryService, AutomationPlanResult, commonName, empty, fetchAutomationPlan (+16 more)

### Community 27 - "string"
Cohesion: 0.12
Nodes (4): wWinMain(), CreateAndAttachConsole(), GetCommandLineArguments(), Utf8FromUtf16()

### Community 28 - "Mobile Device Detail"
Cohesion: 0.05
Nodes (39): assignedZoneId, Device, deviceName, deviceType, fertilizerActive, fromDocument, fromMap, hasFertilizerModule (+31 more)

### Community 29 - "Mobile Auth Service"
Cohesion: 0.10
Nodes (15): _auth, currentUser, deleteAccount, _deleteAccountDirectly, _deleteAll, _deleteFile, _firestore, getCurrentUserData (+7 more)

### Community 30 - "win32_window.cpp"
Cohesion: 0.12
Nodes (8): Win32Window::Destroy(), Win32Window::Show(), EnableNonClientDpiScaling, Scale(), Win32Window::Win32Window(), WindowClassRegistrar, class_registered_, instance_

### Community 31 - "Mobile Device Service"
Cohesion: 0.09
Nodes (20): assignDeviceToZone, claimDevice, deleteDevice, DeviceClaimException, DeviceService, _firestore, getAvailableCameras, getAvailableDevices (+12 more)

### Community 32 - "Mobile Plant Model"
Cohesion: 0.10
Nodes (20): createdAt, fromDocument, fromMap, id, _n, notes, photoUrl, Plant (+12 more)

### Community 33 - "Server Dependencies"
Cohesion: 0.09
Nodes (26): cors, node-cron, openai, sharp, dependencies, cors@^2.8.5, express@^4.19.2, firebase@^12.14.0 (+18 more)

### Community 34 - "dashboard_screen.dart"
Cohesion: 0.12
Nodes (11): _buildEmptyState, _buildSummaryCard, _contentPadding, createState, DashboardScreen, _DashboardScreenState, initState, _zonesStream (+3 more)

### Community 35 - "Mobile Devices Screen"
Cohesion: 0.09
Nodes (17): build, build, _buildDeviceCard, _buildSummaryCard, createState, DevicesScreen, _DevicesScreenState, _devicesStream (+9 more)

### Community 36 - "ProfilePage.jsx"
Cohesion: 0.19
Nodes (13): Dialog(), Sheet(), useEscape(), useModalFocus(), WIDTH, Switch(), DeleteAccountModal(), EditProfileModal() (+5 more)

### Community 37 - "Mobile Edit Profile"
Cohesion: 0.11
Nodes (17): build, _confirmPwCtrl, createState, _currentPwCtrl, dispose, EditProfileScreen, _EditProfileScreenState, _emailDisplay (+9 more)

### Community 38 - "Mobile Plant Health"
Cohesion: 0.12
Nodes (16): _compliancePercent, defs, dist, MetricHealth, _metricNowScore, metrics, parts, plantHealth (+8 more)

### Community 39 - "OverviewTab.jsx"
Cohesion: 0.14
Nodes (17): Task 6: Web client, Task 7: Mobile client, Clients, AddZoneDialog(), finish(), handleSubmit(), downscaleToJpeg(), removeZonePhoto() (+9 more)

### Community 40 - "AddPlantModal"
Cohesion: 0.11
Nodes (19): AI_SUMMARY_KINDS, fetchAiSummary(), fetchAutomationPlan(), fetchPlantProfile(), identifyPlant(), postJson(), scheduleList(), AutomationTab() (+11 more)

### Community 41 - "useAuth"
Cohesion: 0.12
Nodes (30): react, react-dom, react-router-dom, App(), PrivateRoute(), AuthLayout(), FEATURES, Layout() (+22 more)

### Community 42 - "Point"
Cohesion: 0.50
Nodes (3): Point, x, y

### Community 43 - "root_screen.dart"
Cohesion: 0.12
Nodes (8): createState, _onTabSelected, RootScreen, _RootScreenState, routeName, _screens, _selectedIndex, _titles

### Community 44 - "Mobile Zone Detail Screen"
Cohesion: 0.12
Nodes (10): build, _confirmDeleteZone, createState, dispose, initState, _tabController, ZoneDetailScreen, _ZoneDetailScreenState (+2 more)

### Community 45 - "Mobile Photo Service"
Cohesion: 0.12
Nodes (15): bucket, d, deleteFile, deletePlantPhotoFile, _firestore, flooredHour, fourHourBucketId, PhotoService (+7 more)

### Community 46 - "Mobile Add Zone Screen"
Cohesion: 0.12
Nodes (13): AddZoneScreen, _AddZoneScreenState, build, _buildPhotoPicker, createState, dispose, _formKey, _loading (+5 more)

### Community 47 - "Docker Compose Setup"
Cohesion: 0.12
Nodes (17): build, depends_on, logging, ports, restart, options, name, max-file (+9 more)

### Community 48 - "MonitoringTab.jsx"
Cohesion: 0.36
Nodes (9): fourHourBucketId(), uploadZoneSnapshot(), avg(), Current(), dominantLight(), MonitoringTab(), handleSnapshotFile(), rangeStr() (+1 more)

### Community 49 - "Simulator Package Config"
Cohesion: 0.13
Nodes (16): dependencies, mqtt@^5.15.1, description, devDependencies, aedes@^1.2.0, engines, node, aedes (+8 more)

### Community 50 - "register_screen.dart"
Cohesion: 0.12
Nodes (14): _authService, build, createState, dispose, _emailController, _formKey, _isLoading, _login (+6 more)

### Community 51 - "Mobile Automation Config Model"
Cohesion: 0.12
Nodes (14): aiRecommended, autoFertilizingEnabled, autoLightingEnabled, AutomationConfig, autoWateringEnabled, fertilizingDuration, fertilizingSchedule, fromDocument (+6 more)

### Community 52 - "Mobile Sensor Reading Model"
Cohesion: 0.15
Nodes (11): fromDocument, fromMap, humidity, id, lightLevel, moisture, _n, plantId (+3 more)

### Community 53 - "Icon"
Cohesion: 0.12
Nodes (32): PageHeader(), NotificationBell(), SEVERITY, TYPE_ICON, EmptyState(), Icon(), Loading(), Spinner() (+24 more)

### Community 54 - "Server Express & Auth Middleware"
Cohesion: 0.15
Nodes (16): dotenv, express, firebase-admin, labels, dotenv@^16.4.5, db, rand(), seed() (+8 more)

### Community 55 - "Mobile Zone Service"
Cohesion: 0.13
Nodes (12): createZoneWithId, deleteZone, _firestore, getStats, getZone, newZoneRef, updateZoneCamera, updateZoneDevice (+4 more)

### Community 56 - "register_screen.dart"
Cohesion: 0.12
Nodes (14): _authService, build, _confirmController, createState, dispose, _emailController, _formKey, _isLoading (+6 more)

### Community 57 - "Mobile Notification Model"
Cohesion: 0.14
Nodes (12): AppNotification, createdAt, fromDocument, id, isRead, message, severity, title (+4 more)

### Community 58 - "Architecture"
Cohesion: 0.20
Nodes (9): Architecture, Commands, Environment gotchas, Firestore is the integration point, graphify, MQTT contract (firmware ↔ bridge), Overview, Non-goals (+1 more)

### Community 59 - "State"
Cohesion: 0.16
Nodes (14): AddDeviceScreen, _AddDeviceScreenState, AutomationTab, _AutomationTabState, _ScheduleList, _ScheduleListState, MonitoringTab, _MonitoringTabState (+6 more)

### Community 60 - "Desktop CMake Build"
Cohesion: 0.24
Nodes (13): Linux GTK APPLICATION_ID com.example.mobile_app, APPLY_STANDARD_SETTINGS (Linux), Linux relocatable install bundle, flutter INTERFACE library (Linux, libflutter_linux_gtk.so), flutter_assemble target (Linux, tool_backend.sh), Linux runner executable (main.cc, my_application.cc), APPLY_STANDARD_SETTINGS (Windows), Windows in-place install next to executable (+5 more)

### Community 61 - "Actuators and automation (`mqttBridge.js`)"
Cohesion: 0.36
Nodes (11): Actuators and automation (`mqttBridge.js`), applyActuator(), expectConfirmation(), handleActuatorState(), isOwnEcho(), publishCommand(), reconcileCommands(), sameIntent() (+3 more)

### Community 62 - "Win32 Window Content"
Cohesion: 0.19
Nodes (7): FlutterWindow::OnCreate(), Win32Window::GetClientArea(), Win32Window::OnCreate(), Win32Window, child_content_, quit_on_close_, window_handle_

### Community 63 - "One "hero" soil sensor per zone, unlimited plants"
Cohesion: 0.22
Nodes (8): Anti-goals, Approaches, Design, Goals, Intent, Left to the builder, Non-goals, One "hero" soil sensor per zone, unlimited plants

### Community 64 - "AI Plan Validation"
Cohesion: 0.14
Nodes (15): TTL_MS, buildPlanMessages(), validateSummary(), buildPlantProfileMessages(), clamp(), LIGHT, num(), titleCase() (+7 more)

### Community 65 - "Flutter Window Destroy"
Cohesion: 0.18
Nodes (5): FlutterWindow::OnDestroy(), FlutterWindow, flutter_controller_, project_, Win32Window::OnDestroy()

### Community 66 - "Flutter Web Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, prefer_related_applications, short_name (+2 more)

### Community 67 - "aiVision.js"
Cohesion: 0.18
Nodes (19): Task 1: Vision module (prompts, validators, image calls), Output contract, Tests, ALIASES, ask(), buildDiagnosisMessages(), buildZoneCheckMessages(), CONDITION_DEFS (+11 more)

### Community 69 - "mqttBridge.js (sole MQTT speaker)"
Cohesion: 0.22
Nodes (11): Automation schedule string contract (node-cron), automationConfig/{zoneId} collection, cameraSnapshots.js (camera image storage), HiveMQ MQTT broker (TLS 8883), mqttBridge.js (sole MQTT speaker), Nightly job dailySummary.js (evening summary + pruning), snapshots/{YYYY-MM-DDTHH} camera feed, statsDaily/{YYYY-MM-DD} hourly history docs (+3 more)

### Community 70 - "GrowNex"
Cohesion: 0.11
Nodes (18): 1.1 Configure environment, 1.2 Install dependencies, 1.3 Start both processes, 1.4 Production build (optional), 1.5 Run with Docker (optional), 1. Run the website, 2.1 Configure Firebase, 2.2 Install dependencies (+10 more)

### Community 73 - "Mobile Plant Service"
Cohesion: 0.20
Nodes (8): createPlantWithId, deletePlant, _firestore, getPlantsByZone, newPlantRef, PlantService, updatePlant, watchPlantsByZone

### Community 74 - "data_design.md"
Cohesion: 0.17
Nodes (12): Composite indexes (Firebase console only), Legacy sensorReadings/ and hourly stats/ collections, notifications/{id} collection (append-only), 🟢 1. USERS (top-level), Sketch: zones/{zoneId}/automationHistory logs, Sketch: devices/{deviceId} (no example), Firestore Data Structure, Sketch: notifications/{notificationId} (global) (+4 more)

### Community 75 - "auth_text_field.dart"
Cohesion: 0.20
Nodes (7): AuthTextField, build, controller, hintText, keyboardType, label, obscureText

### Community 76 - "firebase_options.dart"
Cohesion: 0.29
Nodes (3): android, DefaultFirebaseOptions, ios

### Community 77 - "Dart Analyzer Config"
Cohesion: 0.33
Nodes (5): analyzer, exclude, include, linter, rules

### Community 78 - "plant_diagnosis_card.dart"
Cohesion: 0.12
Nodes (16): build, _buildResult, _busy, createState, _delete, _error, initState, _openId (+8 more)

### Community 79 - "plant_diagnosis_model.dart"
Cohesion: 0.13
Nodes (14): advice, condition, confidence, createdAt, fromDocument, id, imageUrl, likelyCause (+6 more)

### Community 80 - "diagnosis_service.dart"
Cohesion: 0.09
Nodes (14): _col, delete, _delete, deleteForPlant, DiagnosisService, _firestore, _forPlant, run (+6 more)

### Community 81 - "Sim Camera Morning Frame"
Cohesion: 0.67
Nodes (4): Simulated ESP32-CAM Morning Snapshot, Four Potted Seedlings on Shelf, Morning Time-of-Day Scene, GrowNex Simulated ESP32-CAM

### Community 82 - "Sim Camera Night Frame"
Cohesion: 0.67
Nodes (4): Four Potted Seedlings on Shelf, Grow Light On at Night (pink/purple overhead bar), Night Grow-Light Camera Frame (simulated ESP32-CAM), GrowNex Simulated ESP32-CAM

### Community 83 - "init"
Cohesion: 0.27
Nodes (12): Task 2: Server (bridge, AI prompt, seed, sandbox), enqueue(), getOrCreateDevice(), handleCameraImage(), handleSensors(), handleStatus(), init(), isCameraId() (+4 more)

### Community 84 - "README.md"
Cohesion: 0.19
Nodes (14): Device ID scheme (ESP32- / ESP32CAM- + MAC hex), device_simulator/ Node stand-in for both boards, firmware_cam/ ESP32-CAM camera node, firmware/ ESP32 sensor-relay node, MQTT topic contract (firmware <-> bridge), reconcileCommands on startup/reconnect, include/secrets.h credentials (gitignored), grownex/{id}/actuators/command topic (retained) (+6 more)

### Community 85 - "Sim Camera Midday Frame"
Cohesion: 1.00
Nodes (3): Simulated ESP32-CAM Midday Frame, Four Potted Plants Scene, Simulated ESP32-CAM

### Community 86 - "Sim Camera Evening Frame"
Cohesion: 0.67
Nodes (3): Simulated ESP32-CAM Evening Frame (3-evening.jpg), Four Potted Plants on Windowsill (zone plant slots), GrowNex Simulated ESP32-CAM Feed (caption overlay)

### Community 88 - "HTML Shells"
Cohesion: 0.67
Nodes (3): Flutter web shell (flutter_bootstrap.js, $FLUTTER_BASE_HREF), Roboto from Google Fonts, Web dashboard HTML shell (#root, /src/main.jsx)

### Community 91 - "main.dart"
Cohesion: 0.14
Nodes (5): build, initializeApp, main, MyApp, prefs

### Community 100 - "CLAUDE.md"
Cohesion: 0.30
Nodes (13): Android-only mobile Firebase config, CORS CLIENT_ORIGIN allow-list, Shared Firebase project (Auth + Firestore + Storage), mobile_app Flutter app, Firestore/Storage security rules, web_dashboard/client React dashboard, web_dashboard/server Express API + MQTT bridge, Ports (+5 more)

### Community 101 - "PlantsTab.jsx"
Cohesion: 0.12
Nodes (36): DiagnosisList(), PlantDiagnosisCard(), handleDelete(), handleFile(), StatusLabel(), tone(), analytics, app (+28 more)

### Community 102 - "notify() notification service"
Cohesion: 0.18
Nodes (9): FCM push to fcmTokens (mobile only), notify() notification service, Threshold watering (30-min per-device cooldown), grownex/{id}/actuators/state topic, users/{uid} (notificationPrefs, fcmTokens), Differences from the real boards, GrowNex device simulator, Run it (+1 more)

### Community 103 - "Setup"
Cohesion: 0.20
Nodes (10): 1. Firebase config, 2. Install dependencies, 3. Run, Docker, GrowNex Web Dashboard, Local sandbox, Mobile tests, Project structure (+2 more)

### Community 104 - "Design.md"
Cohesion: 0.40
Nodes (3): Material Design 3 theming (index.css tokens / theme.dart), Bottom navigation (Dashboard, Plants/Zones, Analytics, Devices, Profile), Nature-inspired green/white card-based style

### Community 105 - "package:cloud_firestore/cloud_firestore.dart"
Cohesion: 0.22
Nodes (7): _firestore, markAllRead, markRead, NotificationService, savePrefs, watchNotifications, watchPrefs

### Community 106 - "StatelessWidget"
Cohesion: 0.17
Nodes (11): _AdviceTile, _ChartCard, _ComplianceBar, _InsightTile, _MetricCard, _SectionCard, _SummaryLine, _ZoneChip (+3 more)

### Community 107 - "logic_test.dart"
Cohesion: 0.13
Nodes (6): main, now, plant, reading, today, zone

### Community 108 - "Plant health image diagnosis: design"
Cohesion: 0.15
Nodes (12): Anti-goals, Approaches, Calls made by Claude, not the user, Constraints, Data, Docs, Evaluation, Goals (+4 more)

### Community 109 - "Vision evaluation"
Cohesion: 0.33
Nodes (5): Camera vs sensors (`--task agreement`), Data (gitignored, under `eval/data/`), Protocol (fixed before looking at any result), Run order, Vision evaluation

### Community 110 - "cameraSnapshots.js"
Cohesion: 0.24
Nodes (8): Server, chatJson(), chatJsonRaw(), getClient(), bucket, db, fourHourBucketId(), saveZoneSnapshot()

### Community 111 - "zoneVisualCheck.js"
Cohesion: 0.18
Nodes (15): Global Constraints, Plant Image Diagnosis Implementation Plan, Review Focus, Task 2: Evaluation metrics, Task 3: Evaluation scripts and protocol files, Task 4: Plant diagnosis endpoint, rules, account cascade, Task 5: Zone check on camera snapshots, Task 8: Documentation (+7 more)

### Community 112 - "dailySummary.js"
Cohesion: 0.22
Nodes (14): loadOwnedZone(), bucket, db, pruneStatsDaily(), pruneZoneSnapshots(), runDailySummary(), db, DEAD_TOKEN_CODES (+6 more)

### Community 113 - "Labelling guide"
Cohesion: 0.40
Nodes (4): Labelling guide, Plant close-ups (`--task plant`), Splits, Zone camera snapshots (`--task zone`)

### Community 114 - "zones/{zoneId} collection"
Cohesion: 0.17
Nodes (13): Account deletion (DELETE /api/auth/me + mobile fallback), AI features (routes/ai.js), aiCache/{today|7days} AI summary cache, aiPlantProfiles/{slug} global cache, Transactional device claiming (unclaimed discovery), devices/{deviceId} collection, OpenRouter via openai SDK (aiClient.js), plants/{plantId} collection (+5 more)

### Community 115 - "plants_tab.dart"
Cohesion: 0.15
Nodes (9): createState, _InfoChip, initState, label, _plantsStream, PlantsTab, _PlantsTabState, value (+1 more)

### Community 116 - "Size"
Cohesion: 0.50
Nodes (3): Size, height, width

### Community 117 - "integration.test.js"
Cohesion: 0.19
Nodes (5): MAX_DIAGNOSES_PER_DAY, reserveDiagnosis(), SERVER_DIR, sleep(), waitFor()

### Community 118 - "contract.test.js"
Cohesion: 0.21
Nodes (9): DIR, find(), msgs, retained(), runSim(), since(), sleep(), waitFor() (+1 more)

### Community 119 - "plant_diagnosis.dart"
Cohesion: 0.33
Nodes (5): conditionLabel, conditionTone, diagnosisConditions, diagnosisError, _labels

### Community 120 - "status_label.dart"
Cohesion: 0.20
Nodes (9): app, build, cs, s, scoreColors, status, statusColors, StatusLabel (+1 more)

### Community 122 - "log"
Cohesion: 0.32
Nodes (8): applyRelays(), connect(), currentBucket(), forget(), log(), startCamera(), startSensor(), time()

### Community 123 - "plant_screen.dart"
Cohesion: 0.17
Nodes (8): _buildFilterButton, createState, initState, PlantScreen, _PlantScreenState, routeName, _selectedFilter, _zonesStream

### Community 124 - "app_bottom_nav.dart"
Cohesion: 0.22
Nodes (5): themeNotifier, AppBottomNav, build, currentIndex, onTabSelected

### Community 125 - "FirebaseFirestore"
Cohesion: 0.25
Nodes (5): AutomationConfigService, _firestore, getConfig, saveConfig, saveFields

### Community 126 - "plantdocLabels.js"
Cohesion: 0.29
Nodes (4): map, out, [root, devPerClass = '15'], unmapped

### Community 127 - "MembersCard"
Cohesion: 0.52
Nodes (6): addZoneMember(), call(), removeZoneMember(), MembersCard(), add(), remove()

### Community 128 - "static const"
Cohesion: 0.33
Nodes (3): build, NotificationSettingsScreen, _types

## Knowledge Gaps
- **889 isolated node(s):** `main`, `_maxWateringS`, `zone`, `_configService`, `_aiPlan` (+884 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1301 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Architecture` connect `Architecture` to `Web Analytics Logic`, `aiAnalytics.js`, `Actuators and automation (`mqttBridge.js`)`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **What connects `main`, `_maxWateringS`, `zone` to the rest of the system?**
  _889 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package:flutter/material.dart` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Why does `Web ↔ mobile parity` connect `Web Analytics Logic` to `useAuth`, `Architecture`, `Icon`, `OverviewTab.jsx`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `mqttBridge.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07301587301587302 - nodes in this community are weakly interconnected._
- **Why does `MQTT contract (firmware ↔ bridge)` connect `Architecture` to `ESP32 Firmware (Node + Cam)`, `aiAnalytics.js`, `Actuators and automation (`mqttBridge.js`)`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Should `Web Analytics Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.0590990990990991 - nodes in this community are weakly interconnected._