// High‑level control of the Lixie matrix (6 digits + two colons).
// Main modes:
//   - clockMode() – shows wall‑clock time (HH:MM:SS) in nixie orange
//   - startStopwatch() – starts a stopwatch, shows elapsed time in client colour
//   - holdDuration() – freezes the stopwatch at a fixed time (confirm save)
//   - tick() – call in loop(), updates the display according to the current mode
// ============================================================================

#ifndef LEDDISPLAY_H
#define LEDDISPLAY_H

#include <FastLED.h>
#include <stdint.h>

namespace LedDisplay {

void begin();

// Set the running mode (stopwatch). startMs is millis() captured at start.
// Pass color in CRGB — the client's swatch colour.
void startStopwatch(uint32_t startMs, CRGB color);

// Hold the matrix at a fixed duration (used while the user picks Save/Discard).
void holdDuration(uint32_t totalSeconds, CRGB color);

// Return to wall-clock display in nixie orange.
void clockMode();

// Blank everything (only for boot / errors — normally the matrix is always on).
void blank();

// Called every loop tick. Refreshes the digits at most ~once per second and
// manages the colon-blink animation.
void tick();

}

#endif
