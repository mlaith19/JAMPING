/*
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║      HORSE JUMPING TIMING SYSTEM — ESP32 Firmware v3.0          ║
 * ║      Universal — configure device type via setup portal          ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Libraries (Tools → Manage Libraries):                          ║
 * ║    RF24              by TMRh20                                   ║
 * ║    Adafruit VL53L0X  by Adafruit                                 ║
 * ║    ArduinoJson       by Benoit Blanchon                          ║
 * ║                                                                  ║
 * ║  Board: ESP32 Dev Module                                         ║
 * ║  Flash: 4MB  Partition: Default                                  ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 *  First-time setup:
 *  1. Flash this firmware to the ESP32.
 *  2. Connect your phone to the "HorseTimer-XXXX" WiFi network.
 *  3. Open http://192.168.4.1 to configure device type, name, and WiFi.
 *  4. The device will restart and connect automatically.
 *
 *  To reconfigure: hold the BOOT button (GPIO0) while powering on.
 */

// ──────────────────────────────────────────────────────────────────
//  PINS  (see WIRING.md)
// ──────────────────────────────────────────────────────────────────
#define PIN_BOOT     0    // BOOT button (hold on power-up → reset to portal)
#define PIN_PHOTO    27   // Optocoupler output  (active LOW = beam broken)
#define PIN_BAT      34   // Battery ADC  (100kΩ:100kΩ voltage divider)
#define PIN_LED       2   // Built-in LED
#define PIN_NRF_CE    4   // NRF24L01 CE
#define PIN_NRF_CSN   5   // NRF24L01 CSN
// SPI (fixed):  SCK=18  MISO=19  MOSI=23
// I2C (fixed):  SDA=21  SCL=22

// ──────────────────────────────────────────────────────────────────
//  BACKEND  (auto-discovered via UDP broadcast)
// ──────────────────────────────────────────────────────────────────
#define BACKEND_HOST  "horsetimer.local"
#define BACKEND_PORT  4000

// ──────────────────────────────────────────────────────────────────
//  TIMING & THRESHOLDS
// ──────────────────────────────────────────────────────────────────
#define DEBOUNCE_MS           50
#define TRIGGER_COOLDOWN_MS   2000
#define HEARTBEAT_MS          15000
#define BATTERY_REPORT_MS     60000
#define WIFI_RETRY_MS         10000
#define HTTP_TIMEOUT_MS       3000
#define PORTAL_TIMEOUT_MS     300000
#define NRF_CHANNEL           90
#define VL53_FALLEN_CM         8
#define VL53_BASELINE_READS   20
#define VL53_STABLE_MS        300
#define BAT_FULL_MV           4200
#define BAT_EMPTY_MV          3300
#define BAT_LOW_PCT           20

// ══════════════════════════════════════════════════════════════════
//  LIBRARIES
// ══════════════════════════════════════════════════════════════════
#include <WiFi.h>
#include <ESPmDNS.h>
#include <WiFiUDP.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <Wire.h>
#include <SPI.h>
#include <RF24.h>
#include <ArduinoJson.h>
#include <Adafruit_VL53L0X.h>

// ══════════════════════════════════════════════════════════════════
//  ENUMS
// ══════════════════════════════════════════════════════════════════
enum DevRole  : uint8_t { ROLE_RECEIVER=0, ROLE_START=1, ROLE_FINISH=2, ROLE_OBSTACLE=3 };
enum DevEvent : uint8_t { EVT_TRIGGER=0, EVT_HEARTBEAT=1, EVT_BATT=2,
                          EVT_OBSTACLE=3, EVT_FALLEN=4, EVT_ONLINE=5 };

// ══════════════════════════════════════════════════════════════════
//  NRF PACKET  — 32 bytes
// ══════════════════════════════════════════════════════════════════
struct __attribute__((packed)) NRFPkt {
  uint8_t  ver;
  char     id[12];
  uint8_t  role;
  uint8_t  evt;
  uint32_t seq;
  uint32_t ts;
  uint16_t mv;
  uint8_t  pct;
  uint8_t  obsNum;
  uint8_t  flags;
  uint8_t  cs;
  uint8_t  pad[3];
};
static_assert(sizeof(NRFPkt) == 32, "NRFPkt must be 32 bytes");

// ══════════════════════════════════════════════════════════════════
//  RUNTIME CONFIG  (loaded from NVS, persists across power cycles)
// ══════════════════════════════════════════════════════════════════
String  runtimeDevId        = "";
String  runtimeDevTypeStr   = "START";
DevRole runtimeRole         = ROLE_START;
int     runtimeObsNum       = 1;
int     runtimeVl53FallenMm = VL53_FALLEN_CM * 10;

DevRole typeStrToRole(const String& s) {
  if (s == "FINISH")   return ROLE_FINISH;
  if (s == "OBSTACLE") return ROLE_OBSTACLE;
  if (s == "RECEIVER") return ROLE_RECEIVER;
  return ROLE_START;
}

void generateDeviceId() {
  uint64_t chip = ESP.getEfuseMac();
  char buf[12];
  snprintf(buf, sizeof(buf), "HT_%06llX", chip & 0xFFFFFF);
  for (int i = 0; buf[i]; i++) buf[i] = toupper(buf[i]);
  runtimeDevId = String(buf);
}

