#ifndef SETTINGS_H
#define SETTINGS_H

#include <Arduino.h>

// User-tweakable runtime preferences for the LED matrix. Persisted in NVS
// (Preferences namespace "leds"), survive power cycles. The on-device
// Settings screen writes here.
namespace Settings {

void begin();                              // load NVS values and apply them

// Main clock / stopwatch digit colour. Editable from the on-device menu
// and from the web dashboard.
String  clockColorHex();
void    setClockColorHex(const String& hex);

// Independent colour for the two colon LEDs. Only the web dashboard edits
// this — the on-device menu does not expose it, since it's a power-user knob.
String  colonColorHex();
void    setColonColorHex(const String& hex);

// Single global brightness (FastLED has one setting for the whole strip).
uint8_t brightness();
void    setBrightness(uint8_t b);

}  // namespace Settings

#endif
