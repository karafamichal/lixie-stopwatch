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

#define WIFI_SSID     "LagTop"
#define WIFI_PASSWORD "LagTop123"

// REST base URL — must end without trailing slash.
#define API_BASE_URL  "http://193.87.172.155:5000/api/v1"

// Identifier this device sends in POST /timelogs (auto-registers a row in `device`).
#define HARDWARE_ID   "esp32_lixie_001"

// ============================================================================
// Idle-screen content sources (weather + news headlines)
// ============================================================================
// Weather location is derived from the device's public IP via ip-api.com,
// then current conditions are pulled from Open-Meteo. No API key required.
// RSS feed for the rotating headline at the bottom of the idle screen.
//   Swap freely. https URLs are supported (TLS via setInsecure()).
#define NEWS_RSS_URL "https://www.aktuality.sk/rss/"
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

#endif
