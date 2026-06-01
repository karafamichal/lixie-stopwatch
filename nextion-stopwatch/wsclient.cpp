#include "wsclient.h"
#include "config.h"
#include "ui.h"
#include "settings.h"
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

static WebSocketsClient ws;
static bool     sConnected     = false;
static uint32_t sLastPushMs    = 0;
static const char* sLastStateName  = "";   // detect changes for immediate push
static const char* sLastScreenName = "";   // finer-grained change detection

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
            // Server → device control. Settings message shape:
            //   { "type": "settings",
            //     "color":       "#RRGGBB",   // clock/stopwatch digits
            //     "colon_color": "#RRGGBB",   // independent — the two dots
            //     "brightness":  0..255 }
            // Any subset of fields may be present; missing keys are ignored.
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
                Serial.printf("[ws] settings applied clock=%s colon=%s bright=%u\n",
                              Settings::clockColorHex().c_str(),
                              Settings::colonColorHex().c_str(),
                              Settings::brightness());
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
    if (s.clientId >= 0) {
        doc["client_id"]    = s.clientId;
        doc["client_name"]  = s.clientName;
        doc["client_color"] = s.clientColor;
    }
    if (s.projectId >= 0) {
        doc["project_id"]   = s.projectId;
        doc["project_name"] = s.projectName;
    }
    if (s.appId >= 0) {
        doc["app_id"]   = s.appId;
        doc["app_name"] = s.appName;
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

}  // namespace WsClient
