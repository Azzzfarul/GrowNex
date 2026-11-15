# Graph Report - GrowNex  (2026-11-15)

## Corpus Check
- 175 files · ~91,960 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 70 file(s) not represented in the graph (top: (none) 16, .xcconfig 8, .xml 7)
- WARNING: 70 of 245 files seen (29%) have no supported extractor and are missing from this graph entirely. It may look complete while representing only part of the codebase.

## Summary
- 1979 nodes · 3351 edges · 100 communities (85 shown, 15 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 47 edges (avg confidence: 0.84)
- Token cost: 469,489 input · 0 output

## Community Hubs (Navigation)
- Architecture Docs & Concepts
- MQTT Bridge & Notifications
- Web Analytics Logic
- Mobile Analytics Utils
- Device Simulator & Tests
- Mobile Add Plant Screen
- Mobile Zone Overview & Camera
- Mobile Analytics Screen
- Apple Platform Runners
- Mobile Add Device & Model
- ESP32 Firmware (Node + Cam)
- Mobile Automation Tab
- Mobile Plant Detail
- Web Client Deps & Tailwind
- Web Dashboard/Devices/Plants Pages
- Web Zone Detail & Plants Tab
- Linux Flutter Runner
- Mobile Zone Fit
- Web Auth & Routing
- Mobile Push & Notifications UI
- Mobile App Shell & Theme Imports
- Mobile Zone Model
- Mobile Monitoring Tab
- Mobile pubspec Dependencies
- Mobile Integration Test
- Mobile Zone Cards
- Mobile AI Summary Service
- Windows Runner Entry
- Mobile Device Detail
- Mobile Auth Service
- Win32 Window Lifecycle
- Mobile Device Service
- Mobile Plant Model
- Server Dependencies
- Mobile Dashboard & Plants Screens
- Mobile Devices Screen
- Mobile Profile Screen
- Mobile Edit Profile
- Mobile Plant Health
- Web Firebase & Monitoring Tab
- Web Zone Overview & Camera
- Web Profile & Automation Tab
- Mobile Plants Tab
- Mobile Login Screen
- Mobile Zone Detail Screen
- Mobile Photo Service
- Mobile Add Zone Screen
- Docker Compose Setup
- Mobile Root Navigation
- Simulator Package Config
- Mobile Register Screen
- Mobile Automation Config Model
- Mobile Sensor Reading Model
- Mobile M3 Theme
- Server Express & Auth Middleware
- Mobile Zone Service
- Web Layout, Theme & Notifications
- Mobile Notification Model
- Mobile Shared Card Widgets
- Mobile Stateful Screens
- Desktop CMake Build
- Mobile Logic Tests
- Win32 Window Content
- Web Device Detail & Dialogs
- AI Plan Validation
- Flutter Window Destroy
- Flutter Web Manifest
- AI Routes & Client
- Windows Plugin Registrant
- Mobile Notification Service
- Mobile Auth Text Field
- Flutter Window Messages
- Win32 WndProc Handling
- Mobile Plant Service
- Mobile Automation Config Service
- AI Plant Profiles
- Mobile Firebase Options
- Dart Analyzer Config
- Mobile Bottom Nav
- Demo Data Seeder
- Server npm Scripts
- Sim Camera Morning Frame
- Sim Camera Night Frame
- Win32 Point Struct
- Win32 Size Struct
- Sim Camera Midday Frame
- Sim Camera Evening Frame
- Android MainActivity
- HTML Shells
- Mobile API Config
- Analytics Screen State

## God Nodes (most connected - your core abstractions)
1. `Icon()` - 68 edges
2. `AnalyticsPage()` - 33 edges
3. `TextField()` - 29 edges
4. `useAuth()` - 29 edges
5. `Win32Window` - 27 edges
6. `GrowNex README` - 26 edges
7. `react` - 24 edges
8. `Dialog()` - 22 edges
9. `Loading()` - 18 edges
10. `mqttBridge.js (sole MQTT speaker)` - 18 edges

## Surprising Connections (you probably didn't know these)
- `Sketch: zones/{zoneId}/plantImages` --semantically_similar_to--> `snapshots/{YYYY-MM-DDTHH} camera feed`  [INFERRED] [semantically similar]
  mobile_app/docs/data_design.md → CLAUDE.md
- `Web dashboard HTML shell (#root, /src/main.jsx)` --semantically_similar_to--> `Flutter web shell (flutter_bootstrap.js, $FLUTTER_BASE_HREF)`  [INFERRED] [semantically similar]
  web_dashboard/client/index.html → mobile_app/web/index.html
- `Bottom navigation (Dashboard, Plants/Zones, Analytics, Devices, Profile)` --conceptually_related_to--> `mobile_app Flutter app`  [INFERRED]
  mobile_app/Design.md → CLAUDE.md
- `Sketch: devices/{deviceId} (no example)` --conceptually_related_to--> `devices/{deviceId} collection`  [INFERRED]
  mobile_app/docs/data_design.md → CLAUDE.md
- `Sketch: notifications/{notificationId} (global)` --conceptually_related_to--> `notifications/{id} collection (append-only)`  [INFERRED]
  mobile_app/docs/data_design.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Speakers of the shared MQTT contract** — claude_mqtt_contract, claude_firmware_esp32_node, claude_firmware_cam_esp32_cam, claude_device_simulator, claude_mqttbridge [EXTRACTED 1.00]
- **Firestore-centred integration of bridge and clients** — claude_firestore_integration_point, claude_firebase_project, claude_mqttbridge, claude_web_dashboard_client, claude_mobile_app, claude_security_rules [EXTRACTED 1.00]
- **Actuator command delivery and safety net** — claude_intent_vs_confirmed, claude_reconcilecommands, claude_expectconfirmation, claude_pump_safety_limit, claude_failsafe, claude_topic_actuators_command, claude_topic_actuators_state, claude_in_memory_timers [INFERRED 0.85]
- **Linux Flutter desktop build (GTK runner)** — mobile_app_linux_runner_cmakelists_runner_executable, mobile_app_linux_flutter_cmakelists_flutter, mobile_app_linux_flutter_cmakelists_flutter_assemble, mobile_app_linux_cmakelists_apply_standard_settings, mobile_app_linux_cmakelists_install_bundle [EXTRACTED 1.00]
- **Windows Flutter desktop build (Win32 runner + C++ wrappers)** — mobile_app_windows_runner_cmakelists_runner_executable, mobile_app_windows_flutter_cmakelists_flutter, mobile_app_windows_flutter_cmakelists_flutter_wrapper_app, mobile_app_windows_flutter_cmakelists_flutter_wrapper_plugin, mobile_app_windows_flutter_cmakelists_flutter_assemble, mobile_app_windows_cmakelists_apply_standard_settings [EXTRACTED 1.00]

## Communities (100 total, 15 thin omitted)

### Community 0 - "Architecture Docs & Concepts"
Cohesion: 0.05
Nodes (76): CLAUDE.md (GrowNex repo guide), Account deletion (DELETE /api/auth/me + mobile fallback), AI features (routes/ai.js), aiCache/{today|7days} AI summary cache, aiPlantProfiles/{slug} global cache, Android-only mobile Firebase config, Automation schedule string contract (node-cron), automationConfig/{zoneId} collection (+68 more)

### Community 1 - "MQTT Bridge & Notifications"
Cohesion: 0.06
Nodes (63): bucket, db, fourHourBucketId(), saveZoneSnapshot(), bucket, db, pruneStatsDaily(), pruneZoneSnapshots() (+55 more)

### Community 2 - "Web Analytics Logic"
Cohesion: 0.07
Nodes (56): AI_SUMMARY_KINDS, fetchAiSummary(), fetchAutomationPlan(), fetchPlantProfile(), postJson(), avg(), avgPref(), buildChartData() (+48 more)

### Community 3 - "Mobile Analytics Utils"
Cohesion: 0.03
Nodes (60): above, avgPref, b, base, below, buckets, buildOverviewSummary, checked (+52 more)

### Community 4 - "Device Simulator & Tests"
Cohesion: 0.06
Nodes (33): applyRelays(), broker, brokerConfig(), clamp(), clients(), connect(), currentBucket(), fail() (+25 more)

### Community 5 - "Mobile Add Plant Screen"
Cohesion: 0.04
Nodes (48): AddPlantScreen, _AddPlantScreenState, _aiApplied, _aiCareNotes, _aiCommonName, _aiConfidence, _aiLoading, _aiSource (+40 more)

### Community 6 - "Mobile Zone Overview & Camera"
Cohesion: 0.04
Nodes (44): _assign, _assignedDeviceStream, _assignLoading, _availableCamerasFuture, _availableDevicesFuture, build, _buildAssignDropdown, _buildAssignedCamera (+36 more)

### Community 7 - "Mobile Analytics Screen"
Cohesion: 0.04
Nodes (45): advice, _aiAdvice, _aiSource, _aiSummaries, build, _buildMoistureChart, _buildSingleChart, caption (+37 more)

### Community 8 - "Apple Platform Runners"
Cohesion: 0.05
Nodes (20): cloud_firestore, Cocoa, file_selector_macos, firebase_auth, firebase_core, firebase_messaging, firebase_storage, Flutter (+12 more)

### Community 9 - "Mobile Add Device & Model"
Cohesion: 0.04
Nodes (42): assignedZoneId, Device, deviceName, deviceType, fertilizerActive, fromDocument, fromMap, hasFertilizerModule (+34 more)

### Community 10 - "ESP32 Firmware (Node + Cam)"
Cohesion: 0.08
Nodes (30): captureAndPublish(), captureFrame(), connectMQTT(), currentBucket(), initCamera(), loop(), publishImage(), setup() (+22 more)

### Community 11 - "Mobile Automation Tab"
Cohesion: 0.04
Nodes (42): _aiLoading, _aiPlan, _applyAiPlan, _autoFertilizer, _autoLight, _autoWater, build, _buildActionCard (+34 more)

### Community 12 - "Mobile Plant Detail"
Cohesion: 0.05
Nodes (38): build, _buildConditionCard, _buildField, _buildNotesField, _buildPhotoSection, _buildPreferredConditions, _buildSensorOverview, _confirmDelete (+30 more)

### Community 13 - "Web Client Deps & Tailwind"
Cohesion: 0.07
Nodes (33): autoprefixer, postcss, recharts, tailwindcss, @types/react, @types/react-dom, vite, @vitejs/plugin-react (+25 more)

### Community 14 - "Web Dashboard/Devices/Plants Pages"
Cohesion: 0.16
Nodes (26): PageHeader(), NotificationBell(), SEVERITY, TYPE_ICON, EmptyState(), Icon(), formatRelative(), useNotifications() (+18 more)

### Community 15 - "Web Zone Detail & Plants Tab"
Cohesion: 0.13
Nodes (28): Loading(), Spinner(), StatusLabel(), tone(), deleteFile(), downscaleToJpeg(), removePlantPhoto(), removePlantPhotoFile() (+20 more)

### Community 16 - "Linux Flutter Runner"
Cohesion: 0.08
Nodes (14): fl_register_plugins(), main(), first_frame_cb(), my_application_activate(), my_application_class_init(), my_application_dispose(), my_application_init(), my_application_local_command_line() (+6 more)

### Community 17 - "Mobile Zone Fit"
Cohesion: 0.07
Nodes (29): _avgRange, b, byMetric, cur, currentFit, hi, kind, lo (+21 more)

### Community 18 - "Web Auth & Routing"
Cohesion: 0.18
Nodes (21): react-router-dom, App(), PrivateRoute(), AuthLayout(), FEATURES, TextField(), AuthContext, AuthProvider() (+13 more)

### Community 19 - "Mobile Push & Notifications UI"
Cohesion: 0.08
Nodes (17): build, NotificationSettingsScreen, _types, build, _icon, NotificationsScreen, _relative, _deleteToken (+9 more)

### Community 20 - "Mobile App Shell & Theme Imports"
Cohesion: 0.08
Nodes (14): build, initializeApp, main, MyApp, prefs, themeNotifier, app, build (+6 more)

### Community 21 - "Mobile Zone Model"
Cohesion: 0.07
Nodes (27): alertSummary, cameraDeviceId, createdAt, deviceId, deviceOnline, fromDocument, fromMap, hasFertilizer (+19 more)

### Community 22 - "Mobile Monitoring Tab"
Cohesion: 0.07
Nodes (26): _avg, build, _buildDeviceStatus, _buildIdealConditions, _buildIdealRows, _buildImagePreview, _buildSensorOverview, _cameraStream (+18 more)

### Community 23 - "Mobile pubspec Dependencies"
Cohesion: 0.07
Nodes (27): dependencies, cloud_firestore, cupertino_icons, firebase_auth, firebase_core, firebase_messaging, firebase_storage, fl_chart (+19 more)

### Community 24 - "Mobile Integration Test"
Cohesion: 0.07
Nodes (21): _admin, adminCount, adminCountWhere, _adminDocs, adminExists, button, deviceId, end (+13 more)

### Community 25 - "Mobile Zone Cards"
Cohesion: 0.08
Nodes (18): Zone, _badge, build, createState, initState, _maxPlants, onTap, _plantsStream (+10 more)

### Community 26 - "Mobile AI Summary Service"
Cohesion: 0.08
Nodes (20): Advice, aiSummaryKinds, AiSummaryResult, AiSummaryService, AutomationPlanResult, empty, fetchAutomationPlan, fetchPlantProfile (+12 more)

### Community 27 - "Windows Runner Entry"
Cohesion: 0.12
Nodes (4): wWinMain(), CreateAndAttachConsole(), GetCommandLineArguments(), Utf8FromUtf16()

### Community 28 - "Mobile Device Detail"
Cohesion: 0.09
Nodes (21): build, _buildField, _buildInfoRow, _buildModuleToggle, _buildSection, _confirmDelete, createState, _deleting (+13 more)

### Community 29 - "Mobile Auth Service"
Cohesion: 0.09
Nodes (15): _auth, currentUser, deleteAccount, _deleteAccountDirectly, _deleteAll, _deleteFile, _firestore, getCurrentUserData (+7 more)

### Community 30 - "Win32 Window Lifecycle"
Cohesion: 0.12
Nodes (8): Win32Window::Destroy(), Win32Window::Show(), EnableNonClientDpiScaling, Scale(), Win32Window::Win32Window(), WindowClassRegistrar, class_registered_, instance_

### Community 31 - "Mobile Device Service"
Cohesion: 0.09
Nodes (20): assignDeviceToZone, claimDevice, deleteDevice, DeviceClaimException, DeviceService, _firestore, getAvailableCameras, getAvailableDevices (+12 more)

### Community 32 - "Mobile Plant Model"
Cohesion: 0.09
Nodes (21): createdAt, fromDocument, fromMap, id, _n, notes, photoUrl, Plant (+13 more)

### Community 33 - "Server Dependencies"
Cohesion: 0.12
Nodes (21): cors, dotenv, node-cron, openai, dependencies, cors@^2.8.5, dotenv@^16.4.5, express@^4.19.2 (+13 more)

### Community 34 - "Mobile Dashboard & Plants Screens"
Cohesion: 0.10
Nodes (12): _buildEmptyState, _buildSummaryCard, _contentPadding, createState, initState, _zonesStream, _buildFilterButton, createState (+4 more)

### Community 35 - "Mobile Devices Screen"
Cohesion: 0.11
Nodes (14): build, build, _buildDeviceCard, _buildSummaryCard, createState, _devicesStream, initState, _isOnline (+6 more)

### Community 36 - "Mobile Profile Screen"
Cohesion: 0.11
Nodes (15): createState, _email, icon, initState, _loadingProfile, _loadProfile, onTap, ProfileScreen (+7 more)

### Community 37 - "Mobile Edit Profile"
Cohesion: 0.11
Nodes (17): build, _confirmPwCtrl, createState, _currentPwCtrl, dispose, EditProfileScreen, _EditProfileScreenState, _emailDisplay (+9 more)

### Community 38 - "Mobile Plant Health"
Cohesion: 0.11
Nodes (18): _compliancePercent, defs, dist, MetricHealth, _metricNowScore, metrics, parts, plantHealth (+10 more)

### Community 39 - "Web Firebase & Monitoring Tab"
Cohesion: 0.21
Nodes (14): analytics, app, db, firebaseConfig, storage, fourHourBucketId(), uploadZoneSnapshot(), avg() (+6 more)

### Community 40 - "Web Zone Overview & Camera"
Cohesion: 0.18
Nodes (12): AddZoneDialog(), finish(), handleSubmit(), removeZonePhoto(), uploadZonePhoto(), AssignRow(), CameraCard(), LinkedDevice() (+4 more)

### Community 41 - "Web Profile & Automation Tab"
Cohesion: 0.17
Nodes (9): Switch(), DeleteAccountModal(), EditProfileModal(), NOTIF_TYPES, NotificationSettings(), ProfilePage(), SectionTitle(), AutomationTab() (+1 more)

### Community 42 - "Mobile Plants Tab"
Cohesion: 0.12
Nodes (13): createState, cs, initState, label, max, min, moisture, _plantsStream (+5 more)

### Community 43 - "Mobile Login Screen"
Cohesion: 0.12
Nodes (14): _authService, build, createState, dispose, _emailController, _formKey, _isLoading, _login (+6 more)

### Community 44 - "Mobile Zone Detail Screen"
Cohesion: 0.12
Nodes (10): build, _confirmDeleteZone, createState, dispose, initState, _tabController, ZoneDetailScreen, _ZoneDetailScreenState (+2 more)

### Community 45 - "Mobile Photo Service"
Cohesion: 0.11
Nodes (15): bucket, d, deleteFile, deletePlantPhotoFile, _firestore, flooredHour, fourHourBucketId, PhotoService (+7 more)

### Community 46 - "Mobile Add Zone Screen"
Cohesion: 0.12
Nodes (13): AddZoneScreen, _AddZoneScreenState, build, _buildPhotoPicker, createState, dispose, _formKey, _loading (+5 more)

### Community 47 - "Docker Compose Setup"
Cohesion: 0.12
Nodes (17): build, depends_on, logging, ports, restart, options, name, max-file (+9 more)

### Community 48 - "Mobile Root Navigation"
Cohesion: 0.12
Nodes (8): createState, _onTabSelected, RootScreen, _RootScreenState, routeName, _screens, _selectedIndex, _titles

### Community 49 - "Simulator Package Config"
Cohesion: 0.13
Nodes (16): dependencies, mqtt@^5.15.1, description, devDependencies, aedes@^1.2.0, engines, node, aedes (+8 more)

### Community 50 - "Mobile Register Screen"
Cohesion: 0.12
Nodes (14): _authService, build, _confirmController, createState, dispose, _emailController, _formKey, _isLoading (+6 more)

### Community 51 - "Mobile Automation Config Model"
Cohesion: 0.12
Nodes (14): aiRecommended, autoFertilizingEnabled, autoLightingEnabled, AutomationConfig, autoWateringEnabled, fertilizingDuration, fertilizingSchedule, fromDocument (+6 more)

### Community 52 - "Mobile Sensor Reading Model"
Cohesion: 0.12
Nodes (16): fromDocument, fromMap, humidity, id, lightLevel, moisture, moistureForSlot, _n (+8 more)

### Community 53 - "Mobile M3 Theme"
Cohesion: 0.12
Nodes (11): AppColors, buildTheme, copyWith, cs, dark, lerp, light, of (+3 more)

### Community 54 - "Server Express & Auth Middleware"
Cohesion: 0.28
Nodes (10): express, firebase-admin, app, origins, verifyToken(), router, router, router (+2 more)

### Community 55 - "Mobile Zone Service"
Cohesion: 0.13
Nodes (12): createZoneWithId, deleteZone, _firestore, getStats, getZone, newZoneRef, updateZoneCamera, updateZoneDevice (+4 more)

### Community 56 - "Web Layout, Theme & Notifications"
Cohesion: 0.21
Nodes (9): react, react-dom, Layout(), nav, Sidebar(), ThemeContext, useTheme(), NotificationsContext (+1 more)

### Community 57 - "Mobile Notification Model"
Cohesion: 0.14
Nodes (12): AppNotification, createdAt, fromDocument, id, isRead, message, severity, title (+4 more)

### Community 58 - "Mobile Shared Card Widgets"
Cohesion: 0.14
Nodes (13): _AdviceTile, _ChartCard, _ComplianceBar, _InsightTile, _MetricCard, _SectionCard, _SummaryLine, _ZoneChip (+5 more)

### Community 59 - "Mobile Stateful Screens"
Cohesion: 0.20
Nodes (12): DashboardScreen, _DashboardScreenState, DevicesScreen, _DevicesScreenState, PlantScreen, _PlantScreenState, ZoneSummaryCard, _ZoneSummaryCardState (+4 more)

### Community 60 - "Desktop CMake Build"
Cohesion: 0.24
Nodes (13): Linux GTK APPLICATION_ID com.example.mobile_app, APPLY_STANDARD_SETTINGS (Linux), Linux relocatable install bundle, flutter INTERFACE library (Linux, libflutter_linux_gtk.so), flutter_assemble target (Linux, tool_backend.sh), Linux runner executable (main.cc, my_application.cc), APPLY_STANDARD_SETTINGS (Windows), Windows in-place install next to executable (+5 more)

### Community 61 - "Mobile Logic Tests"
Cohesion: 0.14
Nodes (6): main, now, plant, reading, today, zone

### Community 62 - "Win32 Window Content"
Cohesion: 0.19
Nodes (7): FlutterWindow::OnCreate(), Win32Window::GetClientArea(), Win32Window::OnCreate(), Win32Window, child_content_, quit_on_close_, window_handle_

### Community 63 - "Web Device Detail & Dialogs"
Cohesion: 0.24
Nodes (9): Dialog(), Sheet(), useEscape(), useModalFocus(), WIDTH, DeviceDetailPage(), Fact(), formatLastSync() (+1 more)

### Community 64 - "AI Plan Validation"
Cohesion: 0.35
Nodes (9): avg(), clamp(), dominantLightCondition(), fallbackPlan(), lightScheduleFor(), num(), validatePlan(), validateSummary() (+1 more)

### Community 65 - "Flutter Window Destroy"
Cohesion: 0.18
Nodes (5): FlutterWindow::OnDestroy(), FlutterWindow, flutter_controller_, project_, Win32Window::OnDestroy()

### Community 66 - "Flutter Web Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, prefer_related_applications, short_name (+2 more)

### Community 67 - "AI Routes & Client"
Cohesion: 0.24
Nodes (6): TTL_MS, buildPlanMessages(), buildSummaryMessages(), aiEnabled(), chatJson(), getClient()

### Community 69 - "Mobile Notification Service"
Cohesion: 0.20
Nodes (7): _firestore, markAllRead, markRead, NotificationService, savePrefs, watchNotifications, watchPrefs

### Community 70 - "Mobile Auth Text Field"
Cohesion: 0.20
Nodes (7): AuthTextField, build, controller, hintText, keyboardType, label, obscureText

### Community 73 - "Mobile Plant Service"
Cohesion: 0.22
Nodes (8): createPlantWithId, deletePlant, _firestore, getPlantsByZone, newPlantRef, PlantService, updatePlant, watchPlantsByZone

### Community 74 - "Mobile Automation Config Service"
Cohesion: 0.25
Nodes (5): AutomationConfigService, _firestore, getConfig, saveConfig, saveFields

### Community 75 - "AI Plant Profiles"
Cohesion: 0.39
Nodes (6): buildPlantProfileMessages(), clamp(), LIGHT, num(), titleCase(), validatePlantProfile()

### Community 76 - "Mobile Firebase Options"
Cohesion: 0.29
Nodes (3): android, DefaultFirebaseOptions, ios

### Community 77 - "Dart Analyzer Config"
Cohesion: 0.33
Nodes (5): analyzer, exclude, include, linter, rules

### Community 78 - "Mobile Bottom Nav"
Cohesion: 0.33
Nodes (4): AppBottomNav, build, currentIndex, onTabSelected

### Community 79 - "Demo Data Seeder"
Cohesion: 0.40
Nodes (3): db, rand(), seed()

### Community 80 - "Server npm Scripts"
Cohesion: 0.40
Nodes (5): scripts, dev, start, test, test:integration

### Community 81 - "Sim Camera Morning Frame"
Cohesion: 0.67
Nodes (4): Simulated ESP32-CAM Morning Snapshot, Four Potted Seedlings on Shelf, Morning Time-of-Day Scene, GrowNex Simulated ESP32-CAM

### Community 82 - "Sim Camera Night Frame"
Cohesion: 0.67
Nodes (4): Four Potted Seedlings on Shelf, Grow Light On at Night (pink/purple overhead bar), Night Grow-Light Camera Frame (simulated ESP32-CAM), GrowNex Simulated ESP32-CAM

### Community 83 - "Win32 Point Struct"
Cohesion: 0.50
Nodes (3): Point, x, y

### Community 84 - "Win32 Size Struct"
Cohesion: 0.50
Nodes (3): Size, height, width

### Community 85 - "Sim Camera Midday Frame"
Cohesion: 1.00
Nodes (3): Simulated ESP32-CAM Midday Frame, Four Potted Plants Scene, Simulated ESP32-CAM

### Community 86 - "Sim Camera Evening Frame"
Cohesion: 0.67
Nodes (3): Simulated ESP32-CAM Evening Frame (3-evening.jpg), Four Potted Plants on Windowsill (zone plant slots), GrowNex Simulated ESP32-CAM Feed (caption overlay)

### Community 88 - "HTML Shells"
Cohesion: 0.67
Nodes (3): Flutter web shell (flutter_bootstrap.js, $FLUTTER_BASE_HREF), Roboto from Google Fonts, Web dashboard HTML shell (#root, /src/main.jsx)

## Knowledge Gaps
- **821 isolated node(s):** `name`, `ranKey`, `maxOnMs`, `cmd`, `onSince` (+816 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1141 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Zone` connect `Mobile Zone Cards` to `Mobile Zone Overview & Camera`, `Mobile Plants Tab`, `Mobile Automation Tab`, `Mobile Plant Detail`, `Mobile Zone Fit`, `Mobile Zone Model`, `Mobile Monitoring Tab`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `ranKey`, `maxOnMs` to the rest of the system?**
  _821 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Architecture Docs & Concepts` be split into smaller, more focused modules?**
  _Cohesion score 0.053750597228858096 - nodes in this community are weakly interconnected._
- **Why does `firebase-admin` connect `Server Express & Auth Middleware` to `AI Plan Validation`, `Server Dependencies`, `MQTT Bridge & Notifications`, `AI Routes & Client`, `Device Simulator & Tests`, `Demo Data Seeder`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Should `MQTT Bridge & Notifications` be split into smaller, more focused modules?**
  _Cohesion score 0.05926251097453907 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Web Layout, Theme & Notifications` to `Web Analytics Logic`, `Web Firebase & Monitoring Tab`, `Web Zone Overview & Camera`, `Web Profile & Automation Tab`, `Web Client Deps & Tailwind`, `Web Dashboard/Devices/Plants Pages`, `Web Zone Detail & Plants Tab`, `Web Auth & Routing`, `Web Device Detail & Dialogs`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Should `Web Analytics Logic` be split into smaller, more focused modules?**
  _Cohesion score 0.07067307692307692 - nodes in this community are weakly interconnected._