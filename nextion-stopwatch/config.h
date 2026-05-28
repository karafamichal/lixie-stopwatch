#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// Hardware pins
// ============================================================================
// Nextion NX4024T032 connects to ESP32-S3 via UART1.
//   ESP32 GPIO19 (TX1)  --->  Nextion RX
//   ESP32 GPIO20 (RX1)  <---  Nextion TX
//   5V and GND share with the display.
#define NEXTION_TX_PIN   19
#define NEXTION_RX_PIN   20
#define NEXTION_UART_NUM 1
#define NEXTION_BAUD     115200   // target speed after bootstrap
#define NEXTION_DEFAULT_BAUD 9600 // Nextion factory default

// Display geometry (NX4024T032 = 400 x 240 px, landscape)
#define DISP_W  400
#define DISP_H  240

// ============================================================================
// WS2812B Lixie matrix
// ============================================================================
// 6 digit matrices (10 LEDs each) + 2 colon LEDs = 62 LEDs total.
// Wired as a single chain on GPIO5 (avoid the UART pins 19/20).
#define LED_PIN          5
#define LED_NUM          62
#define LED_BRIGHTNESS   60          // 0..255 — keep modest for current draw
#define LED_COLON_LEFT   60
#define LED_COLON_RIGHT  61

// ============================================================================
// WiFi / API
// ============================================================================
#define WIFI_SSID     "YOUR_SSID"
#define WIFI_PASSWORD "YOUR_PASSWORD"

// REST base URL — must end without trailing slash.
#define API_BASE_URL  "http://192.168.1.100:5000/api/v1"

// Identifier this device sends in POST /timelogs (auto-registers a row in `device`).
#define HARDWARE_ID   "esp32_lixie_001"

// ============================================================================
// NTP
// ============================================================================
#define NTP_SERVER_1  "pool.ntp.org"
#define NTP_SERVER_2  "time.google.com"
// CET with DST (Slovakia / Central Europe)
#define TZ_STRING     "CET-1CEST,M3.5.0,M10.5.0/3"

// ============================================================================
// UI
// ============================================================================
// Nextion font IDs — see HMI_SETUP.md. The HMI must include these four fonts.
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
#define COL_ACCENT    0xFB00  // Nixie orange (#FF8000)
#define COL_GREEN     0x07E0
#define COL_RED       0xF800
#define COL_BLUE      0x2D9F

#endif
