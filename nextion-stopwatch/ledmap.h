// Low‑level direct control of the WS2812B strip.
// Defines the leds[LED_NUM] array and functions:
//   - showDigits() – lights up 6 digits with a given colour using a pre‑defined map
//   - setColons(), setColonBlink() – colon control
//   - updateColonBlink() – periodic 1 Hz blinking
// ============================================================================

#ifndef LEDMAP_H
#define LEDMAP_H

#include <FastLED.h>
#include "config.h"

extern CRGB leds[LED_NUM];

// Live brightness update. Calls FastLED.setBrightness and re-shows the buffer.
void setLedBrightness(uint8_t b);

void initLeds();
void clearAll();

// Push the six digits (0..9, or -1 to leave that position blank) to the matrix
// in `color`. Colon LEDs follow the current blink state.
void showDigits(int d0, int d1, int d2, int d3, int d4, int d5, CRGB color);

void setColons(bool leftOn, bool rightOn, CRGB color);
void setColonBlink(bool enabled, unsigned long intervalMs);
void updateColonBlink();
void setColonColor(CRGB color);

// Force both colon LEDs to the given on/off state (using the current colon
// colour). Caller drives the blink rhythm — used to sync the colons with the
// actual displayed second instead of a free-running millis() timer.
void setColonPhase(bool on);

#endif