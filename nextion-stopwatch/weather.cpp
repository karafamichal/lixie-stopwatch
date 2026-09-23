#include "weather.h"
#include "config.h"
#include "utf8cp1250.h"
#include "lang.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>

static WeatherInfo sInfo;
static float       sLat = 0;
static float       sLon = 0;
static bool        sHaveGeo = false;

static bool fetchGeo() {
    HTTPClient http;
    http.setTimeout(5000);
    if (!http.begin("http://ip-api.com/json/?fields=status,city,lat,lon")) {
        Serial.println("[weather] geo begin() failed");
        return false;
    }
    int code = http.GET();
    if (code != 200) {
        Serial.printf("[weather] geo HTTP %d\n", code);
        http.end();
        return false;
    }
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, http.getStream());
    http.end();
    if (err) {
        Serial.printf("[weather] geo JSON err: %s\n", err.c_str());
        return false;
    }
    const char* status = doc["status"].as<const char*>();
    if (status && strcmp(status, "success") != 0) {
        Serial.printf("[weather] geo status=%s\n", status);
        return false;
    }
    sLat = doc["lat"].as<float>();
    sLon = doc["lon"].as<float>();
    const char* city = doc["city"].as<const char*>();
    sInfo.city = utf8ToAscii(city ? city : "");
    Serial.printf("[weather] geo: %s lat=%.3f lon=%.3f\n",
                  sInfo.city.c_str(), sLat, sLon);
    sHaveGeo = true;
    return true;
}

static void useFallbackGeo() {
    sLat = WEATHER_FALLBACK_LAT;
    sLon = WEATHER_FALLBACK_LON;
    sInfo.city = WEATHER_FALLBACK_CITY;
    sHaveGeo = true;
    Serial.printf("[weather] using fallback geo (%s)\n", WEATHER_FALLBACK_CITY);
}

namespace Weather {

bool refresh() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[weather] no WiFi");
        return false;
    }
    if (!sHaveGeo && !fetchGeo()) {
        // Geo lookup failed — fall back so the user still sees a strip.
        useFallbackGeo();
    }

    // Open-Meteo 301-redirects plain HTTP to HTTPS, so HTTPClient returns
    // the redirect's HTML body and ArduinoJson reports InvalidInput. Talk
    // HTTPS directly and skip cert validation.
    HTTPClient http;
    WiFiClientSecure secure;
    secure.setInsecure();
    char url[160];
    snprintf(url, sizeof(url),
             "https://api.open-meteo.com/v1/forecast?"
             "latitude=%.3f&longitude=%.3f&current_weather=true",
             sLat, sLon);
    http.setTimeout(8000);
    if (!http.begin(secure, url)) {
        Serial.println("[weather] forecast begin() failed");
        return false;
    }
    int code = http.GET();
    if (code != 200) {
        Serial.printf("[weather] forecast HTTP %d\n", code);
        http.end();
        return false;
    }
    String body = http.getString();
    http.end();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err) {
        Serial.printf("[weather] forecast JSON err: %s\n", err.c_str());
        Serial.printf("[weather] body head: %s\n",
                      body.substring(0, 120).c_str());
        return false;
    }

    sInfo.tempC     = doc["current_weather"]["temperature"].as<float>();
    sInfo.wmoCode   = doc["current_weather"]["weathercode"].as<int>();
    sInfo.valid     = true;
    sInfo.lastUpdateMs = millis();
    if (sInfo.lastUpdateMs == 0) sInfo.lastUpdateMs = 1;
    Serial.printf("[weather] %s %.1fC %s\n",
                  sInfo.city.c_str(), sInfo.tempC, Lang::weather(sInfo.wmoCode));
    return true;
}

const WeatherInfo& get() { return sInfo; }

}  // namespace Weather
