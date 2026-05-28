#include "ledmap.h"

CRGB leds[LED_NUM];

// Per-position LED index for each digit (0..9). Calibrated for the assembled
// matrix — adjust per board if a particular segment is dark.
static const uint8_t ledIndex[6][10] = {
    { 5,  0,  2,  3,  4,  6,  7,  8,  9,  1},
    {15, 10, 11, 12, 13, 14, 16, 17, 18, 19},
    {25, 20, 21, 22, 23, 24, 26, 27, 28, 29},
    {35, 30, 31, 32, 33, 34, 36, 37, 38, 39},
    {45, 40, 41, 42, 43, 44, 46, 47, 48, 49},
    {55, 50, 51, 52, 53, 54, 56, 57, 58, 59}
};

static bool          colonLeftState  = false;
static bool          colonRightState = false;
static CRGB          colonColor      = CRGB(255, 80, 0);
static unsigned long lastBlink       = 0;
static bool          blinkEnabled    = false;
static unsigned long blinkInterval   = 1000;

void initLeds() {
    FastLED.addLeds<WS2812, LED_PIN, GRB>(leds, LED_NUM);
    FastLED.setBrightness(LED_BRIGHTNESS);
    clearAll();
}

void clearAll() {
    fill_solid(leds, LED_NUM, CRGB::Black);
    FastLED.show();
}

void showDigits(int d0, int d1, int d2, int d3, int d4, int d5, CRGB color) {
    for (int i = 0; i < 60; i++) leds[i] = CRGB::Black;

    int d[6] = {d0, d1, d2, d3, d4, d5};
    for (int p = 0; p < 6; p++) {
        if (d[p] >= 0 && d[p] <= 9) leds[ledIndex[p][d[p]]] = color;
    }

    leds[LED_COLON_LEFT]  = colonLeftState  ? colonColor : CRGB::Black;
    leds[LED_COLON_RIGHT] = colonRightState ? colonColor : CRGB::Black;
    FastLED.show();
}

void setColons(bool leftOn, bool rightOn, CRGB color) {
    colonLeftState  = leftOn;
    colonRightState = rightOn;
    colonColor      = color;
    blinkEnabled    = false;
    leds[LED_COLON_LEFT]  = leftOn  ? color : CRGB::Black;
    leds[LED_COLON_RIGHT] = rightOn ? color : CRGB::Black;
    FastLED.show();
}

void setColonBlink(bool enabled, unsigned long intervalMs) {
    blinkEnabled  = enabled;
    blinkInterval = intervalMs;
    lastBlink     = millis();
}

void updateColonBlink() {
    if (!blinkEnabled) return;
    unsigned long now = millis();
    if (now - lastBlink >= blinkInterval) {
        lastBlink = now;
        colonLeftState  = !colonLeftState;
        colonRightState = !colonRightState;
        leds[LED_COLON_LEFT]  = colonLeftState  ? colonColor : CRGB::Black;
        leds[LED_COLON_RIGHT] = colonRightState ? colonColor : CRGB::Black;
        FastLED.show();
    }
}
