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

| Service | URL |
|---------|-----|
| App (client) | http://localhost:5173 |
| API (server) | http://localhost:4000 |
| Database | localhost:5440 |

To stop: close the terminal windows, then run `stop.ps1` to shut down the database.

---

## ESP32 Firmware

Open `esp32/HorseTimer/HorseTimer.ino` in Arduino IDE and upload to each device.

Required libraries (Tools → Manage Libraries):
- RF24 by TMRh20
- Adafruit VL53L0X by Adafruit
- ArduinoJson by Benoit Blanchon
