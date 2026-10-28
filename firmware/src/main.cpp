#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

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

const unsigned long PUBLISH_INTERVAL_MS = 60000; // 60 seconds

// ─── Sensors ──────────────────────────────────────────────────────────────────
// Power the analog modules from 3.3V, not 5V: the ESP32 ADC pins take at most 3.3V.
// Analog pins must be ADC1 (GPIO 32–39); ADC2 pins don't work while WiFi is on.
#define DHT_PIN      4    // DHT11 data pin
#define DHT_TYPE     DHT11
#define MOISTURE_PIN 34   // Soil moisture module AO pin
#define LIGHT_PIN    35   // Light sensor (LDR) module AO pin

// Calibrate these to your modules: read the raw values in the Serial Monitor
// (soil: in dry air vs. in a glass of water; light: covered vs. under the grow light).
#define MOISTURE_DRY 4095
#define MOISTURE_WET 1500
#define LIGHT_DARK   4095  // LDR modules read high in the dark
#define LIGHT_BRIGHT 0

// ─── Relay module pins ────────────────────────────────────────────────────────
#define PIN_LIGHT       25
#define PIN_FERTILIZER  26
#define PIN_IRRIGATION  27
// Match the relay module's trigger jumper: H = switches on when IN is HIGH, L = when LOW.
#define RELAY_ON  HIGH
#define RELAY_OFF (RELAY_ON == LOW ? HIGH : LOW)

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
  char buf[128];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_ACTUATOR_STATE.c_str(), buf, true);
}

// ─── MQTT incoming command ────────────────────────────────────────────────────
void onMessage(char* topic, byte* payload, unsigned int len) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, len)) return;

  if (doc["lightState"].is<bool>())      lightState      = doc["lightState"];
  if (doc["fertilizerState"].is<bool>()) fertilizerState = doc["fertilizerState"];
  if (doc["irrigationState"].is<bool>()) irrigationState = doc["irrigationState"];

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

  int rawMoisture = readAdc(MOISTURE_PIN);
  int rawLight    = readAdc(LIGHT_PIN);
  int moisture    = toPercent(rawMoisture, MOISTURE_DRY, MOISTURE_WET);
  int lightLevel  = toPercent(rawLight, LIGHT_DARK, LIGHT_BRIGHT);  // 0 = dark, 100 = bright

  JsonDocument doc;
  doc["deviceId"] = DEVICE_ID;
  if (isnan(temperature)) doc["temperature"] = nullptr; else doc["temperature"] = temperature;
  if (isnan(humidity))    doc["humidity"]    = nullptr; else doc["humidity"]    = humidity;
  doc["lightLevel"]    = lightLevel;
  doc["soilMoisture1"] = moisture;

  char buf[256];
  serializeJson(doc, buf);
  mqtt.publish(TOPIC_SENSORS.c_str(), buf);
  Serial.printf("[MQTT] sensors → temp=%.1f°C  humid=%.1f%%  soil=%d%% (raw %d)  light=%d%% (raw %d)\n",
                temperature, humidity, moisture, rawMoisture, lightLevel, rawLight);
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
