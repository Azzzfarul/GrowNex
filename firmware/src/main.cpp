#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Preferences.h>

// ─── Credentials ──────────────────────────────────────────────────────────────
// WiFi/MQTT credentials live in include/secrets.h (gitignored).
#if __has_include("secrets.h")
#include "secrets.h"
#else
#error "Missing include/secrets.h: copy include/secrets.example.h to include/secrets.h and fill in your credentials"
#endif

// ─── WiFi ─────────────────────────────────────────────────────────────────────
const char* SSID     = WIFI_SSID;
const char* PASSWORD = WIFI_PASSWORD;

// ─── MQTT Broker ──────────────────────────────────────────────────────────────
const char* MQTT_BROKER = MQTT_HOST;
const int   MQTT_PORT   = 8883;
const char* MQTT_USER   = MQTT_USERNAME;
const char* MQTT_PASS   = MQTT_PASSWORD;

const unsigned long PUBLISH_INTERVAL_MS = 60000;          // 60 seconds
const unsigned long RETRY_MS            = 10000;          // WiFi / MQTT reconnect attempt gap
const unsigned long REBOOT_AFTER_MS     = 10UL * 60000;   // offline this long → restart (unwedges the WiFi/TLS stack)

// ─── Sensors ──────────────────────────────────────────────────────────────────
// Power the analog modules from 3.3V, not 5V: the ESP32 ADC pins take at most 3.3V.
// Analog pins must be ADC1 (GPIO 32–39); ADC2 pins don't work while WiFi is on.
#define DHT_PIN      4    // DHT11 data pin
#define DHT_TYPE     DHT11
#define LIGHT_PIN    35   // Light sensor (LDR) module AO pin
// Capacitive soil moisture sensor v1.2 AOUT pins for plant slots 1–4 (soilMoisture1..4).
const int MOISTURE_PINS[4] = {34, 32, 33, 36};

// Calibrate these to your modules: read the raw values in the Serial Monitor
// (soil: each probe in dry air vs. in a glass of water, since every probe reads a bit differently;
//  light: covered vs. under the grow light).
const int MOISTURE_DRY[4] = {2800, 2800, 2800, 2800};
const int MOISTURE_WET[4] = {1200, 1200, 1200, 1200};
#define LIGHT_DARK   4095  // LDR modules read high in the dark
#define LIGHT_BRIGHT 0

// ─── 4-channel relay module pins ──────────────────────────────────────────────
#define PIN_LIGHT       25  // IN1
#define PIN_FERTILIZER  26  // IN2
#define PIN_IRRIGATION  27  // IN3
#define PIN_SPARE       13  // IN4: no actuator for it in the app yet, so it's held off
// Match the relay module's trigger jumper: H = switches on when IN is HIGH, L = when LOW.
#define RELAY_ON  HIGH
#define RELAY_OFF (RELAY_ON == LOW ? HIGH : LOW)

// ─── Runtime state ────────────────────────────────────────────────────────────
String DEVICE_ID;
String TOPIC_SENSORS;
String TOPIC_STATUS;
String TOPIC_ACTUATOR_STATE;
String TOPIC_ACTUATOR_CMD;

// What the relays are doing now (reported as the actuator state). Only on while online and commanded.
bool lightState      = false;
bool fertilizerState = false;
bool irrigationState = false;

// Pump safety limit. The bridge's "off" can be lost (server restart mid-cycle, a manual toggle left on),
// so each pump stops on its own this long after its "on" command, counting time offline too. It then
// ignores "on" until an "off" arrives. The latch and the time run so far are kept in flash, so a reboot
// (say, a brownout each time the pump starts) can neither restart the pump nor restart its countdown.
// Longer than the longest runs the app allows (watering 15 min, fertilizing 30 min).
struct Pump {
  const char*   name;      // also its latch's flash key and the "<name>TimedOut" field in the state
  const char*   ranKey;    // flash key of the time run so far
  unsigned long maxOnMs;
  bool          cmd;       // last command
  unsigned long onSince;   // millis() at which the current "on" would have started
  bool          timedOut;
  unsigned long savedMs;   // run time last written to flash
};
Pump irrigation = {"irrigation", "irrigationRan", 20UL * 60000, false, 0, false, 0};
Pump fertilizer = {"fertilizer", "fertilizerRan", 40UL * 60000, false, 0, false, 0};
bool lightCmd = false;
Preferences prefs;

unsigned long lastPublish = 0;
unsigned long lastRetry   = 0;
unsigned long lastOnline  = 0;

