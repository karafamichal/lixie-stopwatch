// Contains the ledIndex[6][10] lookup table – which LED (0..59) lights up
// for which digit at each position (e.g. for the thousands). Adjust this if
// your matrix is wired differently.
// Also controls the two separate colon LEDs (indices 60 and 61).
// ============================================================================

#include "ledmap.h"

CRGB leds[LED_NUM];

// Per-position LED index for each digit (0..9). Calibrated for the assembled
// matrix — adjust per board if a particular segment is dark.
static const uint8_t ledIndex[6][10] = {
    //matrix1 deiatky hodin
    { 4, 3, 5, 6, 14, 13, 15, 16, 24, 23},
    //matrix1 jednotky hodin
    {1, 0, 8, 9, 11, 10, 18, 19, 21, 20},
    //matrix2 deiatky minut
    {},
    //matrix2 jednotky minut
    {44, 35, 43, 36, 42, 37, 41, 38, 46, 39},
    //matrix3 desiatky sekund
    {59, 50, 58, 51, 57, 52, 56, 53, 55, 54},
    //matrix3 jednotky sekund
    {69, 60, 68, 61, 67, 62, 66, 63, 65, 64}
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
    for (int i = 0; i < 70; i++) leds[i] = CRGB::Black;

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
