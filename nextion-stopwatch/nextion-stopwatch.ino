// Main program for the ESP32.
// setup():
//   - initialises the Nextion display, shows "Booting..."
//   - initialises the LED matrix (LedDisplay::begin)
//   - connects to WiFi, syncs time via NTP
//   - switches to the main idle screen (SCR_IDLE)
// loop():
//   - collects touches from Nextion and forwards them to UI::handleTouch
//   - calls UI::tick() and LedDisplay::tick() to refresh screen and matrix
//   - short delay (20 ms)
// ============================================================================
// Lixie Stopky — Nextion NX4024T032 controller for ESP32-S3
//
// Hardware:
//   ESP32-S3 GPIO18 -> Nextion RX
//   ESP32-S3 GPIO17 <- Nextion TX
//   Common 5 V and GND.
//
// Display required setup: see HMI_SETUP.md. The HMI must contain page 0,
// four fonts (IDs 0..3), and have `sendxy=1` enabled.

#include <WiFi.h>
#include <time.h>

#include "config.h"
#include "nextion.h"
#include "ui.h"
#include "leddisplay.h"
#include "weather.h"
#include "news.h"
#include "api.h"

static void connectWiFi() {
    Serial.println("[wifi] connecting...");
    UI::showBootMessage("Connecting to WiFi...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) {
        delay(250);
        Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("[wifi] OK ip=");
        Serial.println(WiFi.localIP());
        UI::showBootMessage("WiFi OK: " + WiFi.localIP().toString());
    } else {
        Serial.println("[wifi] failed");
        UI::showBootMessage("WiFi failed - offline mode");
    }
}

static void syncNtp() {
    Serial.println("[ntp] sync...");
    UI::showBootMessage("Syncing time (NTP)...");
    configTzTime(TZ_STRING, NTP_SERVER_1, NTP_SERVER_2);
    uint32_t t0 = millis();
    time_t now = 0;
    while ((now = time(nullptr)) < 100000 && millis() - t0 < 8000) {
        delay(200);
    }
    Serial.printf("[ntp] %s\n", now > 100000 ? "synced" : "timeout");
}

void setup() {
    Serial.begin(115200);
    delay(50);
    Serial.println("\n=== Lixie Stopky — Nextion edition ===");

    Serial.println("[boot] init leds...");
    Serial.flush();
    LedDisplay::begin();
    Serial.println("[boot] leds ok");
    Serial.flush();

    Serial.println("[boot] init nextion (will reassign GPIO17/18)...");
    Serial.flush();
    Nextion::begin();
    Serial.println("[boot] nextion ok");
    Serial.flush();

    UI::showBootMessage("Booting...");

    connectWiFi();
    syncNtp();

    Serial.println("[feed] initial weather + news fetch...");
    Serial.flush();
    Weather::refresh();
    News::refresh();
    Serial.printf("[feed] weather=%s news=%d\n",
                  Weather::get().valid ? "ok" : "miss", News::count());

    bool hb = Api::sendHeartbeat();
    Serial.printf("[heartbeat] initial=%s\n", hb ? "ok" : "fail");

    Serial.println("[boot] entering idle");
    UI::goTo(UI::SCR_IDLE);
}

static void refreshFeeds() {
    static uint32_t lastWeather = 0;
    static uint32_t lastNews    = 0;

    // Only do blocking HTTP work while idle, to keep stopwatch ticks tight.
    if (UI::current() != UI::SCR_IDLE) return;

    uint32_t now = millis();
    if (now - lastWeather > WEATHER_REFRESH_MS) {
        lastWeather = now;
        Weather::refresh();
    }
    if (now - lastNews > NEWS_REFRESH_MS) {
        lastNews = now;
        News::refresh();
    }
}

static void pulseHeartbeat() {
    // Runs in every state — the dashboard cares about presence whether we're
    // idle, browsing, or actively timing a session.
    static uint32_t lastBeat = 0;
    uint32_t now = millis();
    if (now - lastBeat < 60000) return;
    lastBeat = now;
    Api::sendHeartbeat();
}

void loop() {
    NextionTouch t;
    while (Nextion::poll(t)) {
        UI::handleTouch(t);
    }

    UI::tick();
    LedDisplay::tick();
    refreshFeeds();
    pulseHeartbeat();

    delay(20);
}
