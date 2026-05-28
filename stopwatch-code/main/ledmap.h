#ifndef LEDMAP_H
#define LEDMAP_H

#include <FastLED.h>

#define NUM_LEDS       62
#define LED_PIN         5
#define COLON_LEFT_IDX  60
#define COLON_RIGHT_IDX 61

extern CRGB leds[NUM_LEDS];

void initLeds();
void clearAll();
void showDigits(int d0, int d1, int d2, int d3, int d4, int d5, CRGB color);
void setColons(bool leftOn, bool rightOn, CRGB color);
void setColonBlink(bool enabled, unsigned long intervalMs);
void updateColonBlink();   // <-- TÁTO DEKLARÁCIA MUSÍ BYŤ

#endif