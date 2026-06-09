#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ─── WiFi ─────────────────────────────────────────────────────────────────────
const char* SSID     = "Kanon";
const char* PASSWORD = "1sampai9";

// ─── MQTT Broker ──────────────────────────────────────────────────────────────
const char* MQTT_BROKER = "b6da2a10099e464284c8e7011e086e00.s1.eu.hivemq.cloud";
const int   MQTT_PORT   = 8883;
const char* MQTT_USER   = "grownex-iot";
const char* MQTT_PASS   = "Abcd_123456";

const unsigned long PUBLISH_INTERVAL_MS = 60000; // 30 seconds

// ─── Sensors ──────────────────────────────────────────────────────────────────
#define DHT_PIN      4    // DHT11 data pin
#define DHT_TYPE     DHT11
#define MOISTURE_PIN 34   // Soil moisture AO pin

// Calibrate these to your sensor (check raw values in Serial Monitor)
#define MOISTURE_DRY 4095
#define MOISTURE_WET 1500

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

WiFiClientSecure wifiClient;
PubSubClient     mqtt(wifiClient);
DHT          dht(DHT_PIN, DHT_TYPE);

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

// ─── Read & publish sensors ───────────────────────────────────────────────────
void publishSensors() {
  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();

  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("[DHT11] read failed — skipping publish");
    return;
  }

  int rawMoisture = analogRead(MOISTURE_PIN);
  float moisture  = constrain(map(rawMoisture, MOISTURE_DRY, MOISTURE_WET, 0, 100), 0, 100);

  float lightLevel = 300.0;  // TODO: replace with real LDR read

  StaticJsonDocument<256> doc;
  doc["deviceId"]    = DEVICE_ID;
  doc["temperature"] = temperature;
  doc["humidity"]    = humidity;
  doc["lightLevel"]  = lightLevel;
  doc["soilMoisture1"] = moisture;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_SENSORS.c_str(), buf);
  Serial.printf("[MQTT] sensors → temp=%.1f°C  humid=%.1f%%  soilMoisture1=%.1f%%  light=%.1f\n",
                temperature, humidity, moisture, lightLevel);
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
      DEVICE_ID.c_str(), MQTT_USER, MQTT_PASS,
      TOPIC_STATUS.c_str(), 1, true, "offline"
    );
    if (ok) {
      mqtt.publish(TOPIC_STATUS.c_str(), "online", true);
      mqtt.subscribe(TOPIC_ACTUATOR_CMD.c_str());
      Serial.printf("MQTT OK — device: %s\n", DEVICE_ID.c_str());
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
