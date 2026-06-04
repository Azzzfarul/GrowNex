#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── WiFi ─────────────────────────────────────────────────────────────────────
const char* SSID     = "Kanon";
const char* PASSWORD = "1sampai9";

// ─── MQTT Broker ──────────────────────────────────────────────────────────────
const char* MQTT_BROKER = "broker.hivemq.com";
const int   MQTT_PORT   = 1883;

const unsigned long PUBLISH_INTERVAL_MS = 5000;

// ─── Actuator Pins (relay: HIGH = ON) ─────────────────────────────────────────
#define PIN_LIGHT       25
#define PIN_FERTILIZER  26
#define PIN_IRRIGATION  27

// ─── Runtime state ────────────────────────────────────────────────────────────
String DEVICE_ID;
String TOPIC_SENSORS;
String TOPIC_STATUS;
String TOPIC_ACTUATOR_STATE;
String TOPIC_ACTUATOR_CMD;

bool lightState      = false;
bool fertilizerState = false;
bool irrigationState = false;

unsigned long lastPublish = 0;

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// ─── Dummy sensor data ────────────────────────────────────────────────────────
float dummyTemp      = 24.0;
float dummyHumidity  = 55.0;
float dummyLight     = 300.0;
float dummyMoisture  = 40.0;

// ─── Actuator helpers ─────────────────────────────────────────────────────────
void applyActuators() {
  digitalWrite(PIN_LIGHT,      lightState      ? HIGH : LOW);
  digitalWrite(PIN_FERTILIZER, fertilizerState ? HIGH : LOW);
  digitalWrite(PIN_IRRIGATION, irrigationState ? HIGH : LOW);
}

void publishActuatorState() {
  StaticJsonDocument<128> doc;
  doc["deviceId"]        = DEVICE_ID;
  doc["lightState"]      = lightState;
  doc["fertilizerState"] = fertilizerState;
  doc["irrigationState"] = irrigationState;
  char buf[128];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_ACTUATOR_STATE.c_str(), buf, true);
}

// ─── MQTT incoming command ────────────────────────────────────────────────────
// Expected: { "lightState": bool, "fertilizerState": bool, "irrigationState": bool }
void onMessage(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, payload, len)) return;

  if (doc.containsKey("lightState"))      lightState      = doc["lightState"];
  if (doc.containsKey("fertilizerState")) fertilizerState = doc["fertilizerState"];
  if (doc.containsKey("irrigationState")) irrigationState = doc["irrigationState"];

  applyActuators();
  publishActuatorState();
  Serial.printf("[MQTT] cmd → light=%d  fert=%d  irrig=%d\n",
                lightState, fertilizerState, irrigationState);
}

// ─── Publish sensors ──────────────────────────────────────────────────────────
void publishSensors() {
  StaticJsonDocument<256> doc;
  doc["deviceId"]    = DEVICE_ID;
  doc["temperature"] = dummyTemp;
  doc["humidity"]    = dummyHumidity;
  doc["lightLevel"]  = dummyLight;
  doc["moisture"]    = dummyMoisture;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_SENSORS.c_str(), buf);
  Serial.printf("[MQTT] sensors → %s\n", buf);

  dummyTemp     += 0.1;
  dummyHumidity += 0.2;
  dummyLight    += 5.0;
  dummyMoisture -= 0.3;
}

// ─── Connection ───────────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("Connecting to %s", SSID);
  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.printf("\nWiFi OK — IP: %s\n", WiFi.localIP().toString().c_str());
}

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.printf("Connecting to MQTT %s ...\n", MQTT_BROKER);
    bool ok = mqtt.connect(
      DEVICE_ID.c_str(), "", "",
      TOPIC_STATUS.c_str(), 1, true, "offline"
    );
    if (ok) {
      mqtt.publish(TOPIC_STATUS.c_str(), "online", true);
      mqtt.subscribe(TOPIC_ACTUATOR_CMD.c_str());
      Serial.printf("MQTT OK — device: %s\n", DEVICE_ID.c_str());
      Serial.printf("  sub command: %s\n", TOPIC_ACTUATOR_CMD.c_str());
    } else {
      Serial.printf("MQTT failed (rc=%d), retry in 3s\n", mqtt.state());
      delay(3000);
    }
  }
}

// ─── Setup / Loop ─────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

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
  applyActuators();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setCallback(onMessage);

  connectWiFi();
  connectMQTT();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected())             connectMQTT();
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishSensors();
    publishActuatorState();
  }
}
