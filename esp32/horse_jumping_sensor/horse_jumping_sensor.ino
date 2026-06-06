/*
 * Horse Jumping Sensor Node
 * ESP32 + IR Beam Break  OR  VL53L0X Time-of-Flight
 *
 * Libraries needed (install via Arduino Library Manager):
 *   - ArduinoJson  (Benoit Blanchon)
 *   - Adafruit VL53L0X  (only if SENSOR_TYPE == SENSOR_VL53)
 *
 * Board: "ESP32 Dev Module" in Arduino IDE
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include "config.h"

#if SENSOR_TYPE == SENSOR_VL53
  #include <Wire.h>
  #include <Adafruit_VL53L0X.h>
  Adafruit_VL53L0X tof;
#endif

// ─── State ───────────────────────────────────────────────────────────────────
unsigned long lastTriggerMs    = 0;
unsigned long lastHeartbeatMs  = 0;
unsigned long lastWifiRetryMs  = 0;
bool          sensorReady      = false;

// ─── Helpers ─────────────────────────────────────────────────────────────────

void ledOn()  { digitalWrite(LED_PIN, HIGH); }
void ledOff() { digitalWrite(LED_PIN, LOW);  }

void blinkLed(int times, int onMs = 100, int offMs = 100) {
  for (int i = 0; i < times; i++) {
    ledOn();  delay(onMs);
    ledOff(); delay(offMs);
  }
}

int readBatteryPercent() {
#if BATTERY_ADC_PIN < 0
  return -1;
#else
  int raw = analogRead(BATTERY_ADC_PIN);
  // 12-bit ADC, 3.3V ref, voltage divider ÷2
  int mv = (int)((raw / 4095.0) * 3300 * 2);
  int pct = map(mv, BATTERY_EMPTY_MV, BATTERY_FULL_MV, 0, 100);
  return constrain(pct, 0, 100);
#endif
}

String buildServerBase() {
  return String("http://") + SERVER_HOST + ":" + SERVER_PORT;
}

// ─── WiFi ────────────────────────────────────────────────────────────────────

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected, IP: ");
    Serial.println(WiFi.localIP());
    blinkLed(3, 200, 100);
  } else {
    Serial.println("[WiFi] Failed, will retry...");
    blinkLed(1, 1000, 0);
  }
}

// ─── HTTP Requests ───────────────────────────────────────────────────────────

bool postTrigger(unsigned long timestampMs) {
  if (WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  String url = buildServerBase() + "/api/devices/" + DEVICE_ID + "/trigger";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<128> doc;
  doc["gateType"]  = GATE_TYPE;
  doc["timestamp"] = (long long)timestampMs;
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  bool ok = (code == 200);

  if (ok) {
    Serial.printf("[Trigger] OK — gate=%s ts=%lu\n", GATE_TYPE, timestampMs);
  } else {
    Serial.printf("[Trigger] FAILED — HTTP %d\n", code);
  }

  http.end();
  return ok;
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = buildServerBase() + "/api/devices/" + DEVICE_ID + "/heartbeat";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<64> doc;
  int bat = readBatteryPercent();
  if (bat >= 0) doc["battery"] = bat;
  doc["rssi"] = WiFi.RSSI();
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  if (code == 200) {
    String resp = http.getString();
    StaticJsonDocument<128> rDoc;
    if (!deserializeJson(rDoc, resp) && rDoc["restart"].as<bool>()) {
      Serial.println("[Config] Restart requested — restarting");
      http.end();
      delay(200);
      ESP.restart();
    }
    Serial.printf("[Heartbeat] OK — battery=%d%% rssi=%d\n", bat, (int)WiFi.RSSI());
  } else {
    Serial.printf("[Heartbeat] FAILED — HTTP %d\n", code);
  }
  http.end();
}

// ─── Sensor: IR Beam Break ───────────────────────────────────────────────────

#if SENSOR_TYPE == SENSOR_IR

void initSensor() {
  pinMode(IR_SENSOR_PIN, INPUT_PULLUP);
  sensorReady = true;
  Serial.println("[Sensor] IR beam break ready on pin " + String(IR_SENSOR_PIN));
}

bool sensorTriggered() {
  bool pinState = digitalRead(IR_SENSOR_PIN);
#if IR_ACTIVE_LOW
  return (pinState == LOW);
#else
  return (pinState == HIGH);
#endif
}

#endif // SENSOR_IR

// ─── Sensor: VL53L0X ─────────────────────────────────────────────────────────

#if SENSOR_TYPE == SENSOR_VL53

void initSensor() {
  Wire.begin(VL53_SDA_PIN, VL53_SCL_PIN);
  if (!tof.begin()) {
    Serial.println("[Sensor] VL53L0X NOT FOUND — check wiring!");
    sensorReady = false;
    return;
  }
  tof.startRangeContinuous();
  sensorReady = true;
  Serial.println("[Sensor] VL53L0X ready, trigger distance < " + String(VL53_TRIGGER_MM) + "mm");
}

bool sensorTriggered() {
  if (!tof.isRangeComplete()) return false;
  uint16_t mm = tof.readRangeResult();
  if (mm >= 8190) return false;  // 8190 = out of range / error
  return (mm < VL53_TRIGGER_MM);
}

#endif // SENSOR_VL53

// ─── Main ────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Horse Jumping Sensor Node ===");
  Serial.printf("Device: %s | Gate: %s\n", DEVICE_ID, GATE_TYPE);

  pinMode(LED_PIN, OUTPUT);
  ledOff();

  connectWifi();
  initSensor();

  if (!sensorReady) {
    // Rapid blink = sensor error
    while (true) {
      blinkLed(5, 50, 50);
      delay(1000);
    }
  }

  sendHeartbeat();
  lastHeartbeatMs = millis();

  Serial.println("[Ready] Waiting for sensor...");
  blinkLed(2, 500, 200);
}

void loop() {
  unsigned long now = millis();

  // ── WiFi watchdog ──────────────────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED && now - lastWifiRetryMs > WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetryMs = now;
    Serial.println("[WiFi] Reconnecting...");
    connectWifi();
  }

  // ── Heartbeat ──────────────────────────────────────────────────────────────
  if (now - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMs = now;
    sendHeartbeat();
  }

  // ── Sensor check ──────────────────────────────────────────────────────────
  if (sensorReady && sensorTriggered()) {
    if (now - lastTriggerMs > TRIGGER_COOLDOWN_MS) {
      lastTriggerMs = now;
      ledOn();
      Serial.printf("[TRIGGER] Gate=%s at %lu ms\n", GATE_TYPE, now);
      bool ok = postTrigger(now);
      if (ok) {
        blinkLed(2, 150, 100);
      } else {
        // Failed — fast blink warning
        blinkLed(5, 50, 50);
      }
      ledOff();
    }
  }

  delay(10);  // 10ms loop = 100Hz sampling
}