// ══════════════════════════════════════════════════════════════════
//  GLOBAL STATE
// ══════════════════════════════════════════════════════════════════

// WiFi / Portal
Preferences   prefs;
WebServer     portalServer(80);
DNSServer     dnsServer;
bool          wifiConnected  = false;
bool          portalActive   = false;
unsigned long wifiRetryAt    = 0;
unsigned long portalStartAt  = 0;
String        savedSSID, savedPass;

// WiFi scan cache
String scannedNets[20];
int    scannedCount = 0;

// Server resolution
String resolvedServerIP = BACKEND_HOST;

// NRF24L01
RF24          radio(PIN_NRF_CE, PIN_NRF_CSN);
const uint8_t NRF_ADDR[5] = {'H','G','A','T','E'};
uint32_t      nrfSeq   = 0;
bool          nrfReady = false;

// Photo sensor (all modes except RECEIVER)
bool          photoState     = false;
bool          photoFired     = false;
unsigned long photoLowAt     = 0;
unsigned long lastGateTrigAt = 0;

// VL53L0X (OBSTACLE mode)
Adafruit_VL53L0X tof;
bool     tofReady          = false;
int32_t  tofBaseline       = -1;
int      baselineCount     = 0;
int32_t  baselineSum       = 0;
bool     tofFallen         = false;
bool     tofFallenReported = false;
unsigned long tofFallenAt  = 0;
unsigned long lastObsAt    = 0;

// Timers
unsigned long lastHeartbeatAt = 0;
unsigned long lastBatteryAt   = 0;

// LED
enum LedMode { LED_OFF, LED_ON, LED_FAST, LED_SLOW, LED_PULSE };
LedMode       ledMode  = LED_OFF;
bool          ledState = false;
unsigned long ledAt    = 0;

// RECEIVER mode
struct KnownDev { char id[12]; unsigned long lastAt; bool online; };
KnownDev knownDevs[16];
int      knownDevCount  = 0;
uint32_t lastSeqs[16]   = {0};

// ══════════════════════════════════════════════════════════════════
//  LED
// ══════════════════════════════════════════════════════════════════
void ledSet(LedMode m) { ledMode = m; }

void ledUpdate() {
  unsigned long now = millis();
  switch (ledMode) {
    case LED_OFF:   digitalWrite(PIN_LED, LOW);  return;
    case LED_ON:    digitalWrite(PIN_LED, HIGH); return;
    case LED_FAST:
      if (now - ledAt >= 100) { ledState = !ledState; digitalWrite(PIN_LED, ledState); ledAt = now; }
      break;
    case LED_SLOW:
      if (now - ledAt >= 500) { ledState = !ledState; digitalWrite(PIN_LED, ledState); ledAt = now; }
      break;
    case LED_PULSE:
      if (now - ledAt >= 2000) { digitalWrite(PIN_LED, HIGH); }
      if (now - ledAt >= 2100) { digitalWrite(PIN_LED, LOW); ledAt = now; }
      break;
  }
}

void ledBlink(int n, int onMs = 120, int offMs = 80) {
  LedMode prev = ledMode;
  for (int i = 0; i < n; i++) {
    digitalWrite(PIN_LED, HIGH); delay(onMs);
    digitalWrite(PIN_LED, LOW);  delay(offMs);
  }
  ledMode = prev;
}

// ══════════════════════════════════════════════════════════════════
//  BATTERY
// ══════════════════════════════════════════════════════════════════
uint16_t readBatMv() {
  int raw = analogRead(PIN_BAT);
  return (uint16_t)((raw / 4095.0f) * 3300.0f * 2.0f);
}

uint8_t readBatPct() {
  uint16_t mv = readBatMv();
  int pct = (int)((float)(mv - BAT_EMPTY_MV) / (BAT_FULL_MV - BAT_EMPTY_MV) * 100.0f);
  return (uint8_t)constrain(pct, 0, 100);
}

// ══════════════════════════════════════════════════════════════════
//  PORTAL HTML
// ══════════════════════════════════════════════════════════════════
const char PORTAL_HTML[] PROGMEM = R"rawhtml(<!DOCTYPE html>
<html><head><meta charset=UTF-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>HorseTimer Setup</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:#111827;color:#f9fafb;
  display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}
