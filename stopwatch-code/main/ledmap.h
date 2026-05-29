#ifndef LEDMAP_H
#define LEDMAP_H

#include <Adafruit_NeoPixel.h>

#define PIN_MATRIX    13
#define NUM_LEDS      75

extern Adafruit_NeoPixel matrix;

void initLeds();
void clearAll();
void showDigits(int d0, int d1, int d2, int d3, int d4, int d5); // 6 cifier
void setColons(bool leftOn, bool rightOn); // ovládanie dvojbodiek

#endif