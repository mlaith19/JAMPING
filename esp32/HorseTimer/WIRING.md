# Horse Jumping Timing System — Wiring Guide

All measurements in the tables below are **pin-to-pin connections**.
Wire colours are suggestions only — label every wire at both ends.

---

## Unit Types

| Type | Device | Sensors |
|------|--------|---------|
| **START gate** | ESP32 DevKit V1 + NRF24L01 | YS122 photoelectric (via optocoupler) |
| **FINISH gate** | ESP32 DevKit V1 + NRF24L01 | YS122 photoelectric (via optocoupler) |
| **OBSTACLE** | ESP32 DevKit V1 + NRF24L01 | YS122 photoelectric (via optocoupler) + VL53L0X V2 |
| **RECEIVER** | ESP32 DevKit V1 + NRF24L01 | None — powered by USB or 5V adapter |

---

## 1. Power Chain (per battery-powered unit)

```
18650 cell
    │
    ▼
TP4056 (USB-C charger + protection)
    │   B+ ─────────────────────────────────────────┐
    │   B- ──────────────────────────────────────────┤ (battery rails)
    ▼                                                 │
XL6009 boost #1 (set to 5V)   ◄── IN+ from B+, IN- from B-
    │   OUT+ ──► ON/OFF switch ──► ESP32 VIN (5V rail)
    │   OUT- ──► GND (common)
    │
XL6009 boost #2 (set to 12V)  ◄── IN+ from B+, IN- from B-
    │   OUT+ ──► ON/OFF switch ──► YS122 Brown wire (+12V)
    │   OUT- ──► GND (common)
```

> **Fuse**: Place a 1A polyfuse (PTC) on the line between TP4056 B+ and the two XL6009 inputs.
> **Switch**: A single SPDT or two SPSTs can cut both XL6009 inputs at once.

---

## 2. ESP32 DevKit V1 — Power

| ESP32 pin | Connect to | Notes |
|-----------|-----------|-------|
| VIN | XL6009 #1 OUT+ (5V) | ESP32 on-board 3.3V LDO handles the rest |
| GND | Common GND | Connect all GND rails together |
| 3V3 | NRF24L01 VCC, VL53L0X VCC | **3.3V only — never 5V on these pins** |

---

## 3. NRF24L01 PA/LNA → ESP32

The NRF24L01 uses SPI. The ESP32's hardware SPI pins are fixed.
Add a **10 µF electrolytic** capacitor between VCC and GND **at the NRF24L01 module** to prevent brownouts.

| NRF24L01 pin | ESP32 GPIO | Notes |
|--------------|-----------|-------|
| VCC | 3V3 | **3.3V only** |
| GND | GND | |
| CE | GPIO **4** | Chip Enable (configurable in firmware) |
| CSN | GPIO **5** | Chip Select (configurable in firmware) |
| SCK | GPIO **18** | Hardware SPI — fixed |
| MOSI | GPIO **23** | Hardware SPI — fixed |
| MISO | GPIO **19** | Hardware SPI — fixed |
| IRQ | not connected | Not used |

> **Module orientation**: The 8-pin NRF24L01 module — pin 1 is GND (top-left when antenna faces up).
> Use the 8-pin breakout, not the bare module, for easier soldering.

---

## 4. VL53L0X V2 → ESP32 (OBSTACLE units only)

The VL53L0X uses I2C. Mount it facing **downward** through a clear window in the enclosure lid.

| VL53L0X pin | ESP32 GPIO | Notes |
|-------------|-----------|-------|
| VCC | 3V3 | |
| GND | GND | |
| SDA | GPIO **21** | Hardware I2C — fixed |
| SCL | GPIO **22** | Hardware I2C — fixed |
| XSHUT | not connected | Leave floating (module stays active) |
| GPIO1 | not connected | Interrupt not used |

> Default I2C address is **0x29**. No address conflict because only one VL53L0X per unit.

---

## 5. YS122 Photoelectric Sensor → ESP32 via PC817 Optocoupler

The YS122 is a 12V NPN through-beam sensor. Its output sinks to GND when the beam is **clear** and floats when the beam is **broken**. An optocoupler isolates the 12V side from the ESP32's 3.3V GPIO.

### 5a. YS122 wire colours

| Wire colour | Signal |
|-------------|--------|
| Brown | +12V supply |
| Blue | GND (12V side) |
| Black | NPN output (open-collector, sinks when beam clear) |

### 5b. Optocoupler circuit (PC817)

```
12V side (isolated)          3.3V side (ESP32)
─────────────────            ──────────────────

YS122 +12V ──┬──────────────────────────────────
             │
             R1 (1 kΩ)
             │
             ├──► PC817 pin 1 (LED Anode)
             │
YS122 OUT ──►PC817 pin 2 (LED Cathode)   [NPN output drives cathode]
YS122 GND ──┘

                             PC817 pin 4 (Collector) ──► 3.3V (pull-up)
                                                      ──► R2 (10 kΩ) to 3.3V
                             PC817 pin 3 (Emitter)   ──► GND
                             PC817 pin 4 (Collector) ──► ESP32 GPIO 27
```

