/*
 * Horse Jumping Timing System - ESP32 Firmware v3.0
 * Universal: configure device type via the setup portal.
 *
 * Required libraries (Tools > Manage Libraries):
 *   RF24              by TMRh20
 *   Adafruit VL53L0X  by Adafruit
 *   ArduinoJson       by Benoit Blanchon
 *
 * Board: ESP32 Dev Module | Flash: 4MB | Partition: Default
 *
 * First-time setup:
 *   1. Flash this firmware.
 *   2. Connect your phone to the "HorseTimer-XXXX" Wi-Fi AP.
 *   3. Open http://192.168.4.1 and fill in device type, name, and Wi-Fi.
 *   4. The device restarts and joins your network automatically.
 *
 * To reconfigure: hold the BOOT button (GPIO0) while powering on.
 */

// ======================================================================
//  PINS
// ======================================================================
#define PIN_BOOT     0    // Hold on power-up to enter the config portal
#define PIN_PHOTO   33    // Photo-electric sensor output (active LOW = beam broken)
#define PIN_BAT     34    // Battery ADC — 100k:100k voltage divider on the 3.3V rail
#define PIN_LED      2    // Built-in LED
#define PIN_NRF_CE   4    // NRF24L01 CE
#define PIN_NRF_CSN  5    // NRF24L01 CSN
// SPI (hardware-fixed):  SCK=18  MISO=19  MOSI=23
// I2C (hardware-fixed):  SDA=21  SCL=22

// ======================================================================
//  NETWORK
// ======================================================================
#define BACKEND_HOST  "horsetimer.local"  // mDNS fallback; UDP discovery takes priority
#define BACKEND_PORT  4000

// ======================================================================
//  TIMING
// ======================================================================
#define DEBOUNCE_MS          50     // Beam must stay broken this long to register
#define TRIGGER_COOLDOWN_MS  2000   // Lockout window after any trigger (prevents double-counting)
#define HEARTBEAT_MS         15000  // Keep-alive POST interval
#define BATTERY_REPORT_MS    60000  // Battery serial-log interval
#define WIFI_RETRY_MS        10000  // Wi-Fi reconnect attempt interval
#define HTTP_TIMEOUT_MS      3000   // Per-request HTTP timeout
#define PORTAL_TIMEOUT_MS    300000 // Portal auto-restart after 5 min of inactivity
#define NRF_CHANNEL          90     // RF channel — must match across all units on the course

// ======================================================================
//  VL53L0X SENSOR  (OBSTACLE role only)
//
//  The sensor is mounted above the cross-bar, pointing downward.
//  FALLEN fires when the reading rises above (baseline + threshold),
//  meaning the bar has moved away (fallen) from the sensor.
//  The server can override the threshold via the heartbeat response.
// ======================================================================
#define VL53_FALLEN_CM       8   // Default: bar must move 8 cm away to trigger FALLEN
#define VL53_BASELINE_READS  20  // Readings averaged at startup for the resting baseline
#define VL53_STABLE_MS       300 // Reading must stay high for this long before FALLEN is declared

// ======================================================================
//  BATTERY
// ======================================================================
#define BAT_FULL_MV   4200
#define BAT_EMPTY_MV  3300
#define BAT_LOW_PCT     20

// ======================================================================
//  LIBRARIES
// ======================================================================
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

// ======================================================================
//  ENUMS
// ======================================================================
enum DevRole  : uint8_t { ROLE_RECEIVER=0, ROLE_START=1, ROLE_FINISH=2, ROLE_OBSTACLE=3 };
enum DevEvent : uint8_t { EVT_TRIGGER=0, EVT_HEARTBEAT=1, EVT_BATT=2,
                          EVT_OBSTACLE=3, EVT_FALLEN=4,   EVT_ONLINE=5  };
enum LedMode  { LED_OFF, LED_ON, LED_FAST, LED_SLOW, LED_PULSE };

// ======================================================================
//  NRF PACKET  — fixed 32-byte payload
// ======================================================================
struct __attribute__((packed)) NRFPkt {
  uint8_t  ver;      // Protocol version (always 1)
  char     id[12];   // Null-terminated device ID
  uint8_t  role;     // DevRole
  uint8_t  evt;      // DevEvent
  uint32_t seq;      // Monotonic counter for duplicate detection on the receiver
  uint32_t ts;       // Sender millis() timestamp
  uint16_t mv;       // Battery millivolts
  uint8_t  pct;      // Battery percentage
  uint8_t  obsNum;   // Obstacle number (OBSTACLE role only)
  uint8_t  flags;    // Bit 0 = photoTriggered, Bit 1 = fallen
  uint8_t  cs;       // XOR checksum over bytes 0-27
  uint8_t  pad[3];   // Reserved — keeps struct at exactly 32 bytes
};
static_assert(sizeof(NRFPkt) == 32, "NRFPkt must be 32 bytes");

