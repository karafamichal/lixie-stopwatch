#include "ledmap.h"
#include "api.h"

const CRGB nixieColor = CRGB(255, 80, 0);

void setup() {
    Serial.begin(115200);
    initLeds();
    
    // Príklad: dvojbodky budú blikať každú sekundu (typické pre stopky/hodiny)
    setColonBlink(true, 1000);
    // Ak chceš mať dvojbodky trvalo svietiace, použiješ setColons(true, true, nixieColor);
}

void loop() {
    int digits[6];
    if (fetchDigits(digits)) {
        showDigits(digits[0], digits[1], digits[2], digits[3], digits[4], digits[5], nixieColor);
    } else {
        // Ak API neodpovedá, možno zhasnúť všetky cifry (dvojbodky ale nechaj)
        for (int i = 0; i < 60; i++) leds[i] = CRGB::Black;
        FastLED.show();
    }
    
    updateColonBlink();   // stará sa o blikanie dvojbodiek (ak je zapnuté)
    
    delay(50);  // krátka pauza, aby blikanie bolo plynulé
}