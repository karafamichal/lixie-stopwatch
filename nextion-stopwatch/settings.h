#ifndef SETTINGS_H
#define SETTINGS_H

#include <Arduino.h>
#include "lang.h"

// User-tweakable runtime preferences for the LED matrix and the Nextion
// touch display. Persisted in NVS (Preferences namespace "leds"), survive
// power cycles. The on-device Settings screen writes the LED ones; the
// rest only arrive via the WebSocket from the dashboard (language is
// editable from both).
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

// Single global LED-matrix brightness (FastLED has one setting for the
// whole strip).
uint8_t brightness();
void    setBrightness(uint8_t b);

// Nextion display backlight, 0..100 (%). 0 = backlight off.
uint8_t displayBrightness();
void    setDisplayBrightness(uint8_t pct);

// Auto-sleep timeout (seconds) for the Nextion screen — after this many
// seconds with no touch, swap the active stopwatch view for a minimalist
// icon screen so the display isn't distracting. 0 disables the feature.
uint16_t sleepTimeoutSec();
void     setSleepTimeoutSec(uint16_t s);

// When true the sleep timeout also applies to the idle/home screen (a
// coffee-cup icon replaces the title + buttons). When false, sleep is
// only entered from the running stopwatch view.
bool sleepOnIdle();
void setSleepOnIdle(bool on);

// UI language of the Nextion display. Editable from the on-device Settings
// screen and from the web dashboard. Applied to Lang:: immediately.
Language language();
void     setLanguage(Language l);

// Pomodoro: focus block length in minutes (0 = off) and the break that
// follows each block. Dashboard-only.
uint8_t pomodoroMin();
void    setPomodoroMin(uint8_t m);
uint8_t breakMin();
void    setBreakMin(uint8_t m);

// Idle reminder: minutes on the home screen without a touch before the
// "Forgot to start?" prompt appears (0 = off). Dashboard-only.
uint16_t reminderMin();
void     setReminderMin(uint16_t m);

// Night mode: between nightStart and nightEnd (local hours, 0..23, the
// window may wrap past midnight) the LED matrix drops to nightBrightness
// (0 = off). Disabled while start == end. Dashboard-only.
uint8_t nightStart();
uint8_t nightEnd();
uint8_t nightBrightness();
void    setNightStart(uint8_t h);
void    setNightEnd(uint8_t h);
void    setNightBrightness(uint8_t b);

// True while the local time is inside the night window (false before NTP).
bool isNightNow();

// Call about once a second. Applies the night brightness or the normal one;
// `sessionActive` keeps full brightness while someone is timing work.
void applyNightMode(bool sessionActive);

}  // namespace Settings

#endif