// ======================================================================
//  RUNTIME CONFIG  (NVS-backed, survives power cycles)
// ======================================================================
String  runtimeDevId        = "";
String  runtimeDevTypeStr   = "START";
DevRole runtimeRole         = ROLE_START;
int     runtimeObsNum       = 1;
int     runtimeVl53FallenMm = VL53_FALLEN_CM * 10;  // Stored in mm; displayed in cm

DevRole typeStrToRole(const String& s) {
  if (s == "FINISH")   return ROLE_FINISH;
  if (s == "OBSTACLE") return ROLE_OBSTACLE;
  if (s == "RECEIVER") return ROLE_RECEIVER;
  return ROLE_START;
}

// Build a stable 8-char ID from the lower 24 bits of the chip MAC.
// The portal can override this with a user-friendly name.
void generateDeviceId() {
  uint64_t chip = ESP.getEfuseMac();
  char buf[12];
  snprintf(buf, sizeof(buf), "HT_%06llX", chip & 0xFFFFFF);
  for (int i = 0; buf[i]; i++) buf[i] = toupper(buf[i]);
  runtimeDevId = String(buf);
}

// ======================================================================
//  GLOBAL STATE
// ======================================================================

// --- Wi-Fi / Portal ---
Preferences   prefs;
WebServer     portalServer(80);
DNSServer     dnsServer;
bool          wifiConnected = false;
bool          portalActive  = false;
unsigned long wifiRetryAt   = 0;
unsigned long portalStartAt = 0;
String        savedSSID, savedPass;
String        scannedNets[20];
int           scannedCount = 0;
// Resolved IP used for all HTTP requests. Starts as the mDNS hostname and is
// replaced by UDP discovery or a manually pinned address from the portal.
String resolvedServerIP = BACKEND_HOST;

// --- NRF24L01 ---
RF24          radio(PIN_NRF_CE, PIN_NRF_CSN);
const uint8_t NRF_ADDR[5] = {'H','G','A','T','E'};
uint32_t      nrfSeq   = 0;
bool          nrfReady = false;

// --- Photo-electric sensor ---
bool          photoState     = false; // True while the beam is currently broken
bool          photoFired     = false; // True after the trigger has fired; prevents re-fire
bool          photoDisabled  = false; // Set when the pin is stuck LOW > 10 s (sensor missing/shorted)
unsigned long photoLowAt     = 0;    // Leading-edge timestamp (used for debounce)
unsigned long lastGateTrigAt = 0;    // Last dispatched trigger timestamp (used for cooldown)

// --- VL53L0X (OBSTACLE role only) ---
Adafruit_VL53L0X tof;
bool          tofReady          = false;
int32_t       tofBaseline       = -1;    // Resting distance (mm); -1 = not yet established
int           baselineCount     = 0;
int32_t       baselineSum       = 0;
bool          tofFallen         = false; // True while the bar is in a fallen state
bool          tofFallenReported = false; // Prevents sending the same standalone fall twice
unsigned long tofFallenSince    = 0;     // When the reading first exceeded the threshold
unsigned long lastObsAt         = 0;     // Timestamp of the last obstacle event dispatched
uint16_t      tofLastMm         = 0;     // Most recent valid sensor reading
uint16_t      tofSentMm         = 0;     // Last value posted to /vl53 (for delta tracking)
unsigned long tofLiveSentAt     = 0;     // Timestamp of the last /vl53 live post

// --- Periodic timers ---
unsigned long lastHeartbeatAt = 0;
unsigned long lastBatteryAt   = 0;

// --- LED state machine ---
LedMode       ledMode  = LED_OFF;
bool          ledState = false;
unsigned long ledAt    = 0;

// --- RECEIVER mode device table ---
struct KnownDev { char id[12]; unsigned long lastAt; bool online; };
KnownDev knownDevs[16];
int      knownDevCount = 0;
uint32_t lastSeqs[16]  = {0};

// ======================================================================
//  LED
// ======================================================================

