#include "wsclient.h"
#include "config.h"
#include "ui.h"
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

static WebSocketsClient ws;
static bool     sConnected     = false;
static uint32_t sLastPushMs    = 0;
static const char* sLastStateName = "";   // detect changes for immediate push

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
        case WStype_TEXT:
            // Currently we don't act on server→device messages. Reserved for
            // future remote-control commands (e.g. forced refresh).
            break;
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

    String body;
    serializeJson(doc, body);
    ws.sendTXT(body);
    sLastStateName = s.state;
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
    bool stateChanged = (sLastStateName && strcmp(sLastStateName, s.state) != 0);

    if (stateChanged || now - sLastPushMs >= interval) {
        sLastPushMs = now;
        pushState();
    }
}

bool isConnected() { return sConnected; }

}  // namespace WsClient
