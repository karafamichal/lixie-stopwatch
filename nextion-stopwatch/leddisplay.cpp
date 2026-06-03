// Implements the display logic.
// Keeps track of the current mode (CLOCK, STOPWATCH, HOLD, BLANK).
// In CLOCK mode it reads system time via time(nullptr) and splits into hours/
// minutes/seconds. In STOPWATCH it computes the difference from sStartMs.
// Calls low‑level functions from ledmap.cpp to light up individual LEDs.
//
// Colon LEDs (the two "seconds" dots) have an INDEPENDENT colour that does
// not change with mode — only Settings::setColonColorHex() (driven by the
// web dashboard) updates them. Their on/off rhythm is driven from the same
// second tick as the digits: every time the displayed second changes the
// colons flip state. That gives a one-second-on / one-second-off cadence —
// the same look as a digital wall clock — and the dots can never drift out
// of sync with the visible seconds because the same tick changes both.
// ============================================================================

#include "leddisplay.h"
#include "ledmap.h"
#include <time.h>

namespace LedDisplay {

enum Mode { MODE_BLANK, MODE_CLOCK, MODE_STOPWATCH, MODE_HOLD };

static Mode     sMode        = MODE_BLANK;
static CRGB     sColor       = CRGB(255, 128, 0); // active draw colour
static CRGB     sClockColor  = CRGB(255, 128, 0); // colour reused on clockMode()
static uint32_t sStartMs     = 0;
static uint32_t sHoldSeconds = 0;
static uint32_t sLastSec     = 0xFFFFFFFF;          // force first draw
// Colon phase. Flipped once per visible second tick. Tracked here so we can
// also pin it on (HOLD) or off (BLANK) without disturbing the toggle counter.
static bool     sColonOn     = false;

static void pushTime(uint32_t totalSec) {
    uint32_t s = totalSec % 60;
    uint32_t m = (totalSec / 60) % 60;
    uint32_t h = (totalSec / 3600) % 24;
    showDigits(h / 10, h % 10, m / 10, m % 10, s / 10, s % 10, sColor);
}

static void forceColon(bool on) {
    if (on == sColonOn) return;
    sColonOn = on;
    setColonPhase(on);
}

void begin() {
    initLeds();
    // Colon is driven from tick() in sync with the displayed second.
    // No free-running blink timer.
    sMode    = MODE_CLOCK;
    sLastSec = 0xFFFFFFFF;
    sColonOn = false;
}

void startStopwatch(uint32_t startMs, CRGB color) {
    sMode    = MODE_STOPWATCH;
    sStartMs = startMs;
    sColor   = color;
    sLastSec = 0xFFFFFFFF;
}

void holdDuration(uint32_t totalSeconds, CRGB color) {
    sMode        = MODE_HOLD;
    sHoldSeconds = totalSeconds;
    sColor       = color;
    sLastSec     = 0xFFFFFFFF;
}

void clockMode() {
    sMode    = MODE_CLOCK;
    sColor   = sClockColor;
    sLastSec = 0xFFFFFFFF;
}

void setClockColor(CRGB c) {
    sClockColor = c;
    if (sMode == MODE_CLOCK) {
        sColor = c;
        sLastSec = 0xFFFFFFFF;   // force re-draw on next tick
    }
}

void setClockColorHex(const String& hex) {
    if (hex.length() != 7 || hex[0] != '#') return;
    long v = strtol(hex.c_str() + 1, nullptr, 16);
    setClockColor(CRGB((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF));
}

void setColonColorHex(const String& hex) {
    if (hex.length() != 7 || hex[0] != '#') return;
    long v = strtol(hex.c_str() + 1, nullptr, 16);
    setColonColor(CRGB((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF));
}

void setBrightness(uint8_t b) {
    setLedBrightness(b);
}

void blank() {
    sMode = MODE_BLANK;
    clearAll();
}

void tick() {
    switch (sMode) {
        case MODE_BLANK:
            forceColon(false);
            return;

        case MODE_CLOCK: {
            time_t t = time(nullptr);
            struct tm tm_local;
            localtime_r(&t, &tm_local);
            uint32_t sec = (uint32_t)tm_local.tm_hour * 3600
                         + (uint32_t)tm_local.tm_min  * 60
                         + (uint32_t)tm_local.tm_sec;
            if (sec != sLastSec) {
                // New second → redraw digits AND flip the colon. One full
                // second on, one full second off — the same cadence as a
                // digital wall clock.
                sLastSec = sec;
                pushTime(sec);
                forceColon(!sColonOn);
            }
            return;
        }

        case MODE_STOPWATCH: {
            uint32_t elapsedSec = (millis() - sStartMs) / 1000;
            if (elapsedSec != sLastSec) {
                sLastSec = elapsedSec;
                pushTime(elapsedSec);
                forceColon(!sColonOn);
            }
            return;
        }

        case MODE_HOLD:
            if (sLastSec != sHoldSeconds) {
                sLastSec = sHoldSeconds;
                pushTime(sHoldSeconds);
            }
            // Frozen display — keep the dots steady on so the colons don't
            // look broken while the user picks Save/Discard.
            forceColon(true);
            return;
    }
}

}
