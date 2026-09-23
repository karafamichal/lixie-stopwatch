#include "wsclient.h"
#include "config.h"
#include "ui.h"
#include "settings.h"
#include "lang.h"
#include "api.h"
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <HTTPUpdate.h>
#include <ArduinoJson.h>

static WebSocketsClient ws;
static bool     sConnected     = false;
static uint32_t sLastPushMs    = 0;
static const char* sLastStateName  = "";   // detect changes for immediate push
static const char* sLastScreenName = "";   // finer-grained change detection

// Firmware update requested by the dashboard. sOtaPath is relative to
// API_BASE_URL; sOtaStatus is reported in every state push ("" = nothing
// to report, "waiting" = queued until the session ends, "failed").
static String sOtaPath;
static String sOtaStatus;

// Read an integer setting and clamp it to [lo, hi]. Returns false if the
// key is missing or not a number.
static bool readInt(JsonDocument& doc, const char* key, int lo, int hi, int& out) {
    if (!doc[key].is<int>()) return false;
    out = doc[key].as<int>();
    if (out < lo) out = lo;
    if (out > hi) out = hi;
    return true;
}

static void onEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            sConnected = true;
            Serial.println("[ws] connected");
            break;
        case WStype_DISCONNECTED:
            sConnected = false;
            Serial.println("[ws] disconnected");
            break;
        case WStype_ERROR:
            Serial.printf("[ws] error len=%u\n", (unsigned)length);
            break;
        case WStype_TEXT: {
            // Server → device control. Settings message shape (all fields
            // optional, any subset may be present):
            //   { "type": "settings",
            //     "color":              "#RRGGBB",   // clock/stopwatch digits
            //     "colon_color":        "#RRGGBB",   // the two dots
            //     "brightness":         0..255,      // LED matrix brightness
            //     "display_brightness": 0..100,      // Nextion backlight %
            //     "sleep_timeout_sec":  0..65535,    // 0 disables auto-sleep
            //     "sleep_on_idle":      bool,       // sleep from idle too
            //     "language":           "en"|"de",   // Nextion UI language
            //     "pomodoro_min":       0..120,      // focus block (0 = off)
            //     "break_min":          1..60,
            //     "reminder_min":       0..480,      // idle reminder (0 = off)
            //     "night_start":        0..23,       // night mode window
            //     "night_end":          0..23,
            //     "night_brightness":   0..255 }
            // Firmware update: { "type": "ota", "path": "/firmware/<token>.bin" }
            JsonDocument doc;
            DeserializationError err = deserializeJson(doc, payload, length);
            if (err) {
                Serial.printf("[ws] bad msg: %s\n", err.c_str());
                break;
            }
            const char* msgType = doc["type"] | "";
            if (strcmp(msgType, "settings") == 0) {
                if (doc["color"].is<const char*>()) {
                    Settings::setClockColorHex(doc["color"].as<String>());
                }
                if (doc["colon_color"].is<const char*>()) {
                    Settings::setColonColorHex(doc["colon_color"].as<String>());
                }
                if (doc["brightness"].is<int>()) {
                    int b = doc["brightness"].as<int>();
                    if (b < 0)   b = 0;
                    if (b > 255) b = 255;
                    Settings::setBrightness((uint8_t)b);
                }
                if (doc["display_brightness"].is<int>()) {
                    int p = doc["display_brightness"].as<int>();
                    if (p < 0)   p = 0;
                    if (p > 100) p = 100;
                    Settings::setDisplayBrightness((uint8_t)p);
                }
                if (doc["sleep_timeout_sec"].is<int>()) {
                    int s = doc["sleep_timeout_sec"].as<int>();
                    if (s < 0)     s = 0;
                    if (s > 65535) s = 65535;
                    Settings::setSleepTimeoutSec((uint16_t)s);
                }
                if (doc["sleep_on_idle"].is<bool>()) {
                    Settings::setSleepOnIdle(doc["sleep_on_idle"].as<bool>());
                }
                if (doc["language"].is<const char*>()) {
                    Language l = Lang::fromCode(doc["language"].as<const char*>());
                    if (l != Settings::language()) {
                        Settings::setLanguage(l);
                        UI::redraw();   // repaint the current screen in the new language
                    }
                }
                int v;
                if (readInt(doc, "pomodoro_min",     0, 120, v)) Settings::setPomodoroMin((uint8_t)v);
                if (readInt(doc, "break_min",        1, 60,  v)) Settings::setBreakMin((uint8_t)v);
                if (readInt(doc, "reminder_min",     0, 480, v)) Settings::setReminderMin((uint16_t)v);
                if (readInt(doc, "night_start",      0, 23,  v)) Settings::setNightStart((uint8_t)v);
                if (readInt(doc, "night_end",        0, 23,  v)) Settings::setNightEnd((uint8_t)v);
                if (readInt(doc, "night_brightness", 0, 255, v)) Settings::setNightBrightness((uint8_t)v);
                Serial.printf("[ws] settings applied clock=%s colon=%s bright=%u disp=%u sleep=%u idle=%d lang=%s\n",
                              Settings::clockColorHex().c_str(),
                              Settings::colonColorHex().c_str(),
                              Settings::brightness(),
                              Settings::displayBrightness(),
                              Settings::sleepTimeoutSec(),
                              (int)Settings::sleepOnIdle(),
                              Lang::code(Settings::language()));
            } else if (strcmp(msgType, "ota") == 0) {
                const char* path = doc["path"] | "";
                if (path[0] == '/') {
                    sOtaPath   = path;
                    sOtaStatus = "waiting";
                    Serial.printf("[ota] requested %s\n", path);
                }
            } else if (strcmp(msgType, "remote_touch") == 0) {
                // Remote control — inject a synthetic touch as if the user
                // had pressed/released the physical Nextion at (x,y).
                int  x       = doc["x"]       | -1;
                int  y       = doc["y"]       | -1;
                bool pressed = doc["pressed"] | true;
                if (x >= 0 && y >= 0) {
                    UI::injectTouch(x, y, pressed);
                    Serial.printf("[ws] remote touch x=%d y=%d %s\n",
                                  x, y, pressed ? "down" : "up");
                }
            }
            break;
        }
        default:
            break;
    }
}