| Component | Value | Purpose |
|-----------|-------|---------|
| R1 | 1 kΩ | Current limit for optocoupler LED (~11 mA at 12V) |
| R2 | 10 kΩ | Pull-up on collector side to 3.3V |

**Logic at GPIO27:**
- Beam **clear** → YS122 OUT sinks → LED on → Collector LOW → **GPIO27 = LOW**
- Beam **broken** → YS122 OUT floats → LED off → Pull-up pulls Collector HIGH → **GPIO27 = HIGH**

> The firmware sets `#define PIN_PHOTO 27` with `INPUT` mode (external 10kΩ pull-up). The beam-broken event is detected on a rising edge (LOW → HIGH). `IR_ACTIVE_LOW false` in older firmware versions; in HorseTimer.ino the beam-broken = HIGH is handled directly.

---

## 6. Battery Voltage Divider → ESP32 ADC

Measures 18650 voltage (3.3V – 4.2V range) via a resistor divider into GPIO34 (ADC1, input-only).

```
B+ (battery positive, up to 4.2V)
    │
   R3 (100 kΩ)
    │
    ├──► GPIO 34  (ADC input, 0–3.3V max)
    │
   R4 (100 kΩ)
    │
   GND
```

| Component | Value |
|-----------|-------|
| R3 | 100 kΩ |
| R4 | 100 kΩ |

At 4.2V battery: ADC reads 4200 × (100k / 200k) = **2100 mV** ✓ (safe, under 3.3V)
At 3.3V battery: ADC reads 3300 × (100k / 200k) = **1650 mV** ✓

> Use 1% tolerance resistors for accuracy. GPIO34 is input-only (no internal pull-up/down needed).

---

## 7. LED (Built-in)

| ESP32 GPIO | Purpose |
|-----------|---------|
| GPIO **2** | Built-in blue LED on ESP32 DevKit V1 |

No external wiring needed. The firmware uses it for status blinks.

---

## 8. ON/OFF Switch Placement

Place the switch on the **positive rail between TP4056 B+ and both XL6009 IN+** pins.
This cuts power to both boost converters (5V and 12V) simultaneously while leaving the TP4056 connected for charging.

```
B+ ──► [SWITCH] ──► XL6009 #1 IN+ (5V)
                ──► XL6009 #2 IN+ (12V)
```

---

## 9. Full Pin Summary (ESP32 DevKit V1)

| GPIO | Function | Direction | Notes |
|------|---------|-----------|-------|
| 2 | LED | Output | Built-in LED |
| 4 | NRF CE | Output | NRF24L01 chip enable |
| 5 | NRF CSN | Output | NRF24L01 chip select |
| 18 | SPI SCK | Output | NRF24L01 clock |
| 19 | SPI MISO | Input | NRF24L01 data out |
| 21 | I2C SDA | I/O | VL53L0X data (obstacle units only) |
| 22 | I2C SCL | Output | VL53L0X clock (obstacle units only) |
| 23 | SPI MOSI | Output | NRF24L01 data in |
| 27 | Photoelectric | Input | Optocoupler output (HIGH = beam broken) |
| 34 | Battery ADC | Input | Voltage divider (input-only pin) |

---

## 10. Per-Unit Bill of Materials (single unit)

| Component | Qty | Notes |
|-----------|-----|-------|
| ESP32 DevKit V1 | 1 | 38-pin variant |
| NRF24L01 PA/LNA module | 1 | 8-pin, with SMA antenna |
| YS122 photoelectric sensor pair | 1 | Transmitter + Receiver, 12V NPN |
| VL53L0X V2 module | 1 | **Obstacle units only** |
| TP4056 USB-C module | 1 | With DW01A protection |
| XL6009 boost module | 2 | #1 → 5V, #2 → 12V |
| 18650 cell | 1 | 3000+ mAh recommended |
| 18650 holder | 1 | |
| PC817 optocoupler | 1 | DIP-4 |
| Resistor 1 kΩ | 1 | R1 — optocoupler current limit |
| Resistor 10 kΩ | 1 | R2 — collector pull-up |
| Resistor 100 kΩ | 2 | R3, R4 — battery divider |
| Capacitor 10 µF electrolytic | 1 | NRF24L01 VCC decoupling |
| SPDT switch | 1 | Power on/off |
| PTC polyfuse 1A | 1 | Battery protection |
| Enclosure | 1 | With clear window for VL53L0X (obstacle units) |

---

## 11. Receiver Unit (simplified)

The Receiver has no sensors. It only needs:

- ESP32 DevKit V1
- NRF24L01 PA/LNA (same wiring as above: GPIO 4/5/18/19/23)
- 5V USB power (via USB cable or USB adapter → VIN + GND)
- Must be within WiFi range of the router

No TP4056, no XL6009, no YS122, no VL53L0X, no optocoupler, no battery.
