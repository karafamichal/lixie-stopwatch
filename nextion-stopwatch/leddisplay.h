#ifndef LEDDISPLAY_H
#define LEDDISPLAY_H

#include <FastLED.h>
#include <stdint.h>

// High-level Lixie matrix driver:
//   - When the device is idle / browsing menus, the matrix shows wall-clock
//     time (HH:MM:SS) in Lixie orange.
//   - When a session is running, the matrix shows the elapsed stopwatch time
//     in the selected client's colour.
//   - On the confirm screen, the matrix holds the final duration.
namespace LedDisplay {

void begin();

// Set the running mode (stopwatch). startMs is millis() captured at start.
// Pass color in CRGB — the client's swatch colour.
void startStopwatch(uint32_t startMs, CRGB color);

// Hold the matrix at a fixed duration (used while the user picks Save/Discard).
void holdDuration(uint32_t totalSeconds, CRGB color);

// Return to wall-clock display in Lixie orange.
void clockMode();

// Blank everything (only for boot / errors — normally the matrix is always on).
void blank();

// Called every loop tick. Refreshes the digits at most ~once per second and
// manages the colon-blink animation.
void tick();

}  // namespace LedDisplay

#endif
