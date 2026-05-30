#ifndef SETTINGS_H
#define SETTINGS_H

#include <Arduino.h>

// User-tweakable runtime preferences for the LED matrix. Persisted in NVS
// (Preferences namespace "leds"), survive power cycles. The on-device
// Settings screen writes here.
namespace Settings {

void begin();                              // load NVS values and apply them

String  clockColorHex();                   // current setting
void    setClockColorHex(const String& hex);  // save + apply immediately

uint8_t brightness();
void    setBrightness(uint8_t b);

}  // namespace Settings

#endif