void ledSet(LedMode m) { ledMode = m; }

// Non-blocking LED state machine — call every loop iteration.
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
      // Brief 100ms flash every 2s — a gentle "I'm alive" indicator
      if (now - ledAt >= 2000) { digitalWrite(PIN_LED, HIGH); }
      if (now - ledAt >= 2100) { digitalWrite(PIN_LED, LOW); ledAt = now; }
      break;
  }
}

// Blocking blink — only used in setup / portal entry where loop timing is irrelevant.
void ledBlink(int n, int onMs = 120, int offMs = 80) {
  LedMode prev = ledMode;
  for (int i = 0; i < n; i++) {
    digitalWrite(PIN_LED, HIGH); delay(onMs);
    digitalWrite(PIN_LED, LOW);  delay(offMs);
  }
  ledMode = prev;
}

// ======================================================================
//  BATTERY
// ======================================================================

uint16_t readBatMv() {
  int raw = analogRead(PIN_BAT);
  // The voltage divider halves the pack voltage before the ADC, so multiply by 2.
  return (uint16_t)((raw / 4095.0f) * 3300.0f * 2.0f);
}

uint8_t readBatPct() {
  uint16_t mv  = readBatMv();
  int      pct = (int)((float)(mv - BAT_EMPTY_MV) / (BAT_FULL_MV - BAT_EMPTY_MV) * 100.0f);
  return (uint8_t)constrain(pct, 0, 100);
}

// ======================================================================
//  PORTAL HTML  (stored in flash via PROGMEM to save RAM)
// ======================================================================
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
  autocorrect=off autocapitalize=none placeholder="e.g. obstacle6">
<p class=hint>ASCII only, no spaces (max 15 chars)</p>

<label>Device Type</label>
<select name=t id=dtyp onchange="upd()">
  <option value=START %SS%>START &#8212; &#9193; Start Gate</option>
  <option value=FINISH %SF%>FINISH &#8212; &#9194; Finish Gate</option>
  <option value=OBSTACLE %SO%>OBSTACLE &#8212; &#127944; Obstacle Sensor</option>
  <option value=RECEIVER %SR%>RECEIVER &#8212; &#128225; NRF Receiver</option>
</select>

<div id=obs>
<label>Obstacle Number (1-15)</label>
<input type=number name=o min=1 max=15 value="%ON%">

<label>VL53 Detection Threshold (cm)</label>
<input type=number name=v min=1 max=200 value="%VM%">
<p class=hint>How many cm the bar must move away for the sensor to detect a fall</p>
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
  placeholder="Leave empty - auto-discovered"
  autocomplete=off autocorrect=off autocapitalize=none>
<p class=hint>Only needed if UDP auto-discovery fails on your network</p>

<button type=submit>Save &amp; Connect &#10003;</button>
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

// ======================================================================
//  PORTAL HANDLERS
// ======================================================================

void handlePortalRoot() {
  String page = FPSTR(PORTAL_HTML);
  page.replace("%DID%", runtimeDevId);
  page.replace("%SS%",  runtimeDevTypeStr == "START"    ? "selected" : "");
  page.replace("%SF%",  runtimeDevTypeStr == "FINISH"   ? "selected" : "");
  page.replace("%SO%",  runtimeDevTypeStr == "OBSTACLE" ? "selected" : "");
  page.replace("%SR%",  runtimeDevTypeStr == "RECEIVER" ? "selected" : "");
  page.replace("%ON%",  String(runtimeObsNum > 0 ? runtimeObsNum : 1));
  page.replace("%VM%",  String(runtimeVl53FallenMm / 10));
  page.replace("%SH%",  savedSSID.length() > 0
    ? "<p class=cur>Currently: <b>" + savedSSID + "</b></p>" : "");
  // Show the custom server only if the user previously pinned one
  String customHost = (resolvedServerIP != BACKEND_HOST) ? resolvedServerIP : "";
  page.replace("%HH%",  customHost.length() > 0
    ? "<p class=cur>Currently: <b>" + customHost + "</b></p>" : "");
  page.replace("%HV%",  customHost);
  portalServer.send(200, "text/html", page);
}

