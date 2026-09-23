// This file is the single place where you configure:
//   - which ESP32 pins are connected to the Nextion display and LED strip
//   - WiFi SSID and password
//   - server address (API)
//   - colors, font sizes, NTP servers, etc.
// Anyone wiring up the hardware must edit WIFI_SSID, WIFI_PASSWORD,
// API_BASE_URL and HARDWARE_ID.
// ============================================================================

#ifndef CONFIG_H
#define CONFIG_H

// Hardware pins

#define NEXTION_TX_PIN   17         //display
#define NEXTION_RX_PIN   18         //display
#define NEXTION_UART_NUM 1
#define NEXTION_BAUD     115200   // target speed after bootstrap
#define NEXTION_DEFAULT_BAUD 9600 // Nextion factory default

// Display geometry (NX4024T032 = 400 x 240 px, landscape)
#define DISP_W  400
#define DISP_H  240

// 6 digit matrices (10 LEDs each) + 2 colon LEDs = 62 LEDs total.
// Wired as a single chain on GPIO5.
#define LED_PIN          5
#define LED_NUM          75
#define LED_BRIGHTNESS   250          // 0..255 — keep modest for current draw
#define LED_COLON_LEFT   27
#define LED_COLON_RIGHT  32

// WiFi / API
// These are the *factory defaults* — they're tried only when no credentials
// have been saved via the on-device web setup page yet. After the first
// successful provisioning the saved (NVS) credentials take precedence.

#define WIFI_SSID     "changeme"
#define WIFI_PASSWORD "changeme"

// Soft-AP that comes up when the ESP32 can't connect to any known network.
// Connect a phone to it, then browse to http://192.168.4.1 to configure.
#define AP_SSID                 "LixieStopWatch-Setup"
#define AP_PASSWORD             ""           // empty = open AP
#define WIFI_CONNECT_TIMEOUT_MS 15000UL      // give up on station mode after this

// REST base URL — must end without trailing slash.
#define API_BASE_URL  "http://changeme:5000/api/v1"

// Live WebSocket channel. Host / port / path are the same server as the API.
#define WS_HOST       "changeme"
#define WS_PORT       5000
#define WS_PATH       "/api/v1/ws"

// Identifier this device sends in POST /timelogs (auto-registers a row in `device`).
#define HARDWARE_ID   "esp32_lixie_002"

// ============================================================================
// Idle-screen content sources (weather + news headlines)
// ============================================================================
// Weather location is derived from the device's public IP via ip-api.com,
// then current conditions are pulled from Open-Meteo. No API key required.
// RSS feed for the rotating headline at the bottom of the idle screen.
//   Swap freely. https URLs are supported (TLS via setInsecure()).
#define NEWS_RSS_URL "https://www.theverge.com/rss/tech/index.xml"
#define WEATHER_REFRESH_MS  (60UL * 60UL * 1000UL)   // 1 hour
#define NEWS_REFRESH_MS     (15UL * 60UL * 1000UL)
#define NEWS_ROTATE_MS      8000UL

// Used when ip-api.com geolocation fails (corporate networks, VPNs, rate
// limits). Defaults to Bratislava so we still show a sane weather strip.
#define WEATHER_FALLBACK_CITY "Bratislava"
#define WEATHER_FALLBACK_LAT  48.1486f
#define WEATHER_FALLBACK_LON  17.1077f

// ============================================================================
// NTP
// ============================================================================
#define NTP_SERVER_1  "pool.ntp.org"
#define NTP_SERVER_2  "time.google.com"
// Europe/Bratislava — CET (UTC+1 winter) / CEST (UTC+2 summer DST).
// Note: in POSIX TZ syntax the sign is inverted; "CET-1" means "CET is one
// hour AHEAD of UTC" (i.e. UTC+1). DST switches last Sun of Mar / last Sun of Oct.
#define TZ_STRING     "CET-1CEST,M3.5.0,M10.5.0/3"

// UI

#define FONT_SMALL    0   // ~16 px
#define FONT_MEDIUM   1   // ~24 px
#define FONT_LARGE    2   // ~40 px
#define FONT_HUGE     3   // ~64 px digits for the timer

// 16-bit RGB565 colour palette.
#define COL_BLACK     0x0000
#define COL_WHITE     0xFFFF
#define COL_BG        0x10A2  // very dark blue-grey
#define COL_PANEL     0x2104  // panel surface
#define COL_TEXT      0xFFFF
#define COL_MUTED     0xAD75  // grey text
#define COL_ACCENT    0xFB00  // Lixie orange (#FF8000)
#define COL_GREEN     0x07E0
#define COL_RED       0xF800
#define COL_BLUE      0x2D9F
#define COL_GREY      0x6B4D  // #6B6B6B — pause-button neutral

#endif
