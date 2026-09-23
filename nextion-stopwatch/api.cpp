// Implementation of REST API calls.
//   - fetchClients(), fetchProjects(), fetchApps() use HTTP GET
//     and parse JSON responses into Entity arrays.
//   - postTimelog() sends the measured duration to the server.
// On error (no WiFi, bad JSON, timeout) they return -1 or false.
// ============================================================================

#include "api.h"
#include "config.h"
#include "utf8cp1250.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Preferences.h>

namespace {

// Offline queue: one JSON array in NVS namespace "queue", key "q".
// Entry shape: {"c":clientId,"p":projectId,"a":appId,"s":"ISO start","d":seconds}
int sQueued = -1;   // cached size, -1 = not read yet

void loadQueue(JsonDocument& doc) {
    Preferences p;
    p.begin("queue", true);
    String raw = p.getString("q", "[]");
    p.end();
    if (deserializeJson(doc, raw) || !doc.is<JsonArray>()) doc.to<JsonArray>();
    sQueued = doc.as<JsonArray>().size();
}

void saveQueue(JsonDocument& doc) {
    String raw;
    serializeJson(doc, raw);
    Preferences p;
    p.begin("queue", false);
    p.putString("q", raw);
    p.end();
    sQueued = doc.as<JsonArray>().size();
}

// Common GET helper. Caller provides a JsonDocument; we fill it from the
// response body. Returns HTTP status code or a negative transport code on
// failure:
//   -1 = WiFi not connected
//   -2 = http.begin() refused the URL
//   -3 = JSON deserialization failed on a 200 response
// All paths print a one-line diagnostic so failures aren't silent.
int httpGetJson(const String& url, JsonDocument& doc) {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.printf("[api] GET %s skipped (no WiFi)\n", url.c_str());
        return -1;
    }
    HTTPClient http;
    http.setTimeout(5000);
    if (!http.begin(url)) {
        Serial.printf("[api] GET %s begin() failed\n", url.c_str());
        return -2;
    }
    int code = http.GET();
    if (code == 200) {
        DeserializationError err = deserializeJson(doc, http.getStream());
        if (err) {
            Serial.printf("[api] GET %s json err: %s\n", url.c_str(), err.c_str());
            code = -3;
        }
    } else {
        // A negative `code` here is one of HTTPClient's error constants
        // (e.g. -1 = connection refused, -11 = read timeout). A positive
        // non-2xx is what the server actually returned.
        String body = http.getString();
        Serial.printf("[api] GET %s -> HTTP %d body=%s\n",
                      url.c_str(), code, body.substring(0, 120).c_str());
    }
    http.end();
    return code;
}

}  // namespace

