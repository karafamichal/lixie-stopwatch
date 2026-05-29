// Nixie Stopky — Nextion NX4024T032 controller for ESP32-S3
//
// Hardware:
//   ESP32-S3 GPIO19 -> Nextion RX
//   ESP32-S3 GPIO20 <- Nextion TX
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
    Serial.println("\n=== Nixie Stopky — Nextion edition ===");

    Serial.println("[boot] init leds...");
    Serial.flush();
    LedDisplay::begin();
    Serial.println("[boot] leds ok");
    Serial.flush();

    Serial.println("[boot] init nextion (will reassign GPIO19/20)...");
    Serial.flush();
    Nextion::begin();
    Serial.println("[boot] nextion ok");
    Serial.flush();

    UI::showBootMessage("Booting...");

    connectWiFi();
    syncNtp();

    Serial.println("[boot] entering idle");
    UI::goTo(UI::SCR_IDLE);
}

void loop() {
    // Drain inbound serial — emit a touch event when a complete frame lands.
    NextionTouch t;
    while (Nextion::poll(t)) {
        UI::handleTouch(t);
    }

    UI::tick();
    LedDisplay::tick();

    delay(20);
}
