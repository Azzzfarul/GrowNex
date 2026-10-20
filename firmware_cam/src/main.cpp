// GrowNex camera node — AI-Thinker ESP32-CAM.
// Takes one JPEG per 4-hour UTC bucket (00/04/08/12/16/20) plus one right after boot,
// and publishes it as a raw binary payload to grownex/{DEVICE_ID}/camera. The server's
// MQTT bridge stores it in Firebase Storage + zones/{zoneId}/snapshots once this camera
// is claimed and assigned to a zone (Devices page → zone Overview → Camera).

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <time.h>
#include "esp_camera.h"

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

// ─── Capture settings ─────────────────────────────────────────────────────────
#define FRAME_SIZE      FRAMESIZE_SVGA  // 800x600 ≈ 30–80 KB; FRAMESIZE_XGA (1024x768) for more detail
#define JPEG_QUALITY    12              // 0–63, lower = better quality + bigger file
#define CAM_VFLIP       false           // flip these to match how the camera is mounted
#define CAM_HMIRROR     false
#define USE_FLASH       false           // light the onboard flash LED (GPIO 4) while capturing
#define WARMUP_FRAMES   3               // discarded before each shot: lets auto-exposure settle and
                                        // flushes the stale frame left in the buffer since last capture

const unsigned long RETRY_INTERVAL_MS = 5UL * 60 * 1000;  // after a failed capture/publish
const size_t        PUBLISH_CHUNK     = 4096;

// ─── AI-Thinker ESP32-CAM pin map ─────────────────────────────────────────────
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22
#define FLASH_LED_PIN    4

// ─── Runtime state ────────────────────────────────────────────────────────────
String DEVICE_ID;
String TOPIC_STATUS;
String TOPIC_CAMERA;

String        lastUploadedBucket;   // 4h bucket of the last successful publish
unsigned long lastAttempt = 0;

WiFiClientSecure wifiClient;
PubSubClient     mqtt(wifiClient);

// ─── Camera ───────────────────────────────────────────────────────────────────
void initCamera() {
  camera_config_t config = {};
  config.ledc_channel  = LEDC_CHANNEL_0;
  config.ledc_timer    = LEDC_TIMER_0;
  config.pin_d0        = Y2_GPIO_NUM;
  config.pin_d1        = Y3_GPIO_NUM;
  config.pin_d2        = Y4_GPIO_NUM;
  config.pin_d3        = Y5_GPIO_NUM;
  config.pin_d4        = Y6_GPIO_NUM;
  config.pin_d5        = Y7_GPIO_NUM;
  config.pin_d6        = Y8_GPIO_NUM;
  config.pin_d7        = Y9_GPIO_NUM;
  config.pin_xclk      = XCLK_GPIO_NUM;
  config.pin_pclk      = PCLK_GPIO_NUM;
  config.pin_vsync     = VSYNC_GPIO_NUM;
  config.pin_href      = HREF_GPIO_NUM;
  config.pin_sccb_sda  = SIOD_GPIO_NUM;
  config.pin_sccb_scl  = SIOC_GPIO_NUM;
  config.pin_pwdn      = PWDN_GPIO_NUM;
  config.pin_reset     = RESET_GPIO_NUM;
  config.xclk_freq_hz  = 10000000;
  config.pixel_format  = PIXFORMAT_JPEG;
  config.frame_size    = FRAME_SIZE;
  config.jpeg_quality  = JPEG_QUALITY;
  config.fb_count      = 1;
  config.fb_location   = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.grab_mode     = CAMERA_GRAB_WHEN_EMPTY;

  if (!psramFound()) {
    Serial.println("[CAM] no PSRAM — falling back to VGA");
    config.frame_size = FRAMESIZE_VGA;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("[CAM] init failed (0x%x) — restarting in 10s\n", err);
    delay(10000);
    ESP.restart();
  }

  sensor_t* s = esp_camera_sensor_get();
  s->set_vflip(s, CAM_VFLIP);
  s->set_hmirror(s, CAM_HMIRROR);
  Serial.println("[CAM] ready");
}

