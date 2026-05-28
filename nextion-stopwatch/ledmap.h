#ifndef LEDMAP_H
#define LEDMAP_H

#include <FastLED.h>
#include "config.h"

extern CRGB leds[LED_NUM];

void initLeds();
void clearAll();

// Push the six digits (0..9, or -1 to leave that position blank) to the matrix
// in `color`. Colon LEDs follow the current blink state.
void showDigits(int d0, int d1, int d2, int d3, int d4, int d5, CRGB color);

void setColons(bool leftOn, bool rightOn, CRGB color);
void setColonBlink(bool enabled, unsigned long intervalMs);
void updateColonBlink();

#endif