void handlePortalSave() {
  String devId = portalServer.arg("d"); devId.trim();
  if (devId.length() == 0) devId = runtimeDevId;

  String devType = portalServer.arg("t");
  if (devType != "START" && devType != "FINISH" &&
      devType != "OBSTACLE" && devType != "RECEIVER") devType = "START";

  int obsNum = portalServer.arg("o").toInt();
  if (obsNum < 1 || obsNum > 15) obsNum = 1;

  int vl53cm = portalServer.arg("v").toInt();
  if (vl53cm < 1 || vl53cm > 200) vl53cm = VL53_FALLEN_CM;

  String ssid = portalServer.arg("s");
  String pass = portalServer.arg("p");
  String host = portalServer.arg("h"); host.trim();

  if (ssid.length() == 0) {
    portalServer.send(400, "text/plain", "SSID required");
    return;
  }

  prefs.begin("wifi_cfg", false);
  prefs.putString("devid",  devId);
  prefs.putString("dtype",  devType);
  prefs.putInt   ("obsnum", obsNum);
  prefs.putInt   ("vl53mm", vl53cm * 10);
  prefs.putString("ssid",   ssid);
  prefs.putString("pass",   pass);
  if (host.length() > 0) prefs.putString("server", host);
  else                    prefs.remove("server");
  prefs.end();

  Serial.printf("[Portal] Saved: id=%s type=%s obs=%d ssid=%s\n",
                devId.c_str(), devType.c_str(), obsNum, ssid.c_str());
  portalServer.send(200, "text/html", FPSTR(SAVED_HTML));
  delay(2000);
  ESP.restart();
}

// Captive portal redirect — catches all unrecognised hostnames
void handlePortalNotFound() {
  portalServer.sendHeader("Location", "http://192.168.4.1/", true);
  portalServer.send(302, "text/plain", "");
}

void handlePortalScan() {
  collectScanResults(); // pick up async results if ready
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
  // Async scan — returns immediately, avoids blocking the watchdog.
  // Results are collected in collectScanResults() after a short delay.
  WiFi.mode(WIFI_STA);
  WiFi.scanNetworks(true /*async*/);
  Serial.println("[WiFi] Scan started (async)");
}

void collectScanResults() {
  int n = WiFi.scanComplete();
  if (n == WIFI_SCAN_RUNNING) return; // not done yet
  if (n < 0) { scannedCount = 0; return; }
  scannedCount = min(n, 20);
  for (int i = 0; i < scannedCount; i++) scannedNets[i] = WiFi.SSID(i);
  WiFi.scanDelete();
  Serial.printf("[WiFi] Found %d networks\n", scannedCount);
}

void startPortal() {
  portalActive  = true;
  portalStartAt = millis();

  doWifiScan();

  // Name the AP after the last two MAC bytes so nearby units are distinguishable
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

  Serial.printf("[Portal] AP: \"%s\"  ->  http://192.168.4.1\n", apName.c_str());
  ledSet(LED_SLOW);
}

// ======================================================================
//  WI-FI MANAGER
// ======================================================================

void wifiLoadCredentials() {
  prefs.begin("wifi_cfg", true);
  savedSSID           = prefs.getString("ssid",   "");
  savedPass           = prefs.getString("pass",   "");
  String sServer      = prefs.getString("server", "");
  String sDevId       = prefs.getString("devid",  "");
  String sDtype       = prefs.getString("dtype",  "");
  int    sObsNum      = prefs.getInt("obsnum", -1);
  int    sVl53mm      = prefs.getInt("vl53mm", -1);
  prefs.end();

  if (sServer.length() > 0) { resolvedServerIP = sServer; Serial.printf("[Config] Server: %s\n",    resolvedServerIP.c_str()); }
  if (sDevId.length()  > 0) { runtimeDevId = sDevId;      Serial.printf("[Config] Device ID: %s\n", runtimeDevId.c_str()); }
  if (sDtype.length()  > 0) { runtimeDevTypeStr = sDtype; runtimeRole = typeStrToRole(sDtype); Serial.printf("[Config] Type: %s\n", runtimeDevTypeStr.c_str()); }
  if (sObsNum >= 1)          { runtimeObsNum = sObsNum;   Serial.printf("[Config] Obstacle #: %d\n", runtimeObsNum); }
  if (sVl53mm >= 10)         { runtimeVl53FallenMm = sVl53mm; Serial.printf("[Config] VL53 threshold: %d cm\n", runtimeVl53FallenMm / 10); }
}

