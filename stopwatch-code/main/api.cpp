#include "api.h"
#include <Arduino.h>   // <-- TOTO BOLO CHÝBAJÚCE

// MOCK: namiesto reálneho HTTP vráti testovacie číslice (napr. 12:34:56)
bool fetchDigits(int digits[6]) {
    static unsigned long lastCall = 0;
    static int counter = 0;
    if (millis() - lastCall > 3000) {
        lastCall = millis();
        counter = (counter + 1) % 10;
    }
    unsigned long s = millis() / 1000;
    int seconds = s % 60;
    int minutes = (s / 60) % 60;
    int hours   = (s / 3600) % 24;
    digits[0] = hours / 10;
    digits[1] = hours % 10;
    digits[2] = minutes / 10;
    digits[3] = minutes % 10;
    digits[4] = seconds / 10;
    digits[5] = seconds % 10;
    return true;
}

bool sendFinishedSession(int durationSeconds) {
    Serial.print("Session finished, duration: ");
    Serial.print(durationSeconds);
    Serial.println(" s");
    return true;
}