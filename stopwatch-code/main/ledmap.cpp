#include "ledmap.h"
#include <Arduino.h>

Adafruit_NeoPixel matrix = Adafruit_NeoPixel(NUM_LEDS, PIN_MATRIX, NEO_GRB + NEO_KHZ800);

// Farba a jas (z tvojho kódu)
const int NASTAV_JAS_PERCENTA = 100;
const byte FARBA_R = 0;
const byte FARBA_G = 255;
const byte FARBA_B = 0;
uint32_t aktualnaFarba;
uint32_t farbaDvojbodky;

// Pre blikanie dvojbodiek (podľa sekúnd)
bool colonLeftOn = false;
bool colonRightOn = false;

void initLeds() {
    matrix.begin();
    matrix.clear();
    matrix.show();
    int bitovyJas = map(NASTAV_JAS_PERCENTA, 0, 100, 0, 255);
    matrix.setBrightness(bitovyJas);
    aktualnaFarba = matrix.Color(FARBA_R, FARBA_G, FARBA_B);
    farbaDvojbodky = matrix.Color(0, 255, 0);
}

void clearAll() {
    matrix.clear();
    matrix.show();
}

// Zobrazí 6 číslic (hodiny, minúty, sekundy)
void showDigits(int d0, int d1, int d2, int d3, int d4, int d5) {
    matrix.clear();

    // 1. matica (hodiny) – indexy 0..24
    matrix.setPixelColor(0 + d0, aktualnaFarba);   // desiatky hodín (0-9)
    matrix.setPixelColor(10 + d1, aktualnaFarba);  // jednotky hodín
    if (colonLeftOn) matrix.setPixelColor(20, farbaDvojbodky);

    // 2. matica (minúty) – indexy 25..49
    matrix.setPixelColor(25 + d2, aktualnaFarba);  // desiatky minút
    matrix.setPixelColor(35 + d3, aktualnaFarba);  // jednotky minút
    if (colonRightOn) matrix.setPixelColor(45, farbaDvojbodky);

    // 3. matica (sekundy) – indexy 50..74
    matrix.setPixelColor(50 + d4, aktualnaFarba);  // desiatky sekúnd
    matrix.setPixelColor(60 + d5, aktualnaFarba);  // jednotky sekúnd
    // žiadna dvojbodka na tretej matici

    matrix.show();
}

// Nastavenie dvojbodiek (trvalé zap/vyp)
void setColons(bool leftOn, bool rightOn) {
    colonLeftOn = leftOn;
    colonRightOn = rightOn;
}