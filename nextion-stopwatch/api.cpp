// Implementation of REST API calls.
//   - fetchClients(), fetchProjects(), fetchApps() use HTTP GET
//     and parse JSON responses into Entity arrays.
//   - postTimelog() sends the measured duration to the server.
// On error (no WiFi, bad JSON, timeout) they return -1 or false.
// ============================================================================

#include "api.h"
#include "config.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

namespace {

// Common GET helper. Caller provides a JsonDocument; we fill it from the
// response body. Returns HTTP status code or -1 on transport failure.
int httpGetJson(const String& url, JsonDocument& doc) {
    if (WiFi.status() != WL_CONNECTED) return -1;
    HTTPClient http;
    http.setTimeout(5000);
    if (!http.begin(url)) return -1;
    int code = http.GET();
    if (code == 200) {
        DeserializationError err = deserializeJson(doc, http.getStream());
        if (err) code = -2;
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
        out[n].name  = obj["name"].as<const char*>();
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
        out[n].name  = obj["name"].as<const char*>();
        out[n].color = obj["color"].as<const char*>();
        out[n].extra = obj["client_name"].as<const char*>();
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
        out[n].name  = obj["name"].as<const char*>();
        out[n].color = obj["color"].as<const char*>();
        const char* icon = obj["icon"].as<const char*>();
        out[n].extra = icon ? icon : "";
        n++;
    }
    return n;
}

bool postTimelog(int clientId, int projectId, int appId,
                 const String& start_ts, uint32_t duration_seconds) {
    if (WiFi.status() != WL_CONNECTED) return false;

    HTTPClient http;
    http.setTimeout(5000);
    if (!http.begin(String(API_BASE_URL) + "/timelogs")) return false;
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
    return code == 200 || code == 201;
}

}  // namespace Api