WiFiClientSecure wifiClient;
PubSubClient     mqtt(wifiClient);
DHT          dht(DHT_PIN, DHT_TYPE);

// ─── Actuator helpers ─────────────────────────────────────────────────────────
// Offline, nothing may run: no command (including the bridge's auto-off) can reach us.
void applyActuators() {
  bool live = WiFi.status() == WL_CONNECTED && mqtt.connected();
  lightState      = live && lightCmd;
  fertilizerState = live && fertilizer.cmd && !fertilizer.timedOut;
  irrigationState = live && irrigation.cmd && !irrigation.timedOut;
  digitalWrite(PIN_LIGHT,      lightState      ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_FERTILIZER, fertilizerState ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_IRRIGATION, irrigationState ? RELAY_ON : RELAY_OFF);
}

void publishActuatorState() {
  JsonDocument doc;
  doc["deviceId"]        = DEVICE_ID;
  doc["lightState"]      = lightState;
  doc["fertilizerState"] = fertilizerState;
  doc["irrigationState"] = irrigationState;
  if (fertilizer.timedOut) doc["fertilizerTimedOut"] = true;  // the bridge then switches its intent off
  if (irrigation.timedOut) doc["irrigationTimedOut"] = true;
  char buf[192];  // max payload ≈ 152 bytes
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_ACTUATOR_STATE.c_str(), buf, true);
}

void setTimedOut(Pump& p, bool v) {
  if (p.timedOut == v) return;
  p.timedOut = v;
  prefs.putBool(p.name, v);
}

void saveRan(Pump& p, unsigned long ms) {
  if (p.savedMs == ms) return;
  p.savedMs = ms;
  prefs.putULong(p.ranKey, ms);
}

void commandPump(Pump& p, JsonVariantConst v) {
  if (!v.is<bool>()) return;
  bool on = v.as<bool>();
  // An "on" right after boot carries on from the time already run: it's the retained command the
  // pump was running before the reboot (or, rarely, a new one, which then just stops sooner).
  if (on && !p.cmd) p.onSince = millis() - p.savedMs;
  if (!on) { setTimedOut(p, false); saveRan(p, 0); }  // only an explicit "off" releases the latch
  p.cmd = on;
}

void checkPumpLimit(Pump& p) {
  if (!p.cmd || p.timedOut) return;
  unsigned long ran = millis() - p.onSince;
  if (ran < p.maxOnMs) {
    if (ran - p.savedMs >= 60000) saveRan(p, ran);  // at most one flash write a minute
    return;
  }
  setTimedOut(p, true);
  applyActuators();
  publishActuatorState();  // if offline, the next reading after reconnecting re-sends it
  Serial.printf("[SAFE] %s on too long — off until the next \"off\" command\n", p.name);
}

// ─── MQTT incoming command ────────────────────────────────────────────────────
void onMessage(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;

  if (doc["lightState"].is<bool>()) lightCmd = doc["lightState"];
  commandPump(fertilizer, doc["fertilizerState"]);
  commandPump(irrigation, doc["irrigationState"]);

  applyActuators();
  publishActuatorState();
  Serial.printf("[MQTT] cmd → light=%d  fert=%d  irrig=%d\n",
                lightState, fertilizerState, irrigationState);
}

// ─── Read & publish sensors ───────────────────────────────────────────────────
int readAdc(int pin) {  // average 16 samples: the ESP32 ADC is noisy
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogRead(pin);
  return sum / 16;
}

// raw0/raw100 are the calibration readings for 0 % and 100 % (either order)
int toPercent(int raw, int raw0, int raw100) {
  long p = map(raw, raw0, raw100, 0, 100);
  return constrain(p, 0, 100);
}

void publishSensors() {
  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();
  // Still publish on a failed DHT read: soil moisture drives threshold watering.
  if (isnan(temperature) || isnan(humidity)) Serial.println("[DHT11] read failed — sending null temp/humidity");

  int rawLight   = readAdc(LIGHT_PIN);
  int lightLevel = toPercent(rawLight, LIGHT_DARK, LIGHT_BRIGHT);  // 0 = dark, 100 = bright

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  if (isnan(temperature)) doc["temperature"] = nullptr; else doc["temperature"] = temperature;
  if (isnan(humidity))    doc["humidity"]    = nullptr; else doc["humidity"]    = humidity;
  doc["lightLevel"] = lightLevel;

  Serial.printf("[MQTT] sensors → temp=%.1f°C  humid=%.1f%%  light=%d%% (raw %d)  soil:",
                temperature, humidity, lightLevel, rawLight);
  for (int i = 0; i < 4; i++) {
    int raw      = readAdc(MOISTURE_PINS[i]);
    int moisture = toPercent(raw, MOISTURE_DRY[i], MOISTURE_WET[i]);
    doc["soilMoisture" + String(i + 1)] = moisture;
    Serial.printf("  %d=%d%% (raw %d)", i + 1, moisture, raw);
  }
  Serial.println();

  char buf[256];  // max payload ≈ 180 bytes, inside PubSubClient's default 256-byte packet
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_SENSORS.c_str(), buf);
}

