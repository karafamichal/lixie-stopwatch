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

#include <WiFi.h>
#include <time.h>

#include "config.h"
#include "nextion.h"
#include "ui.h"
#include "leddisplay.h"
#include "weather.h"
#include "news.h"
#include "api.h"
#include "wifimgr.h"
#include "wsclient.h"
#include "settings.h"
#include "lang.h"

static void enterApSetupMode() {
    UI::showBootMessage(String(TR(S_AP_SETUP_1)) + "\n"
                        + TR(S_AP_SETUP_2) + AP_SSID + "'\n"
                        + TR(S_AP_SETUP_3));
    Serial.println("[boot] AP setup loop");
    // Stay here forever — the only escape is the user saving credentials,
    // which calls ESP.restart() inside the captive portal handler.
    while (true) {
        WifiMgr::loop();
        delay(5);
    }
}

static void syncNtp() {
    Serial.println("[ntp] sync...");
    UI::showBootMessage(TR(S_NTP_SYNCING));
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
    Serial.println("\n=== Lixie StopWatch — Nextion edition ===");

    Serial.println("[boot] init leds...");
    Serial.flush();
    LedDisplay::begin();
    Settings::begin();   // applies saved colour + brightness over defaults
    Serial.println("[boot] leds ok");
    Serial.flush();

    Serial.println("[boot] init nextion (will reassign GPIO17/18)...");
    Serial.flush();
    Nextion::begin();
    Serial.println("[boot] nextion ok");
    Serial.flush();

    UI::showBootMessage(TR(S_BOOTING));

    UI::showBootMessage(TR(S_WIFI_CONNECTING));
    if (!WifiMgr::begin()) {
        // Saved + default credentials both failed → captive portal.
        enterApSetupMode();   // never returns
    }
    UI::showBootMessage(TR(S_WIFI_OK) + WiFi.localIP().toString());
    syncNtp();

    Serial.println("[feed] initial weather + news fetch...");
    Serial.flush();
    Weather::refresh();
    News::refresh();
    Serial.printf("[feed] weather=%s news=%d\n",
                  Weather::get().valid ? "ok" : "miss", News::count());

    WsClient::begin();
    Serial.println("[ws] client started");

    Serial.println("[boot] entering idle");
    UI::goTo(UI::SCR_IDLE);
}

// Night dimming, offline-queue retries and pending firmware updates.
static void backgroundJobs() {
    static uint32_t lastNight = 0;
    static uint32_t lastQueue = 0;
    uint32_t now = millis();

    // Skip on the settings screen so its live brightness preview sticks.
    if (now - lastNight >= 1000 && UI::current() != UI::SCR_SETTINGS) {
        lastNight = now;
        Settings::applyNightMode(UI::sessionActive());
    }
    // Retry sessions saved while offline — only while idle, because each
    // attempt is a blocking HTTP call.
    if (now - lastQueue >= 60000UL && UI::current() == UI::SCR_IDLE) {
        lastQueue = now;
        Api::flushQueue();
    }
    WsClient::runPendingOta();
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

void loop() {
    NextionTouch t;
    while (Nextion::poll(t)) {
        UI::handleTouch(t);
    }

    UI::tick();
    LedDisplay::tick();
    refreshFeeds();
    backgroundJobs();
    // WebSocket replaces the old HTTP heartbeat — every state push refreshes
    // last_seen on the server, so the dashboard's Online indicator stays
    // accurate without a second channel.
    WsClient::loop();

    delay(20);
}