void wifiBegin() {
  wifiLoadCredentials();

  pinMode(PIN_BOOT, INPUT_PULLUP);
  if (digitalRead(PIN_BOOT) == LOW) {
    // BOOT held on power-up: wipe all NVS settings and open the portal
    Serial.println("[Config] BOOT held - clearing NVS -> portal");
    prefs.begin("wifi_cfg", false); prefs.clear(); prefs.end();
    savedSSID = ""; savedPass = "";
    generateDeviceId();
    runtimeDevTypeStr   = "START"; runtimeRole = ROLE_START;
    runtimeObsNum       = 1;
    runtimeVl53FallenMm = VL53_FALLEN_CM * 10;
    resolvedServerIP    = BACKEND_HOST;
    ledBlink(5, 100, 50);
    startPortal();
    return;
  }

  if (savedSSID.length() == 0) {
    Serial.println("[WiFi] No credentials - opening portal");
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
      Serial.println("[Portal] Timeout -> restarting");
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
    Serial.println("[WiFi] Disconnected - will retry");
    ledSet(LED_FAST);
  }

  if (!connected && (now - wifiRetryAt > WIFI_RETRY_MS)) {
    wifiRetryAt = now;
    WiFi.reconnect();
  }
}

// ======================================================================
//  SERVER DISCOVERY
// ======================================================================

// Broadcasts a discovery packet on the local subnet and waits up to 2s
// for the server to reply with its IP address.
String udpDiscover() {
  WiFiUDP udp;
  udp.begin(4001);

  IPAddress bcast = WiFi.localIP();
  IPAddress mask  = WiFi.subnetMask();
  for (int i = 0; i < 4; i++) bcast[i] |= (~mask[i] & 0xFF);

  udp.beginPacket(bcast, 4001);
  udp.print("HORSETIMER_DISCOVER");
  udp.endPacket();
  Serial.printf("[Discovery] Broadcast -> %s:4001 ...\n", bcast.toString().c_str());

  unsigned long t = millis();
  while (millis() - t < 2000) {
    if (udp.parsePacket()) {
      char buf[32] = {0};
      udp.read(buf, 31);
      if (String(buf).startsWith("HORSETIMER:")) {
        udp.stop();
        return udp.remoteIP().toString();
      }
    }
    delay(10);
  }
  udp.stop();
  return "";
}

void resolveMdns() {
  String host = String(BACKEND_HOST);
  if (!host.endsWith(".local")) { resolvedServerIP = host; return; }
  String name = host.substring(0, host.length() - 6);
  IPAddress ip = MDNS.queryHost(name.c_str(), 2000);
  if (ip != IPAddress(0, 0, 0, 0)) {
    resolvedServerIP = ip.toString();
    Serial.printf("[mDNS] %s -> %s\n", host.c_str(), resolvedServerIP.c_str());
  } else {
    Serial.println("[mDNS] Not found - will retry next heartbeat");
  }
}

void discoverServer() {
  // Skip if the user has already pinned a server address in the portal
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
  Serial.println("[Discovery] UDP failed -> trying mDNS");
  resolveMdns();
}

// ======================================================================
//  HTTP HELPERS
// ======================================================================

// Generic fire-and-forget POST. Returns true on HTTP 200/201.
bool httpPost(const String& path, const String& body) {
  if (!wifiConnected) return false;
  HTTPClient http;
  http.begin("http://" + resolvedServerIP + ":" + BACKEND_PORT + path);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  http.end();
  if (code != 200 && code != 201)
    Serial.printf("[HTTP] %s -> %d\n", path.c_str(), code);
  return (code == 200 || code == 201);
}

void httpSendTrigger(const char* gateType) {
  StaticJsonDocument<128> doc;
  doc["gateType"]  = gateType;
  doc["timestamp"] = millis();
  String body; serializeJson(doc, body);
  bool ok = httpPost("/api/devices/" + runtimeDevId + "/trigger", body);
  Serial.printf("[Gate] %s via WiFi -> %s\n", gateType, ok ? "OK" : "FAILED");
}