camera_fb_t* captureFrame() {
  if (USE_FLASH) digitalWrite(FLASH_LED_PIN, HIGH);
  for (int i = 0; i < WARMUP_FRAMES; i++) {
    camera_fb_t* fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
    delay(100);
  }
  camera_fb_t* fb = esp_camera_fb_get();
  if (USE_FLASH) digitalWrite(FLASH_LED_PIN, LOW);
  return fb;
}

// ─── Publish ──────────────────────────────────────────────────────────────────
// Streams the JPEG straight from the frame buffer — PubSubClient's own buffer
// (setBufferSize, max 64 KB) never has to hold the whole image.
bool publishImage(const camera_fb_t* fb) {
  if (!mqtt.beginPublish(TOPIC_CAMERA.c_str(), fb->len, false)) return false;

  size_t sent = 0;
  while (sent < fb->len) {
    size_t n = min(PUBLISH_CHUNK, fb->len - sent);
    size_t written = mqtt.write(fb->buf + sent, n);
    if (written == 0) {
      // Half-sent packet — drop the connection so connectMQTT() starts clean.
      wifiClient.stop();
      return false;
    }
    sent += written;
  }
  return mqtt.endPublish();
}

bool captureAndPublish() {
  camera_fb_t* fb = captureFrame();
  if (!fb) {
    Serial.println("[CAM] capture failed");
    return false;
  }

  bool ok = publishImage(fb);
  if (ok) Serial.printf("[MQTT] published %u bytes → %s\n", fb->len, TOPIC_CAMERA.c_str());
  else    Serial.println("[MQTT] image publish failed");

  esp_camera_fb_return(fb);
  return ok;
}

// Same bucketing as the dashboard (photoUpload.js fourHourBucketId): "2026-01-15T12".
bool currentBucket(char* out, size_t len) {
  time_t now = time(nullptr);
  if (now < 1700000000) return false;  // NTP not synced yet
  struct tm t;
  gmtime_r(&now, &t);
  t.tm_hour = (t.tm_hour / 4) * 4;
  strftime(out, len, "%Y-%m-%dT%H", &t);
  return true;
}

// ─── Connection ───────────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.printf("Connecting to %s", SSID);
  WiFi.begin(SSID, PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > 30000) {
      Serial.println("\nWiFi timeout — restarting");
      ESP.restart();
    }
    delay(500);
    Serial.print(".");
  }
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

  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  initCamera();

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // modem sleep makes large uploads crawl
  wifiClient.setInsecure();  // skip cert verification — HiveMQ Cloud uses valid TLS

  uint8_t mac[6];
  WiFi.macAddress(mac);
  DEVICE_ID = "ESP32CAM-";
  for (int i = 0; i < 6; i++) {
    if (mac[i] < 0x10) DEVICE_ID += "0";
    DEVICE_ID += String(mac[i], HEX);
  }
  DEVICE_ID.toUpperCase();

  TOPIC_STATUS = "grownex/" + DEVICE_ID + "/status";
  TOPIC_CAMERA = "grownex/" + DEVICE_ID + "/camera";

  Serial.printf("Device ID: %s\n", DEVICE_ID.c_str());

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  mqtt.setKeepAlive(30);
  mqtt.setSocketTimeout(30);

  connectWiFi();
  configTime(0, 0, "pool.ntp.org", "time.google.com");  // UTC — buckets are UTC
  connectMQTT();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();
  if (!mqtt.connected())             connectMQTT();
  mqtt.loop();

  char bucket[16];
  if (!currentBucket(bucket, sizeof(bucket))) return;
  if (lastUploadedBucket == bucket) return;
  if (lastAttempt && millis() - lastAttempt < RETRY_INTERVAL_MS) return;

  lastAttempt = millis();
  if (captureAndPublish()) lastUploadedBucket = bucket;
}
