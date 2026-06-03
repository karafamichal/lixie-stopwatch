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
    // matrix 1 — tens of hours
    { 1,0,8,9,11,10,18,19,21,20},
    // matrix 1 — units of hours
    {4,3,5,6,14,13,15,16,24,23},
    // matrix 2 — tens of minutes
    {26,25,33,34,36,35,43,44,46,45},
    // matrix 2 — units of minutes
    {29,28,30,31,39,38,40,41,49,48},
    // matrix 3 — tens of seconds
    {51,50,58,59,61,60,68,69,71,70},
    // matrix 3 — units of seconds
    {54,53,55,56,64,63,65,66,74,73}
};

static bool          colonLeftState  = false;
static bool          colonRightState = false;
static CRGB          colonColor      = CRGB(0, 255, 0);
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

void setLedBrightness(uint8_t b) {
    FastLED.setBrightness(b);
    FastLED.show();
}

void showDigits(int d0, int d1, int d2, int d3, int d4, int d5, CRGB color) {
    for (int i = 0; i < 75; i++) leds[i] = CRGB::Black;

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

void setColonColor(CRGB color) {
    colonColor = color;
    // Whether we are currently blinking or holding a fixed state, just
    // re-push both colon LEDs with the new colour so the change is visible
    // without waiting for the next toggle.
    leds[LED_COLON_LEFT]  = colonLeftState  ? colonColor : CRGB::Black;
    leds[LED_COLON_RIGHT] = colonRightState ? colonColor : CRGB::Black;
    FastLED.show();
}

void setColonBlink(bool enabled, unsigned long intervalMs) {
    blinkEnabled = enabled;
    blinkInterval = intervalMs;
    lastBlink = millis();
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

void setColonPhase(bool on) {
    colonLeftState  = on;
    colonRightState = on;
    leds[LED_COLON_LEFT]  = on ? colonColor : CRGB::Black;
    leds[LED_COLON_RIGHT] = on ? colonColor : CRGB::Black;
    FastLED.show();
}