.card{background:#1f2937;border-radius:14px;padding:1.75rem;width:100%;max-width:420px}
h1{color:#f59e0b;font-size:1.4rem;margin-bottom:.2rem}
.sub{color:#9ca3af;font-size:.85rem;margin-bottom:1.5rem}
label{display:block;color:#9ca3af;font-size:.72rem;text-transform:uppercase;
  letter-spacing:.05em;margin:.85rem 0 .25rem}
input,select{display:block;width:100%;padding:.7rem 1rem;background:#374151;
  border:1px solid #4b5563;border-radius:8px;color:#f9fafb;font-size:1rem}
input:focus,select:focus{outline:none;border-color:#f59e0b}
select option{background:#374151}
.hint{color:#6b7280;font-size:.72rem;margin-top:.3rem}
.cur{color:#f59e0b;font-size:.75rem;margin-bottom:.2rem}
button{width:100%;padding:.85rem;background:#f59e0b;color:#111827;
  border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;margin-top:1.5rem}
</style></head>
<body><div class=card>
<h1>&#127943; HorseTimer</h1>
<p class=sub>Device Setup</p>
<form action=/save method=POST>

<label>Device ID</label>
<input type=text name=d value="%DID%" maxlength=15 required
  autocorrect=off autocapitalize=none placeholder="e.g. START_01">
<p class=hint>Unique name shown in the app (max 15 chars, no spaces)</p>

<label>Device Type</label>
<select name=t id=dtyp onchange="upd()">
  <option value=START %SS%>START &#8212; &#9193; שער כניסה</option>
  <option value=FINISH %SF%>FINISH &#8212; &#9194; שער יציאה</option>
  <option value=OBSTACLE %SO%>OBSTACLE &#8212; &#127944; מכשול</option>
  <option value=RECEIVER %SR%>RECEIVER &#8212; &#128225; מקלט NRF</option>
</select>

<div id=obs>
<label>Obstacle Number (1&#8211;15)</label>
<input type=number name=o min=1 max=15 value="%ON%">

<label>VL53 Detection Threshold (cm)</label>
  <input type=number name=v min=1 max=200 value="%VM%">
  <p class=hint>How many cm the bar must rise for the sensor to detect a fall</p>
</div>

<label>WiFi Network (SSID)</label>
%SH%
<input type=text name=s id=ssid list=nl
  placeholder="Select or type network name" required
  autocomplete=off autocorrect=off autocapitalize=none>
<datalist id=nl></datalist>

<label>WiFi Password</label>
<input type=password name=p placeholder="Leave empty for open network">

<label>Server Address (optional)</label>
%HH%
<input type=text name=h value="%HV%"
  placeholder="Leave empty — auto-discovered"
  autocomplete=off autocorrect=off autocapitalize=none>
<p class=hint>Only needed if auto-discovery fails on your network</p>

<button type=submit>Save &#38; Connect &#10003;</button>
</form></div>
<script>
function upd(){
  var t=document.getElementById('dtyp').value;
  document.getElementById('obs').style.display=t==='OBSTACLE'?'block':'none';
}
upd();
fetch('/scan').then(function(r){return r.json()}).then(function(a){
  var d=document.getElementById('nl');
  a.forEach(function(n){var o=document.createElement('option');o.value=n;d.appendChild(o)});
}).catch(function(){});
</script>
</body></html>)rawhtml";

const char SAVED_HTML[] PROGMEM = R"rawhtml(<!DOCTYPE html>
<html><head><meta charset=UTF-8>
<meta http-equiv=refresh content=12>
<title>Saved!</title>
<style>body{font-family:sans-serif;background:#111827;color:#f9fafb;
  display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
</style></head><body>
<div>
  <div style="font-size:3.5rem">&#9989;</div>
  <h1 style="color:#10b981;margin:.5rem 0">Saved!</h1>
  <p style="color:#9ca3af">Device is restarting...<br>
  Please wait 12 seconds, then<br>reconnect to your main WiFi.</p>
</div></body></html>)rawhtml";

// ══════════════════════════════════════════════════════════════════
//  PORTAL HANDLERS
// ══════════════════════════════════════════════════════════════════
void handlePortalRoot() {
  String page = FPSTR(PORTAL_HTML);
  page.replace("%DID%", runtimeDevId);
  page.replace("%SS%",  runtimeDevTypeStr == "START"    ? "selected" : "");
  page.replace("%SF%",  runtimeDevTypeStr == "FINISH"   ? "selected" : "");
  page.replace("%SO%",  runtimeDevTypeStr == "OBSTACLE" ? "selected" : "");
  page.replace("%SR%",  runtimeDevTypeStr == "RECEIVER" ? "selected" : "");
  page.replace("%ON%",  String(runtimeObsNum > 0 ? runtimeObsNum : 1));
  page.replace("%VM%",  String(runtimeVl53FallenMm / 10));

  if (savedSSID.length() > 0)
    page.replace("%SH%", "<p class=cur>Currently: <b>" + savedSSID + "</b></p>");
  else
    page.replace("%SH%", "");

  String customHost = (resolvedServerIP != BACKEND_HOST) ? resolvedServerIP : "";
  if (customHost.length() > 0)
    page.replace("%HH%", "<p class=cur>Currently: <b>" + customHost + "</b></p>");
  else
    page.replace("%HH%", "");
  page.replace("%HV%", customHost);

  portalServer.send(200, "text/html", page);
}

void handlePortalSave() {
  // Device ID
  String d = portalServer.arg("d"); d.trim();
  if (d.length() == 0) d = runtimeDevId;

  // Device type
  String t = portalServer.arg("t");
  if (t != "START" && t != "FINISH" && t != "OBSTACLE" && t != "RECEIVER") t = "START";

  // Obstacle number
  int obsNum = portalServer.arg("o").toInt();
  if (obsNum < 1 || obsNum > 15) obsNum = 1;

  // VL53 threshold
  int vl53cm = portalServer.arg("v").toInt();
  if (vl53cm < 1 || vl53cm > 200) vl53cm = VL53_FALLEN_CM;
  int vl53mm = vl53cm * 10;

  // WiFi
  String s = portalServer.arg("s");
  String p = portalServer.arg("p");
  String h = portalServer.arg("h"); h.trim();

  if (s.length() == 0) {
    portalServer.send(400, "text/plain", "SSID required");
    return;
  }

  prefs.begin("wifi_cfg", false);
  prefs.putString("devid",  d);
  prefs.putString("dtype",  t);
  prefs.putInt   ("obsnum", obsNum);
  prefs.putInt   ("vl53mm", vl53mm);
  prefs.putString("ssid",   s);
  prefs.putString("pass",   p);
  if (h.length() > 0) prefs.putString("server", h);
  else                 prefs.remove("server");
  prefs.end();

  Serial.printf("[Portal] Saved: id=%s type=%s obs=%d ssid=%s\n",
                d.c_str(), t.c_str(), obsNum, s.c_str());
  portalServer.send(200, "text/html", FPSTR(SAVED_HTML));
  delay(2000);
  ESP.restart();
}

void handlePortalNotFound() {
  portalServer.sendHeader("Location", "http://192.168.4.1/", true);
  portalServer.send(302, "text/plain", "");
}

void handlePortalScan() {
  String json = "[";
  for (int i = 0; i < scannedCount; i++) {
    if (i) json += ",";
    String s = scannedNets[i];
    s.replace("\\", "\\\\");
    s.replace("\"", "\\\"");
    json += "\"" + s + "\"";
  }
  json += "]";
  portalServer.send(200, "application/json", json);
}

void doWifiScan() {
  Serial.println("[WiFi] Scanning networks...");
  WiFi.mode(WIFI_STA);
  int n = WiFi.scanNetworks(false, false);
  scannedCount = (n < 0) ? 0 : min(n, 20);
  for (int i = 0; i < scannedCount; i++) scannedNets[i] = WiFi.SSID(i);
  WiFi.scanDelete();
  Serial.printf("[WiFi] Found %d networks\n", scannedCount);
}

void startPortal() {
  portalActive  = true;
  portalStartAt = millis();

  doWifiScan();

  uint8_t mac[6];
  WiFi.macAddress(mac);
  String apName = "HorseTimer-";
  if (mac[4] < 0x10) apName += "0";
  apName += String(mac[4], HEX);
  if (mac[5] < 0x10) apName += "0";
  apName += String(mac[5], HEX);
  apName.toUpperCase();

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str());
  delay(200);

  dnsServer.start(53, "*", IPAddress(192, 168, 4, 1));

  portalServer.on("/",     HTTP_GET,  handlePortalRoot);
  portalServer.on("/save", HTTP_POST, handlePortalSave);
  portalServer.on("/scan", HTTP_GET,  handlePortalScan);
  portalServer.onNotFound(handlePortalNotFound);
  portalServer.begin();

  Serial.printf("[Portal] AP: \"%s\"  →  http://192.168.4.1\n", apName.c_str());
  ledSet(LED_SLOW);
}

// ══════════════════════════════════════════════════════════════════
//  WIFI MANAGER
// ══════════════════════════════════════════════════════════════════
void wifiLoadCredentials() {
  prefs.begin("wifi_cfg", true);
  savedSSID        = prefs.getString("ssid",  "");
  savedPass        = prefs.getString("pass",  "");
  String sServer   = prefs.getString("server","");
  String sDevId    = prefs.getString("devid", "");
  String sDtype    = prefs.getString("dtype", "");
  int    sObsNum   = prefs.getInt("obsnum", -1);
  int    sVl53mm   = prefs.getInt("vl53mm", -1);
  prefs.end();

  if (sServer.length() > 0) {
    resolvedServerIP = sServer;
    Serial.printf("[Config] Server: %s\n", resolvedServerIP.c_str());
  }
  if (sDevId.length() > 0) {
    runtimeDevId = sDevId;
    Serial.printf("[Config] Device ID: %s\n", runtimeDevId.c_str());
  }
  if (sDtype.length() > 0) {
    runtimeDevTypeStr = sDtype;
    runtimeRole = typeStrToRole(sDtype);
    Serial.printf("[Config] Type: %s\n", runtimeDevTypeStr.c_str());
  }
  if (sObsNum >= 1) {
    runtimeObsNum = sObsNum;
    Serial.printf("[Config] Obstacle #: %d\n", runtimeObsNum);
  }
  if (sVl53mm >= 10) {
    runtimeVl53FallenMm = sVl53mm;
    Serial.printf("[Config] VL53 threshold: %d cm\n", runtimeVl53FallenMm / 10);
  }
}

void wifiBegin() {
  // Load NVS settings first (so portal shows current config)
  wifiLoadCredentials();

  // Hold BOOT button (GPIO0) on power-up → clear all settings → portal
  pinMode(PIN_BOOT, INPUT_PULLUP);
  if (digitalRead(PIN_BOOT) == LOW) {
    Serial.println("[Config] BOOT held — clearing NVS → portal");
    prefs.begin("wifi_cfg", false); prefs.clear(); prefs.end();
    savedSSID = ""; savedPass = "";
    generateDeviceId();
    runtimeDevTypeStr = "START"; runtimeRole = ROLE_START;
    runtimeObsNum = 1; runtimeVl53FallenMm = VL53_FALLEN_MM;
    resolvedServerIP = BACKEND_HOST;
    ledBlink(5, 100, 50);
    startPortal();
    return;
  }

  if (savedSSID.length() == 0) {
    Serial.println("[WiFi] No credentials → opening portal");
    startPortal();
    return;
  }

  Serial.printf("[WiFi] Connecting to: \"%s\"\n", savedSSID.c_str());
  ledSet(LED_FAST);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(savedSSID.c_str(), savedPass.c_str());
}

void wifiUpdate() {
  unsigned long now = millis();

  if (portalActive) {
    dnsServer.processNextRequest();
    portalServer.handleClient();
    if (now - portalStartAt > PORTAL_TIMEOUT_MS) {
      Serial.println("[Portal] Timeout → restarting");
      ESP.restart();
    }
    return;
  }

  bool connected = (WiFi.status() == WL_CONNECTED);

  if (connected && !wifiConnected) {
    wifiConnected = true;
    Serial.printf("[WiFi] Connected  IP: %s  RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), (int)WiFi.RSSI());
    MDNS.begin(runtimeDevId.c_str());
    discoverServer();
    ledBlink(2, 300, 150);
    ledSet(LED_PULSE);
  }

  if (!connected && wifiConnected) {
    wifiConnected = false;
    resolvedServerIP = (savedSSID.length() > 0 && resolvedServerIP != BACKEND_HOST)
                       ? resolvedServerIP : BACKEND_HOST;
    Serial.println("[WiFi] Disconnected — will retry");
    ledSet(LED_FAST);
  }

  if (!connected && (now - wifiRetryAt > WIFI_RETRY_MS)) {
    wifiRetryAt = now;
    WiFi.reconnect();
  }
}

// ══════════════════════════════════════════════════════════════════
//  SERVER DISCOVERY
// ══════════════════════════════════════════════════════════════════
String udpDiscover() {
  WiFiUDP udp;
  udp.begin(4001);
  IPAddress bcast = WiFi.localIP();
  IPAddress mask  = WiFi.subnetMask();
  for (int i = 0; i < 4; i++) bcast[i] |= (~mask[i] & 0xFF);

  udp.beginPacket(bcast, 4001);
  udp.print("HORSETIMER_DISCOVER");
  udp.endPacket();
  Serial.printf("[Discovery] Broadcast → %s:4001 ...\n", bcast.toString().c_str());

  unsigned long t = millis();
  String found = "";
  while (millis() - t < 2000) {
    if (udp.parsePacket()) {
      char buf[32] = {0};
      udp.read(buf, 31);
      if (String(buf).startsWith("HORSETIMER:")) {
        found = udp.remoteIP().toString();
        break;
      }
    }
    delay(10);
  }
  udp.stop();
  return found;
}

void resolveMdns() {
  String host = String(BACKEND_HOST);
  if (!host.endsWith(".local")) { resolvedServerIP = host; return; }
  String name = host.substring(0, host.length() - 6);
  IPAddress ip = MDNS.queryHost(name.c_str(), 2000);
  if (ip != IPAddress(0, 0, 0, 0)) {
    resolvedServerIP = ip.toString();
    Serial.printf("[mDNS] %s → %s\n", host.c_str(), resolvedServerIP.c_str());
  } else {
    Serial.println("[mDNS] Not found — will retry next heartbeat");
  }
}

void discoverServer() {
  // If user manually set a server in the portal, skip discovery
  if (resolvedServerIP != BACKEND_HOST) {
    Serial.printf("[Discovery] Using configured server: %s\n", resolvedServerIP.c_str());
    return;
  }
  String ip = udpDiscover();
  if (ip.length() > 0) {
    resolvedServerIP = ip;
    Serial.printf("[Discovery] Found server at %s\n", ip.c_str());
    return;
  }
  Serial.println("[Discovery] UDP failed → trying mDNS");
  resolveMdns();
}

// ══════════════════════════════════════════════════════════════════
//  HTTP
// ══════════════════════════════════════════════════════════════════
bool httpPost(const String& path, const String& body) {
  if (!wifiConnected) return false;
  HTTPClient http;
  String url = "http://" + resolvedServerIP + ":" + BACKEND_PORT + path;
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  bool ok = (code == 200 || code == 201);
  if (!ok) Serial.printf("[HTTP] %s → %d\n", path.c_str(), code);
  return ok;
}

void httpSendTrigger(const char* gateType) {
  StaticJsonDocument<128> doc;
  doc["gateType"]  = gateType;
  doc["timestamp"] = millis();
  String body; serializeJson(doc, body);
  String path = "/api/devices/" + runtimeDevId + "/trigger";
  bool ok = httpPost(path, body);
  Serial.printf("[Gate] %s via WiFi → %s\n", gateType, ok ? "OK" : "FAILED");
}

void httpSendHeartbeat() {
  if (!wifiConnected) return;
  if (resolvedServerIP == BACKEND_HOST) discoverServer();

  StaticJsonDocument<192> doc;
  doc["battery"]        = readBatPct();
  doc["rssi"]           = (int)WiFi.RSSI();
  doc["type"]           = runtimeDevTypeStr;
  doc["obstacleNumber"] = runtimeObsNum;
  doc["ssid"]           = WiFi.SSID();
  doc["ip"]             = WiFi.localIP().toString();
  String body; serializeJson(doc, body);

  String path = "/api/devices/" + runtimeDevId + "/heartbeat";
  String url  = "http://" + resolvedServerIP + ":" + BACKEND_PORT + path;

  HTTPClient http;
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);

  if (code == 200 || code == 201) {
    String resp = http.getString();
    StaticJsonDocument<128> rDoc;
    if (!deserializeJson(rDoc, resp)) {
      JsonVariant v = rDoc["config"]["vl53FallenMm"];
      if (v.is<int>()) {
        runtimeVl53FallenMm = v.as<int>();
        Serial.printf("[Config] vl53FallenMm updated → %d mm\n", runtimeVl53FallenMm);
      }
    }
  } else {
    Serial.printf("[Heartbeat] HTTP %d\n", code);
  }
  http.end();
}

void httpSendObstacle(bool photoTriggered, bool fallen) {
  StaticJsonDocument<128> doc;
  doc["obstacleNumber"] = runtimeObsNum;
  doc["photoTriggered"] = photoTriggered;
  doc["fallen"]         = fallen;
  doc["timestamp"]      = millis();
  String body; serializeJson(doc, body);
  String path = "/api/devices/" + runtimeDevId + "/obstacle";
  bool ok = httpPost(path, body);
  Serial.printf("[Obstacle] #%d photo=%d fallen=%d → %s\n",
                runtimeObsNum, photoTriggered, fallen, ok ? "OK" : "FAILED");
}

// ══════════════════════════════════════════════════════════════════
//  NRF24L01
// ══════════════════════════════════════════════════════════════════
uint8_t nrfChecksum(const NRFPkt& p) {
  const uint8_t* b = (const uint8_t*)&p;
  uint8_t cs = 0;
  for (int i = 0; i < 28; i++) cs ^= b[i];
  return cs;
}

void nrfInit() {
  if (!radio.begin()) {
    Serial.println("[NRF] Init FAILED — check wiring and 10uF cap!");
    nrfReady = false;
    ledBlink(5, 50, 50);
    return;
  }
  radio.setChannel(NRF_CHANNEL);
  radio.setDataRate(RF24_250KBPS);
  radio.setPALevel(RF24_PA_HIGH);
  radio.setPayloadSize(32);
  radio.disableDynamicPayloads();
  radio.setRetries(3, 10);
  radio.setCRCLength(RF24_CRC_16);

  if (runtimeRole == ROLE_RECEIVER) {
    radio.openReadingPipe(1, NRF_ADDR);
    radio.startListening();
    Serial.printf("[NRF] RX ready — channel %d\n", NRF_CHANNEL);
  } else {
    radio.openWritingPipe(NRF_ADDR);
    radio.stopListening();
    Serial.printf("[NRF] TX ready — channel %d\n", NRF_CHANNEL);
  }
  nrfReady = true;
}

void nrfFillPacket(NRFPkt& p, DevEvent evt, uint8_t flags = 0) {
  p.ver = 1;
  strncpy(p.id, runtimeDevId.c_str(), 11);
  p.id[11] = '\0';
  p.role   = (uint8_t)runtimeRole;
  p.evt    = (uint8_t)evt;
  p.seq    = ++nrfSeq;
  p.ts     = millis();
  p.mv     = readBatMv();
  p.pct    = readBatPct();
  p.obsNum = (uint8_t)runtimeObsNum;
  p.flags  = flags;
  memset(p.pad, 0, 3);
  p.cs     = nrfChecksum(p);
}

bool nrfSend(DevEvent evt, uint8_t flags = 0) {
  if (!nrfReady) return false;
  NRFPkt pkt;
  nrfFillPacket(pkt, evt, flags);
  bool ok = radio.write(&pkt, 32);
  Serial.printf("[NRF] Send evt=%d seq=%u → %s\n", evt, pkt.seq, ok ? "ACK" : "FAIL");
  if (ok) ledBlink(1, 50, 0);
  else    ledBlink(3, 50, 50);
  return ok;
}

// ══════════════════════════════════════════════════════════════════
//  SENSOR INIT
// ══════════════════════════════════════════════════════════════════
void sensorsInit() {
  pinMode(PIN_PHOTO, INPUT_PULLUP);
  Serial.printf("[Sensor] Photo on GPIO%d (active LOW)\n", PIN_PHOTO);

  if (runtimeRole == ROLE_OBSTACLE) {
    Wire.begin(21, 22);
    if (!tof.begin()) {
      Serial.println("[VL53] NOT FOUND — check SDA=21 SCL=22 3.3V!");
      tofReady = false;
      ledBlink(5, 50, 50);
    } else {
      tof.startRangeContinuous();
      tofReady = true;
      Serial.println("[VL53] Ready — building baseline...");
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  PHOTOELECTRIC  (non-blocking, debounced, one trigger per break)
// ══════════════════════════════════════════════════════════════════
bool checkPhotoTrigger(unsigned long& triggerAt) {
  unsigned long now = millis();
  bool beamBroken = (digitalRead(PIN_PHOTO) == LOW);

  if (beamBroken && !photoState) {
    photoState = true;
    photoFired = false;
    photoLowAt = now;
  } else if (!beamBroken) {
    photoState = false;
    photoFired = false;
  }

  if (photoState && !photoFired
      && (now - photoLowAt     >= (unsigned long)DEBOUNCE_MS)
      && (now - lastGateTrigAt >= (unsigned long)TRIGGER_COOLDOWN_MS)) {
    photoFired     = true;
    lastGateTrigAt = now;
    triggerAt      = photoLowAt;
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════════════
//  VL53L0X  (obstacle mode)
// ══════════════════════════════════════════════════════════════════
void vl53Update() {
  if (!tofReady || !tof.isRangeComplete()) return;
  uint16_t mm = tof.readRangeResult();
  if (mm >= 8190) return;

  if (tofBaseline < 0) {
    baselineSum += mm;
    baselineCount++;
    if (baselineCount >= VL53_BASELINE_READS) {
      tofBaseline = baselineSum / VL53_BASELINE_READS;
      Serial.printf("[VL53] Baseline = %d mm\n", (int)tofBaseline);
    }
    return;
  }

  bool reading_high = ((int32_t)mm > tofBaseline + runtimeVl53FallenMm);
  unsigned long now = millis();

  if (reading_high && !tofFallen) {
    if (tofFallenAt == 0) tofFallenAt = now;
    if (now - tofFallenAt >= (unsigned long)VL53_STABLE_MS) {
      tofFallen = true;
      Serial.printf("[VL53] FALLEN! dist=%d  baseline=%d\n", (int)mm, (int)tofBaseline);
    }
  } else if (!reading_high) {
    tofFallenAt = 0;
    if (tofFallen) {
      tofFallen = false; tofFallenReported = false;
      Serial.println("[VL53] Bar restored");
    }
  }
}

// ══════════════════════════════════════════════════════════════════
//  RECEIVER  — NRF24 → HTTP forwarder
// ══════════════════════════════════════════════════════════════════
int receiverFindOrAdd(const char* id) {
  for (int i = 0; i < knownDevCount; i++)
    if (strncmp(knownDevs[i].id, id, 12) == 0) return i;
  if (knownDevCount >= 16) return -1;
  int i = knownDevCount++;
  strncpy(knownDevs[i].id, id, 12);
  knownDevs[i].online = false;
  knownDevs[i].lastAt = 0;
  lastSeqs[i] = 0;
  return i;
}

bool receiverIsDuplicate(int idx, uint32_t seq) {
  if (seq != 0 && seq == lastSeqs[idx]) return true;
  lastSeqs[idx] = seq;
  return false;
}

void receiverForward(const NRFPkt& p) {
  Serial.printf("[RX] %-12s evt=%d seq=%u bat=%d%%\n", p.id, p.evt, p.seq, p.pct);
  String devPath = "/api/devices/" + String(p.id);

  switch ((DevEvent)p.evt) {
    case EVT_TRIGGER: {
      const char* gt = ((DevRole)p.role == ROLE_START) ? "START" : "FINISH";
      StaticJsonDocument<128> doc;
      doc["gateType"] = gt; doc["timestamp"] = p.ts;
      String body; serializeJson(doc, body);
      httpPost(devPath + "/trigger", body);
      break;
    }
    case EVT_HEARTBEAT:
    case EVT_BATT: {
      StaticJsonDocument<64> doc;
      doc["battery"] = p.pct;
      String body; serializeJson(doc, body);
      httpPost(devPath + "/heartbeat", body);
      break;
    }
    case EVT_OBSTACLE:
    case EVT_FALLEN: {
      StaticJsonDocument<128> doc;
      doc["obstacleNumber"] = p.obsNum;
      doc["photoTriggered"] = (bool)(p.flags & 0x01);
      doc["fallen"]         = (bool)((p.evt == EVT_FALLEN) || (p.flags & 0x02));
      doc["timestamp"]      = p.ts;
      String body; serializeJson(doc, body);
      httpPost(devPath + "/obstacle", body);
      break;
    }
    default: break;
  }
}

void receiverCheckTimeouts() {
  unsigned long now = millis();
  for (int i = 0; i < knownDevCount; i++) {
    if (knownDevs[i].online && (now - knownDevs[i].lastAt > 60000UL)) {
      knownDevs[i].online = false;
      StaticJsonDocument<32> doc;
      doc["battery"] = 0;
      String body; serializeJson(doc, body);
      httpPost("/api/devices/" + String(knownDevs[i].id) + "/heartbeat", body);
    }
  }
}

void receiverUpdate() {
  if (!nrfReady || !radio.available()) return;
  NRFPkt pkt;
  radio.read(&pkt, 32);
  ledBlink(1, 30, 0);

  if (pkt.ver != 1) return;
  if (pkt.cs != nrfChecksum(pkt)) {
    Serial.println("[RX] Checksum mismatch — ignored");
    return;
  }
  pkt.id[11] = '\0';

  int idx = receiverFindOrAdd(pkt.id);
  if (idx < 0) { Serial.println("[RX] Device table full"); return; }
  if (receiverIsDuplicate(idx, pkt.seq)) return;

  knownDevs[idx].lastAt = millis();
  knownDevs[idx].online = true;

  if (wifiConnected) receiverForward(pkt);
  else Serial.println("[RX] WiFi down — cannot forward");
}

// ══════════════════════════════════════════════════════════════════
//  SETUP
// ══════════════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(300);

  // LED + ADC
  pinMode(PIN_LED, OUTPUT);
  ledBlink(3, 100, 80);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // Generate MAC-based device ID as default (NVS may override)
  generateDeviceId();

  // Load NVS config + start WiFi (or portal)
  wifiBegin();

  Serial.println();
  Serial.println("╔══════════════════════════════════════╗");
  Serial.println("║  Horse Jumping Timing System v3.0    ║");
  Serial.println("╚══════════════════════════════════════╝");
  Serial.printf("  Device ID : %s\n", runtimeDevId.c_str());
  Serial.printf("  Type      : %s\n", runtimeDevTypeStr.c_str());
  if (runtimeRole == ROLE_OBSTACLE)
    Serial.printf("  Obstacle  : #%d  VL53=%d cm\n", runtimeObsNum, runtimeVl53FallenMm / 10);
  Serial.println();

  sensorsInit();
  nrfInit();

  Serial.println("[Setup] Done — entering main loop");
}

// ══════════════════════════════════════════════════════════════════
//  LOOP
// ══════════════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();
  wifiUpdate();
  ledUpdate();

  // ── RECEIVER MODE ─────────────────────────────────────────────
  if (runtimeRole == ROLE_RECEIVER) {
    receiverUpdate();
    if (now - lastHeartbeatAt > (unsigned long)HEARTBEAT_MS) {
      lastHeartbeatAt = now;
      if (wifiConnected) httpSendHeartbeat();
      receiverCheckTimeouts();
      Serial.printf("[Receiver] WiFi:%s  Devs:%d  bat:%d%%\n",
                    wifiConnected ? "UP" : "DOWN", knownDevCount, readBatPct());
    }
    return;
  }

  // ── SENSOR MODES  (START / FINISH / OBSTACLE) ─────────────────
  if (now - lastHeartbeatAt > (unsigned long)HEARTBEAT_MS) {
    lastHeartbeatAt = now;
    if (wifiConnected) httpSendHeartbeat();
    else nrfSend(EVT_HEARTBEAT);
  }

  if (now - lastBatteryAt > (unsigned long)BATTERY_REPORT_MS) {
    lastBatteryAt = now;
    uint16_t mv  = readBatMv();
    uint8_t  pct = readBatPct();
    Serial.printf("[Battery] %d mV  %d%%  %s\n", mv, pct, pct <= BAT_LOW_PCT ? "LOW!" : "OK");
    if (pct <= BAT_LOW_PCT) ledBlink(1, 1000, 0);
  }

  unsigned long trigAt = 0;
  if (checkPhotoTrigger(trigAt)) {
    Serial.printf("[TRIGGER] Beam at %lu ms\n", trigAt);
    ledBlink(2, 100, 80);

    if (runtimeRole == ROLE_START) {
      Serial.println("[Gate] START!");
      if (wifiConnected) httpSendTrigger("START");
      else if (!nrfSend(EVT_TRIGGER)) ledBlink(5, 50, 50);
    }
    else if (runtimeRole == ROLE_FINISH) {
      Serial.println("[Gate] FINISH!");
      if (wifiConnected) httpSendTrigger("FINISH");
      else if (!nrfSend(EVT_TRIGGER)) ledBlink(5, 50, 50);
    }
    else if (runtimeRole == ROLE_OBSTACLE) {
      bool fallen = tofFallen;
      uint8_t flags = 0x01 | (fallen ? 0x02 : 0x00);
      Serial.printf("[Obstacle] #%d passed  fallen=%d\n", runtimeObsNum, fallen);
      if (wifiConnected) httpSendObstacle(true, fallen);
      else if (!nrfSend(fallen ? EVT_FALLEN : EVT_OBSTACLE, flags)) ledBlink(5, 50, 50);
      if (fallen) tofFallenReported = true;
      lastObsAt = now;
    }
  }

  // VL53 standalone fall (no horse passed — wind/vibration)
  if (runtimeRole == ROLE_OBSTACLE) {
    vl53Update();
    if (tofFallen && !tofFallenReported && (now - lastObsAt > (unsigned long)TRIGGER_COOLDOWN_MS)) {
      tofFallenReported = true;
      lastObsAt = now;
      Serial.printf("[Obstacle] #%d fell without horse!\n", runtimeObsNum);
      if (wifiConnected) httpSendObstacle(false, true);
      else nrfSend(EVT_FALLEN, 0x02);
    }
  }
}