static void pushState() {
    if (!sConnected) return;

    UI::LiveSnapshot s = UI::getLiveSnapshot();

    JsonDocument doc;
    doc["type"]            = "state";
    doc["hardware_id"]     = HARDWARE_ID;
    doc["state"]           = s.state;
    doc["screen"]          = s.screen;
    doc["paused"]          = s.paused;
    doc["elapsed_seconds"] = s.elapsedSec;
    // Lets the dashboard mirror render its labels in the same language as
    // the physical screen.
    doc["language"]        = Lang::code(Settings::language());
    doc["fw"]              = FW_VERSION;
    doc["queued"]          = Api::queuedCount();
    if (sOtaStatus.length()) doc["ota_status"] = sOtaStatus;
    if (s.clientId >= 0) {
        doc["client_id"]    = s.clientId;
        doc["client_name"]  = s.clientName;
        doc["client_color"] = s.clientColor;
    }
    if (s.projectId >= 0) {
        doc["project_id"]    = s.projectId;
        doc["project_name"]  = s.projectName;
        doc["project_color"] = s.projectColor;
    }
    if (s.appId >= 0) {
        doc["app_id"]   = s.appId;
        doc["app_name"] = s.appName;
    }
    if (s.categoryName.length()) {
        doc["category_name"] = s.categoryName;
    }
    if (s.startIso.length()) {
        doc["start_timestamp"] = s.startIso;
    }

    // Screen-specific extras (list rows, weather, news, toast text...) so the
    // dashboard remote can render a faithful mirror without a side fetch.
    UI::writeStateExtras(doc);

    String body;
    serializeJson(doc, body);
    ws.sendTXT(body);
    sLastStateName  = s.state;
    sLastScreenName = s.screen;
}

namespace WsClient {

void begin() {
    ws.begin(WS_HOST, WS_PORT, WS_PATH);
    ws.onEvent(onEvent);
    ws.setReconnectInterval(5000);
    // Liveness pings — sent every 15 s, disconnect if no pong in 3 attempts.
    ws.enableHeartbeat(15000, 3000, 2);
}

void loop() {
    ws.loop();

    if (WiFi.status() != WL_CONNECTED) return;

    UI::LiveSnapshot s = UI::getLiveSnapshot();
    bool isActive = (strcmp(s.state, "running") == 0 ||
                     strcmp(s.state, "paused")  == 0 ||
                     strcmp(s.state, "confirm") == 0);
    uint32_t interval = isActive ? 1000UL : 5000UL;

    uint32_t now = millis();
    bool stateChanged  = (sLastStateName  && strcmp(sLastStateName,  s.state)  != 0);
    bool screenChanged = (sLastScreenName && strcmp(sLastScreenName, s.screen) != 0);

    // Push immediately on any state or screen transition so the remote-
    // control UI mirrors the device within one tick of the user's action.
    if (stateChanged || screenChanged || now - sLastPushMs >= interval) {
        sLastPushMs = now;
        pushState();
    }
}

bool isConnected() { return sConnected; }

void runPendingOta() {
    if (!sOtaPath.length()) return;
    // Never interrupt a session; install once the device is back home.
    UI::Screen scr = UI::current();
    if (UI::sessionActive() || (scr != UI::SCR_IDLE && scr != UI::SCR_SLEEP)) return;
    if (WiFi.status() != WL_CONNECTED) return;

    String url = String(API_BASE_URL) + sOtaPath;
    sOtaPath = "";
    Serial.printf("[ota] installing from %s\n", url.c_str());
    UI::showBootMessage(TR(S_UPDATING));

    // The server sends an x-MD5 header, which HTTPUpdate checks before it
    // switches partitions — a truncated download never boots.
    WiFiClient client;
    httpUpdate.rebootOnUpdate(true);
    httpUpdate.update(client, url);

    // Only reached when the update did not happen.
    Serial.printf("[ota] failed: %s\n", httpUpdate.getLastErrorString().c_str());
    sOtaStatus = "failed";
    UI::toast(TR(S_UPDATE_FAILED), 2500, UI::SCR_IDLE);
}

}  // namespace WsClient
