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

static void enterApSetupMode() {
    UI::showBootMessage(String("WiFi setup mode\n")
                        + "Join '" + AP_SSID + "'\n"
                        + "then open 192.168.4.1");
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

    UI::showBootMessage("Booting...");

    UI::showBootMessage("Connecting to WiFi...");
    if (!WifiMgr::begin()) {
        // Saved + default credentials both failed → captive portal.
        enterApSetupMode();   // never returns
    }
    UI::showBootMessage("WiFi OK: " + WiFi.localIP().toString());
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
    // WebSocket replaces the old HTTP heartbeat — every state push refreshes
    // last_seen on the server, so the dashboard's Online indicator stays
    // accurate without a second channel.
    WsClient::loop();

    delay(20);
}