// ─── Connection ───────────────────────────────────────────────────────────────
// Single attempts only; loop() retries every RETRY_MS so nothing blocks forever.
void connectMQTT() {
  Serial.printf("Connecting to MQTT %s ...\n", MQTT_BROKER);
  bool ok = mqtt.connect(
    DEVICE_ID.c_str(), MQTT_USER, MQTT_PASS,
    TOPIC_STATUS.c_str(), 1, true, "offline"
  );
  if (ok) {
    mqtt.publish(TOPIC_STATUS.c_str(), "online", true);
    mqtt.subscribe(TOPIC_ACTUATOR_CMD.c_str());  // the broker re-sends the retained command, restoring the intended state
    Serial.printf("MQTT OK — device: %s\n", DEVICE_ID.c_str());
  } else {
    Serial.printf("MQTT failed (rc=%d), retrying\n", mqtt.state());
  }
}

// Offline = no commands can reach us (including the bridge's auto-off), so nothing may keep running.
void failSafe() {
  // Drop the session without a DISCONNECT packet: the broker still publishes our "offline" will,
  // and the reconnect re-delivers the retained command even if the TCP link survived a short WiFi blip.
  if (mqtt.connected()) wifiClient.stop();
  if (lightState || fertilizerState || irrigationState) {
    applyActuators();  // all off; the commands are kept, so the pump limits keep counting
    Serial.println("[SAFE] offline — all actuators off");
  }
}

// ─── Setup / Loop ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  dht.begin();
  wifiClient.setInsecure();  // skip cert verification — HiveMQ Cloud uses valid TLS

  uint8_t mac[6];
  WiFi.macAddress(mac);
  DEVICE_ID = "ESP32-";
  for (int i = 0; i < 6; i++) {
    if (mac[i] < 0x10) DEVICE_ID += "0";
    DEVICE_ID += String(mac[i], HEX);
  }
  DEVICE_ID.toUpperCase();

  TOPIC_SENSORS        = "grownex/" + DEVICE_ID + "/sensors";
  TOPIC_STATUS         = "grownex/" + DEVICE_ID + "/status";
  TOPIC_ACTUATOR_STATE = "grownex/" + DEVICE_ID + "/actuators/state";
  TOPIC_ACTUATOR_CMD   = "grownex/" + DEVICE_ID + "/actuators/command";

  Serial.printf("Device ID: %s\n", DEVICE_ID.c_str());

  pinMode(PIN_LIGHT,      OUTPUT);
  pinMode(PIN_FERTILIZER, OUTPUT);
  pinMode(PIN_IRRIGATION, OUTPUT);
  pinMode(PIN_SPARE,      OUTPUT);
  digitalWrite(PIN_SPARE, RELAY_OFF);
  applyActuators();

  prefs.begin("grownex");
  for (Pump* p : {&irrigation, &fertilizer}) {
    p->timedOut = prefs.getBool(p->name, false);
    p->savedMs  = prefs.getULong(p->ranKey, 0);
  }

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMessage);

  Serial.printf("Connecting to %s\n", SSID);
  WiFi.begin(SSID, PASSWORD);  // non-blocking; loop() connects MQTT once WiFi is up
}

void loop() {
  checkPumpLimit(irrigation);
  checkPumpLimit(fertilizer);

  unsigned long now = millis();
  bool wifiUp = WiFi.status() == WL_CONNECTED;

  if (wifiUp && mqtt.connected()) {
    lastOnline = now;
  } else {
    failSafe();
    if (now - lastOnline >= REBOOT_AFTER_MS) { Serial.println("Offline too long — restarting"); ESP.restart(); }
    if (now - lastRetry >= RETRY_MS) {
      lastRetry = now;
      if (wifiUp) connectMQTT();
      else        WiFi.reconnect();  // the core's auto-reconnect gives up for good after e.g. "AP not found"
    }
  }
  mqtt.loop();

  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishSensors();
    publishActuatorState();
  }
}