// Heartbeat uses a manual HTTP flow (not httpPost) because it must read
// the response body to receive server-pushed config updates (e.g. vl53FallenMm).
void httpSendHeartbeat() {
  if (!wifiConnected) return;
  if (resolvedServerIP == BACKEND_HOST) discoverServer(); // retry if not yet resolved

  StaticJsonDocument<256> doc;
  doc["battery"]        = readBatPct();
  doc["rssi"]           = (int)WiFi.RSSI();
  doc["type"]           = runtimeDevTypeStr;
  doc["obstacleNumber"] = runtimeObsNum;
  doc["ssid"]           = WiFi.SSID();
  doc["ip"]             = WiFi.localIP().toString();
  if (runtimeRole == ROLE_OBSTACLE && tofReady && tofBaseline >= 0)
    doc["vl53Baseline"] = (int)tofBaseline;

  String body; serializeJson(doc, body);

  HTTPClient http;
  http.begin("http://" + resolvedServerIP + ":" + BACKEND_PORT
             + "/api/devices/" + runtimeDevId + "/heartbeat");
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
        Serial.printf("[Config] vl53FallenMm updated -> %d mm\n", runtimeVl53FallenMm);
      }
    }
  } else {
    Serial.printf("[Heartbeat] HTTP %d\n", code);
  }
  http.end();
}

// Posts the current VL53 reading to /vl53.
// The server forwards it to UI clients over WebSocket - no DB write.
// Kept under 1s timeout so it never blocks the main loop significantly.
void httpSendVl53Reading(uint16_t mm) {
  if (!wifiConnected) return;
  HTTPClient http;
  http.begin("http://" + resolvedServerIP + ":" + BACKEND_PORT
             + "/api/devices/" + runtimeDevId + "/vl53");
  http.setTimeout(1000);
  http.addHeader("Content-Type", "application/json");
  http.POST("{\"mm\":" + String((int)mm) + "}");
  http.end();
}

void httpSendObstacle(bool photoTriggered, bool fallen) {
  StaticJsonDocument<128> doc;
  doc["obstacleNumber"] = runtimeObsNum;
  doc["photoTriggered"] = photoTriggered;
  doc["fallen"]         = fallen;
  doc["timestamp"]      = millis();
  String body; serializeJson(doc, body);
  bool ok = httpPost("/api/devices/" + runtimeDevId + "/obstacle", body);
  Serial.printf("[Obstacle] #%d photo=%d fallen=%d -> %s\n",
                runtimeObsNum, photoTriggered, fallen, ok ? "OK" : "FAILED");
}

// ======================================================================
//  NRF24L01
// ======================================================================

uint8_t nrfChecksum(const NRFPkt& p) {
  const uint8_t* b = (const uint8_t*)&p;
  uint8_t cs = 0;
  for (int i = 0; i < 28; i++) cs ^= b[i];
  return cs;
}

void nrfInit() {
  if (!radio.begin()) {
    Serial.println("[NRF] Init FAILED - check wiring and 10uF decoupling cap!");
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
    Serial.printf("[NRF] RX ready - channel %d\n", NRF_CHANNEL);
  } else {
    radio.openWritingPipe(NRF_ADDR);
    radio.stopListening();
    Serial.printf("[NRF] TX ready - channel %d\n", NRF_CHANNEL);
  }
  nrfReady = true;
}

void nrfFillPacket(NRFPkt& p, DevEvent evt, uint8_t flags = 0) {
  p.ver = 1;
  strncpy(p.id, runtimeDevId.c_str(), 11); p.id[11] = '\0';
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
  Serial.printf("[NRF] Send evt=%d seq=%u -> %s\n", evt, pkt.seq, ok ? "ACK" : "FAIL");
  if (ok) ledBlink(1, 50, 0);
  else    ledBlink(3, 50, 50);
  return ok;
}

// ======================================================================
//  SENSOR INIT
// ======================================================================
void sensorsInit() {
  pinMode(PIN_PHOTO, INPUT_PULLUP);
  delay(5); // Let pull-up settle before sampling
  bool startLow = (digitalRead(PIN_PHOTO) == LOW);
  Serial.printf("[Sensor] Photo on GPIO%d (active LOW) — pin reads %s at boot\n",
                PIN_PHOTO, startLow ? "LOW (check wiring!)" : "HIGH (OK)");
  // If the pin is already LOW at boot the sensor may be shorted or missing.
  // Arm normally anyway; checkPhotoTrigger will self-disable after 10 s if stuck.

  if (runtimeRole == ROLE_OBSTACLE) {
    Wire.begin(21, 22);
    if (!tof.begin()) {
      Serial.println("[VL53] NOT FOUND - check SDA=21 SCL=22 and 3.3V power!");
      tofReady = false;
      ledBlink(5, 50, 50);
    } else {
      tof.startRangeContinuous();
      tofReady = true;
      Serial.println("[VL53] Ready - building baseline...");
    }
  }
}

