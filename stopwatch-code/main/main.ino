#include "ledmap.h"
#include "api.h"

unsigned long lastBlink = 0;
bool colonState = true;   // pre blikanie dvojbodiek

void setup() {
    Serial.begin(115200);
    setupWiFiAndNTP();     // pripojí sa a získa čas
    initLeds();
}

void loop() {
    int digits[6];
    if (fetchDigits(digits)) {
        showDigits(digits[0], digits[1], digits[2], digits[3], digits[4], digits[5]);
    } else {
        clearAll();
    }

    // Blikanie dvojbodiek každú sekundu
    unsigned long now = millis();
    if (now - lastBlink >= 1000) {
        lastBlink = now;
        colonState = !colonState;
        setColons(colonState, colonState);
        // Zavoláme showDigits znova, aby sa dvojbodky prekreslili
        if (fetchDigits(digits)) {
            showDigits(digits[0], digits[1], digits[2], digits[3], digits[4], digits[5]);
        }
    }

    delay(50);  // stačí na plynulé blikanie
}