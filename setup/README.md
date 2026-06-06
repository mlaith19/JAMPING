# JAMPING — Setup Guide

## Requirements (install once on the new computer)

1. **Node.js** (LTS) — https://nodejs.org
2. **Docker Desktop** — https://www.docker.com/products/docker-desktop

---

## First-time installation

Right-click `setup.ps1` → **Run with PowerShell**

This will:
- Start the PostgreSQL database (via Docker)
- Create the `.env` configuration file
- Install all npm dependencies (server + client)
- Apply the database schema

---

## Daily use

Double-click `start.ps1` — opens two terminal windows (server + client) and launches the browser automatically.

| Service   | URL                    |
|-----------|------------------------|
| App       | http://localhost:5173  |
| API       | http://localhost:4000  |
| Database  | localhost:5440         |

To stop: close the terminal windows, then run `stop.ps1` to shut down the database.

---

## ESP32 Firmware

There are two firmware options depending on the hardware:

### Option A — `horse_jumping_sensor` (recommended for new builds)

Simple IR beam-break or VL53L0X sensor node. WiFi and device settings are compiled in.

**Before flashing**, edit `esp32/horse_jumping_sensor/config.h`:

```cpp
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define SERVER_HOST   "192.168.1.100"   // IP of the PC running the server
#define SERVER_PORT   4000
#define DEVICE_ID     "copy-from-devices-tab"  // from the web app after first boot
#define GATE_TYPE     "START"           // "START" or "FINISH" — can be changed in UI later
```

> **Note:** After first boot the device auto-registers in the web app.
> The sensor role (START / FINISH / OBSTACLE) is controlled from the **Devices tab** in the web app —
> changing it there takes effect immediately without re-flashing.

Required libraries (Arduino IDE → Tools → Manage Libraries):
- ArduinoJson by Benoit Blanchon
- Adafruit VL53L0X by Adafruit *(only if using VL53 sensor)*

---

### Option B — `HorseTimer` (legacy / full-featured)

Multi-role device with WiFi captive portal, NVS configuration, and NRF24 receiver support.

Open `esp32/HorseTimer/HorseTimer.ino` in Arduino IDE and upload.

On first boot, connect to the **JAMPING-XXXXXX** WiFi access point and configure:
- WiFi network
- Server IP
- Device role (START / FINISH / OBSTACLE / RECEIVER)

Required libraries (Arduino IDE → Tools → Manage Libraries):
- RF24 by TMRh20
- Adafruit VL53L0X by Adafruit
- ArduinoJson by Benoit Blanchon

---

## Resetting a device's WiFi

If a device needs to be reconfigured on a new WiFi network:

1. Open the **Devices** tab in the web app
2. Click the ⚙️ settings icon on the device
3. Click **אפס הגדרות WiFi** at the bottom
4. The device will restart and open the WiFi configuration portal on its next heartbeat (within ~30 seconds)

---

## Sensor wiring (IR beam-break)

| ESP32 Pin | Wire         |
|-----------|--------------|
| GPIO33    | Sensor OUT   |
| 3.3V      | Sensor VCC   |
| GND       | Sensor GND   |

The sensor should pull GPIO33 **LOW** when the beam is broken (`IR_ACTIVE_LOW = true`).
