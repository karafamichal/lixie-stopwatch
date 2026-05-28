#ifndef LEDMAP_H
#define LEDMAP_H

#include <FastLED.h>

#define NUM_LEDS       62   // 60 cifier + 2 dvojbodky
#define LED_PIN         5   // GPIO pin pre WS2812

// Indexy pre dvojbodky (musíš doplniť podľa fyzického zapojenia)
#define COLON_LEFT_IDX  60   // ľavá dvojbodka (napr. medzi 2. a 3. číslicou)
#define COLON_RIGHT_IDX 61   // pravá dvojbodka (napr. medzi 4. a 5. číslicou)

extern CRGB leds[NUM_LEDS];

void initLeds();
void clearAll();
void showDigits(int d0, int d1, int d2, int d3, int d4, int d5, CRGB color);
void setColons(bool leftOn, bool rightOn, CRGB color);   // zapne/vypne dvojbodky
void setColonBlink(bool enabled, unsigned long intervalMs); // jednoduché blikanie

#endif