// High‑level control of the Lixie matrix (6 digits + two colons).
// Main modes:
//   - clockMode() – shows wall‑clock time (HH:MM:SS) in Lixie orange
//   - startStopwatch() – starts a stopwatch, shows elapsed time in client colour
//   - holdDuration() – freezes the stopwatch at a fixed time (confirm save)
//   - tick() – call in loop(), updates the display according to the current mode
// ============================================================================

#ifndef LEDDISPLAY_H
#define LEDDISPLAY_H

#include <FastLED.h>
#include <stdint.h>

namespace LedDisplay {

// How the digits are coloured. Built from a style string (same format the
// dashboard stores for the clock and for each project):
//   ""                           one colour (the fallback)
//   "d:#RRGGBB,...,#RRGGBB"      exactly 6 colours, one per digit (H H M M S S)
//   "c:SEC:#RRGGBB,#RRGGBB,..."  2..8 colours all digits fade through, one
//                                full round every SEC seconds
// A plain CRGB converts implicitly to a one-colour style.
struct Style {
    CRGB     c[8];
    uint8_t  n        = 1;
    uint16_t cycleSec = 0;    // > 0 = cycle mode
    Style(CRGB x = CRGB::Black) { c[0] = x; }
};

// Invalid or empty spec → one-colour style in `fallback`.
Style parseStyle(const String& spec, CRGB fallback);

void begin();

// Set the running mode (stopwatch). startMs is millis() captured at start.
void startStopwatch(uint32_t startMs, const Style& style);

// Hold the matrix at a fixed duration (used while the user picks Save/Discard).
void holdDuration(uint32_t totalSeconds, const Style& style);

// Count down to `endMs` (a millis() timestamp) and hold 00:00:00 once it
// is reached. Used by the pomodoro focus / break timers.
void countdown(uint32_t endMs, const Style& style);

// Blink the digits twice a second to draw attention (idle reminder, break
// over). Works on top of any mode; clockMode() switches it off again.
void setAttention(bool on);

// Return to wall-clock display using the saved/default clock colour.
// Also ends any attention blink.
void clockMode();

// Override the colour used by clockMode(). Applies immediately if the matrix
// is currently in clock mode. setClockColorHex() parses "#RRGGBB" form.
void setClockColor(CRGB c);
void setClockColorHex(const String& hex);

// Optional style string (see Style) for clock mode; "" = plain clock colour.
void setClockStyle(const String& spec);

// Demo / showcase mode: while on, clock mode is replaced by a rainbow
// animation (real time alternating with rolling digits). Sessions still
// show their normal stopwatch.
void setDemo(bool on);

// Independent colour for the two colon LEDs. Stays the same across clock /
// stopwatch / hold modes — i.e. it does NOT follow the digit colour.
void setColonColorHex(const String& hex);

// Live brightness preview — does not write to NVS. Wraps the global
// setLedBrightness() so UI code can keep all LED ops under one facade.
void setBrightness(uint8_t b);

// Blank everything (only for boot / errors — normally the matrix is always on).
void blank();

// Called every loop tick. Refreshes the digits at most ~once per second and
// manages the colon-blink animation.
void tick();

}

#endif
