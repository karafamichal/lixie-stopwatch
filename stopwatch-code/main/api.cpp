#include "api.h"
#include <Arduino.h>
#include <WiFi.h>
#include <time.h>

// -------- NASTAVENIA (ZMEŇ PODĽA SEBA) ----------
const char* ssid     = "tomasnotebook";
const char* password = "tomaskonotbuk";
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 3600;   // UTC+1 (zimný čas)
const int   daylightOffset_sec = 0; // pre jednoduchosť, alebo použi configTzTime
// ---------------------------------------------

void setupWiFiAndNTP() {
    Serial.print("Pripajam sa k Wi-Fi: ");
    Serial.println(ssid);
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWi-Fi pripojena!");

    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    Serial.println("Cakam na NTP čas...");
    struct tm timeinfo;
    while (!getLocalTime(&timeinfo)) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nČas synchronizovaný");
}

bool fetchDigits(int digits[6]) {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo)) {
        return false;
    }
    int h = timeinfo.tm_hour;
    int m = timeinfo.tm_min;
    int s = timeinfo.tm_sec;

    digits[0] = h / 10;
    digits[1] = h % 10;
    digits[2] = m / 10;
    digits[3] = m % 10;
    digits[4] = s / 10;
    digits[5] = s % 10;
    return true;
}

bool sendFinishedSession(int durationSeconds) {
    // Zatiaľ len výpis – neskôr nahradíš HTTP POST
    Serial.print("Session finished, duration: ");
    Serial.print(durationSeconds);
    Serial.println(" s");
    return true;
}