namespace Api {

int fetchClients(Entity* out, int max) {
    JsonDocument doc;
    int code = httpGetJson(String(API_BASE_URL) + "/clients", doc);
    if (code != 200) return -1;

    int n = 0;
    for (JsonObject obj : doc.as<JsonArray>()) {
        if (n >= max) break;
        if (!obj["active"].as<bool>()) continue;
        out[n].id    = obj["id"].as<int>();
        out[n].name  = utf8ToAscii(obj["name"].as<const char*>());
        out[n].color = obj["color"].as<const char*>();
        out[n].extra = "";
        n++;
    }
    return n;
}

int fetchProjects(int clientId, Entity* out, int max) {
    JsonDocument doc;
    String url = String(API_BASE_URL) + "/projects?client_id=" + String(clientId);
    int code = httpGetJson(url, doc);
    if (code != 200) return -1;

    int n = 0;
    for (JsonObject obj : doc.as<JsonArray>()) {
        if (n >= max) break;
        out[n].id    = obj["id"].as<int>();
        out[n].name  = utf8ToAscii(obj["name"].as<const char*>());
        out[n].color = obj["color"].as<const char*>();
        out[n].extra = utf8ToAscii(obj["client_name"].as<const char*>());
        n++;
    }
    return n;
}

int fetchApps(Entity* out, int max) {
    JsonDocument doc;
    int code = httpGetJson(String(API_BASE_URL) + "/apps", doc);
    if (code != 200) return -1;

    int n = 0;
    for (JsonObject obj : doc.as<JsonArray>()) {
        if (n >= max) break;
        out[n].id    = obj["id"].as<int>();
        out[n].name  = utf8ToAscii(obj["name"].as<const char*>());
        out[n].color = obj["color"].as<const char*>();
        // Stash the app's category in `extra` so the UI can group apps by
        // category on the on-device picker. (App icons are emoji and the
        // Nextion ASCII fonts can't render them, so we drop those.)
        const char* cat = obj["category"].as<const char*>();
        out[n].extra = cat ? utf8ToAscii(cat) : String("Other");
        n++;
    }
    return n;
}

int postTimelog(int clientId, int projectId, int appId,
                const String& start_ts, uint32_t duration_seconds) {
    if (WiFi.status() != WL_CONNECTED) return -1;

    HTTPClient http;
    http.setTimeout(5000);
    if (!http.begin(String(API_BASE_URL) + "/timelogs")) return -2;
    http.addHeader("Content-Type", "application/json");

    JsonDocument req;
    req["hardware_id"]      = HARDWARE_ID;
    req["client_id"]        = clientId;
    req["project_id"]       = projectId;
    if (appId >= 0) req["app_id"] = appId;
    req["start_timestamp"]  = start_ts;
    req["duration_seconds"] = duration_seconds;
    req["status"]           = "completed";

    String body;
    serializeJson(req, body);

    int code = http.POST(body);
    http.end();
    Serial.printf("[api] POST /timelogs -> %d\n", code);
    return code;
}

bool queueTimelog(int clientId, int projectId, int appId,
                  const String& start_ts, uint32_t duration_seconds) {
    JsonDocument doc;
    loadQueue(doc);
    JsonArray arr = doc.as<JsonArray>();
    if (arr.size() >= OFFLINE_QUEUE_MAX) return false;
    JsonObject o = arr.add<JsonObject>();
    o["c"] = clientId;
    o["p"] = projectId;
    o["a"] = appId;
    o["s"] = start_ts;
    o["d"] = duration_seconds;
    saveQueue(doc);
    Serial.printf("[queue] stored offline, %d pending\n", sQueued);
    return true;
}

int queuedCount() {
    if (sQueued < 0) {
        JsonDocument doc;
        loadQueue(doc);
    }
    return sQueued;
}

void flushQueue() {
    if (queuedCount() == 0 || WiFi.status() != WL_CONNECTED) return;
    JsonDocument doc;
    loadQueue(doc);
    JsonArray arr = doc.as<JsonArray>();
    bool changed = false;
    while (arr.size() > 0) {
        JsonObject o = arr[0];
        int code = postTimelog(o["c"] | 0, o["p"] | 0, o["a"] | -1,
                               o["s"].as<String>(), o["d"] | 0);
        if (isRetryable(code)) break;          // still offline — try again later
        if (code >= 400) {
            // e.g. the project was deleted meanwhile — the server will never
            // take this entry, so drop it instead of blocking the queue.
            Serial.printf("[queue] server rejected entry (%d), dropping\n", code);
        }
        arr.remove(0);
        changed = true;
    }
    if (changed) saveQueue(doc);
    Serial.printf("[queue] flush done, %d pending\n", sQueued);
}

bool sendHeartbeat() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[heartbeat] no WiFi");
        return false;
    }

    HTTPClient http;
    http.setTimeout(3000);
    String url = String(API_BASE_URL) + "/devices/heartbeat";
    if (!http.begin(url)) {
        Serial.println("[heartbeat] begin() failed");
        return false;
    }
    http.addHeader("Content-Type", "application/json");

    String body = String("{\"hardware_id\":\"") + HARDWARE_ID + "\"}";
    int code = http.POST(body);
    if (code < 200 || code >= 300) {
        String resp = http.getString();
        Serial.printf("[heartbeat] HTTP %d body=%s\n",
                      code, resp.substring(0, 120).c_str());
    }
    http.end();
    return code >= 200 && code < 300;
}

}  // namespace Api