// ======================================================================
//  PHOTO-ELECTRIC TRIGGER
//  Returns true exactly once per beam-break event, after debounce and
//  cooldown have both passed. Sets triggerAt to the leading-edge time.
//
//  Stuck-sensor guard: if the pin reads LOW for more than 10 seconds
//  without ever restoring, we assume the sensor is disconnected or
//  shorted. photoDisabled is set so the loop stops trying. The sensor
//  re-enables automatically the moment the pin reads HIGH again.
// ======================================================================
bool checkPhotoTrigger(unsigned long& triggerAt) {
  unsigned long now = millis();
  bool beamBroken = (digitalRead(PIN_PHOTO) == LOW);

  // If beam restored, clear disabled flag so the sensor works again
  if (!beamBroken) {
    photoState    = false;
    photoFired    = false;
    photoDisabled = false;
    return false;
  }

  // Beam is currently broken
  if (!photoState) {
    // Leading edge
    photoState = true;
    photoFired = false;
    photoLowAt = now;
  }

  // Stuck-sensor guard: 10 s of continuous LOW = sensor not connected
  if (now - photoLowAt > 10000UL && !photoDisabled) {
    photoDisabled = true;
    Serial.println("[Sensor] Photo pin stuck LOW > 10s — disabling until beam restores");
  }

  if (photoDisabled) return false;

  if (!photoFired
      && (now - photoLowAt     >= (unsigned long)DEBOUNCE_MS)
      && (now - lastGateTrigAt >= (unsigned long)TRIGGER_COOLDOWN_MS)) {
    photoFired     = true;
    lastGateTrigAt = now;
    triggerAt      = photoLowAt;
    return true;
  }
  return false;
}

// ======================================================================
//  VL53L0X UPDATE  (OBSTACLE role only)
//  Call every loop iteration. Maintains the baseline and tofFallen flag.
// ======================================================================
void vl53Update() {
  if (!tofReady || !tof.isRangeComplete()) return;

  uint16_t mm = tof.readRangeResult();
  if (mm >= 8190) return; // 8190 = out-of-range / sensor error code

  tofLastMm = mm;

  // Phase 1: accumulate baseline readings on startup
  if (tofBaseline < 0) {
    baselineSum += mm;
    if (++baselineCount >= VL53_BASELINE_READS) {
      tofBaseline = baselineSum / VL53_BASELINE_READS;
      Serial.printf("[VL53] Baseline = %d mm\n", (int)tofBaseline);
    }
    return;
  }

  // Phase 2: fall detection.
  // "High" means the reading is further away than (baseline + threshold),
  // i.e. the bar has fallen and the sensor now sees the ground or empty space.
  // We require VL53_STABLE_MS of continuous high readings to filter out
  // brief spikes from vibration or a passing horse.
  bool reading_high = ((int32_t)mm > tofBaseline + runtimeVl53FallenMm);
  unsigned long now = millis();

  if (reading_high && !tofFallen) {
    if (tofFallenSince == 0) tofFallenSince = now;
    if (now - tofFallenSince >= (unsigned long)VL53_STABLE_MS) {
      tofFallen = true;
      Serial.printf("[VL53] FALLEN! dist=%d  baseline=%d\n", (int)mm, (int)tofBaseline);
    }
  } else if (!reading_high) {
    tofFallenSince = 0; // Reset stability timer when reading drops back
    if (tofFallen) {
      tofFallen         = false;
      tofFallenReported = false;
      Serial.println("[VL53] Bar restored");
    }
  }
}

// ======================================================================
//  RECEIVER  —  NRF24 -> HTTP forwarder
// ======================================================================

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

