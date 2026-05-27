# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**"Stopky na steroidoch"** — an Erasmus-funded IoT time-tracking device that combines retro Lixie (pseudo-Nixie) tube aesthetics with modern IoT connectivity. The system has three components:

1. **ESP32-S3 firmware** (C++/Arduino) — the physical device with Lixie display, OLED menu, rotary encoder
2. **Flask REST API** (Python) — backend that the ESP32 talks to; stores clients, projects, time logs
3. **React + Vite dashboard** — web UI for administrators to manage clients, projects, view/edit time logs, and monitor active sessions

## Monorepo Structure (planned)

```
/firmware/       # PlatformIO C++ project for ESP32-S3
/backend/        # Python Flask REST API + SQLite
/dashboard/      # React + Vite admin dashboard
```

## Development Commands

### Backend (Flask)
```bash
cd backend
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
flask run --debug                                 # dev server on :5000
flask db upgrade                                  # apply migrations (Flask-Migrate)
```

### Dashboard (React + Vite)
```bash
cd dashboard
npm install
npm run dev        # dev server on :5173 with HMR
npm run build      # production build to dist/
npm run preview    # preview production build
```

### Firmware (PlatformIO)
```bash
cd firmware
pio run                     # compile
pio run --target upload     # flash to ESP32-S3
pio device monitor          # serial monitor at 115200 baud
```

## REST API Endpoints

The ESP32 consumes these endpoints. The dashboard also uses them.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/clients` | List all active clients |
| GET | `/api/v1/projects?client_id=<id>` | List projects for a client |
| POST | `/api/v1/timelogs` | Submit a completed time entry |
| GET | `/api/v1/timelogs` | List time logs (dashboard only) |
| POST/PUT/DELETE | `/api/v1/clients/<id>` | CRUD for clients (dashboard only) |
| POST/PUT/DELETE | `/api/v1/projects/<id>` | CRUD for projects (dashboard only) |

### Time log POST payload (from ESP32)
```json
{
  "hardware_id": "esp32_lixie_001",
  "client_id": "client_alpha_99",
  "project_id": "proj_omega_2026",
  "start_timestamp": "2026-04-16T14:00:00Z",
  "duration_seconds": 5400,
  "status": "completed"
}
```

## ESP32-S3 Device Architecture

### Hardware peripherals and GPIO
| Peripheral | Protocol | Example GPIO |
|-----------|----------|--------------|
| OLED SSD1306/SSD1309 (1.3" or 2.42") | I2C | SDA=GPIO8, SCL=GPIO9 |
| Rotary encoder KY-040 | Digital ISR | CLK=GPIO12, DT=GPIO13, SW=GPIO18 |
| Lixie WS2812B LEDs (120 total, 6 digits × 20 LEDs) | NZR 800kHz | GPIO15 via 330Ω resistor |
| Power input | 5V/8A DC barrel 5.5×2.1mm | — |

Avoid strapping pins GPIO 0, 3, 45, 46 for peripherals.

### Device state machine
1. **Boot** — Wi-Fi connect, NTP sync, show status on OLED
2. **Idle** — Lixie shows current time (clock mode), OLED shows logo
3. **Menu activation** — first encoder turn fetches `/api/v1/clients`
4. **Selection tree** — Client → Project (filtered by `client_id`)
5. **Measurement** — Lixie switches to stopwatch mode, LEDs turn green
6. **Submit** — encoder press stops timer, confirms, POSTs to `/api/v1/timelogs`; on failure stores to Flash for later delivery

### Key firmware libraries
- `WiFi.h` + `HTTPClient.h` / `esp32-http-client` — REST calls
- `ArduinoJson` v6/v7 — JSON parsing (use `DynamicJsonDocument` sized to response)
- `time.h` + `sntp.h` — NTP sync; TZ string for CET: `CET-1CEST,M3.5.0,M10.5.0/3`
- `sstaub/NTP` — Kiss-of-Death backoff when NTP unreachable
- `ESP32RotaryEncoder` — hardware ISR-based quadrature decoding (never poll)
- `BasicOLEDMenu` — async tree-menu rendering for SSD1306
- `FastLED` or `Adafruit NeoPixel` — WS2812B via RMT peripheral (interrupt-safe)

The ESP32-S3 uses the RMT hardware peripheral for WS2812B output so LED updates never glitch during Wi-Fi activity.

### Power requirements
- Total LED draw at Nixie-orange (100% brightness): ~3A @ 5V
- Use star topology wiring: thick 18 AWG wire from DC barrel directly to LED boards; separate thinner wire to ESP32 5V/VIN pin
- Add 1000µF/10V low-ESR capacitor at the start of the LED chain

## Database Schema (SQLite)

```sql
clients   (id, name, active, color VARCHAR(7), created_at)
projects  (id, client_id, name, active, color VARCHAR(7), created_at)
devices   (id, hardware_id, label, last_seen)
timelogs  (id, device_id, client_id, project_id, start_timestamp, duration_seconds, status, synced_at)
```

`color` is a hex string (e.g. `#FF8000`). Both `GET /clients` and `GET /projects` responses include it. The ESP32 uses it to set the WS2812B LED colour for the selected client/project during measurement.

## Dashboard Features Required

The admin dashboard must support full CRUD for:
- **Clients** — add, edit name/active status, delete
- **Projects** — add per client, edit, toggle active, delete
- **Time logs** — view, filter by client/project/date, edit duration/status, delete
- **Devices** — view registered devices, assign labels
- **Real-time view** — see which device is currently tracking time for which project
