#include "ledmap.h"

CRGB leds[NUM_LEDS];

// Premapovanie: ledIndex[pozícia][číslica] = index LED (0..59)
// Pozície: 0,1 (prvá matica – ľavá, pravá), 2,3 (druhá matica), 4,5 (tretia matica)
// Číslice: 0..9
//
// !! SEM DOPLŇ SVOJE REÁLNE HODNOTY podľa merania !!
const uint8_t ledIndex[6][10] = {
    // Pozícia 0 (prvá matica, ľavá číslica)
    {5, 0, 2, 3, 4, 6, 7, 8, 9, 1},
    // Pozícia 1 (prvá matica, pravá číslica)
    {15,10,11,12,13,14,16,17,18,19},
    // Pozícia 2 (druhá matica, ľavá)
    {25,20,21,22,23,24,26,27,28,29},
    // Pozícia 3 (druhá matica, pravá)
    {35,30,31,32,33,34,36,37,38,39},
    // Pozícia 4 (tretia matica, ľavá)
    {45,40,41,42,43,44,46,47,48,49},
    // Pozícia 5 (tretia matica, pravá)
    {55,50,51,52,53,54,56,57,58,59}
};

// Premenné pre blikanie dvojbodiek
static bool colonLeftState = false;
static bool colonRightState = false;
static CRGB colonColor = CRGB(255, 80, 0);
static unsigned long lastBlink = 0;
static bool blinkEnabled = false;
static unsigned long blinkInterval = 1000;

void initLeds() {
    FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, NUM_LEDS);
    FastLED.setBrightness(50);
    clearAll();
}

void clearAll() {
    fill_solid(leds, NUM_LEDS, CRGB::Black);
    FastLED.show();
}

void showDigits(int d0, int d1, int d2, int d3, int d4, int d5, CRGB color) {
    // Nezhasínaj celé pole – zhasni len číslice (60 LED), ale nechaj dvojbodky
    for (int i = 0; i < 60; i++) leds[i] = CRGB::Black;
    
    // Rozsvieť požadované číslice
    if (d0 >= 0 && d0 <= 9) leds[ ledIndex[0][d0] ] = color;
    if (d1 >= 0 && d1 <= 9) leds[ ledIndex[1][d1] ] = color;
    if (d2 >= 0 && d2 <= 9) leds[ ledIndex[2][d2] ] = color;
    if (d3 >= 0 && d3 <= 9) leds[ ledIndex[3][d3] ] = color;
    if (d4 >= 0 && d4 <= 9) leds[ ledIndex[4][d4] ] = color;
    if (d5 >= 0 && d5 <= 9) leds[ ledIndex[5][d5] ] = color;
    
    // Aplikuj aktuálny stav dvojbodiek (nezmení sa pri každom showDigits)
    leds[COLON_LEFT_IDX]  = colonLeftState  ? colonColor : CRGB::Black;
    leds[COLON_RIGHT_IDX] = colonRightState ? colonColor : CRGB::Black;
    
    FastLED.show();
}

// Okamžité nastavenie dvojbodiek (bez blikania)
void setColons(bool leftOn, bool rightOn, CRGB color) {
    colonLeftState = leftOn;
    colonRightState = rightOn;
    colonColor = color;
    blinkEnabled = false;  // vypne blikanie, keď sa nastaví manuálne
    // Aktualizácia prebehne pri najbližšom showDigits, alebo môžeme rovno:
    leds[COLON_LEFT_IDX]  = leftOn  ? color : CRGB::Black;
    leds[COLON_RIGHT_IDX] = rightOn ? color : CRGB::Black;
    FastLED.show();
}

// Zapne automatické blikanie dvojbodiek (napr. každú sekundu)
void setColonBlink(bool enabled, unsigned long intervalMs) {
    blinkEnabled = enabled;
    blinkInterval = intervalMs;
    lastBlink = millis();
    if (!enabled) {
        // Ak vypíname blikanie, necháme dvojbodky svietiť podľa aktuálnych stavov
        // (žiadna zmena)
    }
}

// Túto funkciu treba volať v loop() – stará sa o blikanie
void updateColonBlink() {
    if (!blinkEnabled) return;
    unsigned long now = millis();
    if (now - lastBlink >= blinkInterval) {
        lastBlink = now;
        // Prepne stav oboch dvojbodiek (napr. obe blikajú synchrónne)
        colonLeftState = !colonLeftState;
        colonRightState = !colonRightState;
        // Aktualizujeme LED bez zavolania celého showDigits (aby sa neprekresľovali cifry)
        leds[COLON_LEFT_IDX]  = colonLeftState  ? colonColor : CRGB::Black;
        leds[COLON_RIGHT_IDX] = colonRightState ? colonColor : CRGB::Black;
        FastLED.show();
    }
}