// Mark devices offline after 60 s of silence on the NRF channel
void receiverCheckTimeouts() {
  unsigned long now = millis();
  for (int i = 0; i < knownDevCount; i++) {
    if (knownDevs[i].online && (now - knownDevs[i].lastAt > 60000UL)) {
      knownDevs[i].online = false;
      StaticJsonDocument<32> doc; doc["battery"] = 0;
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
  if (pkt.cs != nrfChecksum(pkt)) { Serial.println("[RX] Checksum mismatch - ignored"); return; }
  pkt.id[11] = '\0';

  int idx = receiverFindOrAdd(pkt.id);
  if (idx < 0) { Serial.println("[RX] Device table full"); return; }
  if (receiverIsDuplicate(idx, pkt.seq)) return;

  knownDevs[idx].lastAt = millis();
  knownDevs[idx].online = true;

  if (wifiConnected) receiverForward(pkt);
  else               Serial.println("[RX] WiFi down - cannot forward");
}

// ======================================================================
//  SETUP
// ======================================================================
void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(PIN_LED, OUTPUT);
  ledBlink(3, 100, 80);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  generateDeviceId();  // MAC-based default; NVS may override in wifiBegin()
  wifiBegin();

  Serial.println();
  Serial.println("========================================");
  Serial.println("  Horse Jumping Timing System v3.0");
  Serial.println("========================================");
  Serial.printf("  Device ID : %s\n", runtimeDevId.c_str());
  Serial.printf("  Type      : %s\n", runtimeDevTypeStr.c_str());
  if (runtimeRole == ROLE_OBSTACLE)
    Serial.printf("  Obstacle  : #%d  VL53=%d cm\n", runtimeObsNum, runtimeVl53FallenMm / 10);
  Serial.println();

  sensorsInit();
  nrfInit();

  Serial.println("[Setup] Done - entering main loop");
}

// ======================================================================
//  LOOP
// ======================================================================
void loop() {
  unsigned long now = millis();
  wifiUpdate();
  ledUpdate();

  // ------------------------------------------------------------------
  //  RECEIVER MODE: listen for NRF packets and forward to server
  // ------------------------------------------------------------------
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

  // ------------------------------------------------------------------
  //  SENSOR MODES  (START / FINISH / OBSTACLE)
  // ------------------------------------------------------------------

  // Periodic keep-alive
  if (now - lastHeartbeatAt > (unsigned long)HEARTBEAT_MS) {
    lastHeartbeatAt = now;
    if (wifiConnected) httpSendHeartbeat();
    else               nrfSend(EVT_HEARTBEAT);
  }

  // Periodic battery log
  if (now - lastBatteryAt > (unsigned long)BATTERY_REPORT_MS) {
    lastBatteryAt = now;
    uint16_t mv  = readBatMv();
    uint8_t  pct = readBatPct();
    Serial.printf("[Battery] %d mV  %d%%  %s\n", mv, pct, pct <= BAT_LOW_PCT ? "LOW!" : "OK");
    if (pct <= BAT_LOW_PCT) ledBlink(1, 1000, 0);
  }

  // Photo-electric sensor trigger
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
      // Snapshot tofFallen at the moment of beam break.
      // The UI waits up to 1 s for a follow-up FALLEN event before
      // deciding between CLEAR and KNOCKDOWN.
      bool fallen = tofFallen;
      Serial.printf("[Obstacle] #%d passed  fallen=%d\n", runtimeObsNum, fallen);
      if (wifiConnected) {
        httpSendObstacle(true, fallen);
      } else {
        uint8_t flags = 0x01 | (fallen ? 0x02 : 0x00);
        if (!nrfSend(fallen ? EVT_FALLEN : EVT_OBSTACLE, flags)) ledBlink(5, 50, 50);
      }
      if (fallen) tofFallenReported = true;
      lastObsAt = now;
    }
  }

  // ------------------------------------------------------------------
  //  VL53 TASKS  (OBSTACLE role only)
  // ------------------------------------------------------------------
  if (runtimeRole == ROLE_OBSTACLE) {
    vl53Update();

    // Live calibration stream: send on every >= 10 mm (1 cm) change,
    // or at least every 2 s, so the UI slider stays responsive.
    if (tofLastMm > 0 && wifiConnected) {
      unsigned int diff = (tofLastMm > tofSentMm)
                          ? (tofLastMm - tofSentMm)
                          : (tofSentMm - tofLastMm);
      if (diff >= 10 || (now - tofLiveSentAt >= 2000UL)) {
        httpSendVl53Reading(tofLastMm);
        tofSentMm     = tofLastMm;
        tofLiveSentAt = now;
      }
    }

    // Standalone fall (no horse passed — wind, collision, accidental knock).
    // The TRIGGER_COOLDOWN_MS guard prevents re-reporting a fall that was
    // already included in a photo-trigger event moments ago.
    if (tofFallen && !tofFallenReported
        && (now - lastObsAt > (unsigned long)TRIGGER_COOLDOWN_MS)) {
      tofFallenReported = true;
      lastObsAt = now;
      Serial.printf("[Obstacle] #%d fell without horse!\n", runtimeObsNum);
      if (wifiConnected) httpSendObstacle(false, true);
      else               nrfSend(EVT_FALLEN, 0x02);
    }
  }
}
