// Implements the display logic.
// Keeps track of the current mode (CLOCK, STOPWATCH, HOLD, BLANK).
// In CLOCK mode it reads system time via time(nullptr) and splits into hours/
// minutes/seconds. In STOPWATCH it computes the difference from sStartMs.
// Calls low‑level functions from ledmap.cpp to light up individual LEDs.
// ============================================================================

#include "leddisplay.h"
#include "ledmap.h"
#include <time.h>

namespace LedDisplay {

enum Mode { MODE_BLANK, MODE_CLOCK, MODE_STOPWATCH, MODE_HOLD };

static Mode     sMode        = MODE_BLANK;
static CRGB     sColor       = CRGB(255, 80, 0);   // Nixie orange
static uint32_t sStartMs     = 0;
static uint32_t sHoldSeconds = 0;
static uint32_t sLastSec     = 0xFFFFFFFF;          // force first draw

static void pushTime(uint32_t totalSec) {
    uint32_t s = totalSec % 60;
    uint32_t m = (totalSec / 60) % 60;
    uint32_t h = (totalSec / 3600) % 24;
    showDigits(h / 10, h % 10, m / 10, m % 10, s / 10, s % 10, sColor);
}

void begin() {
    initLeds();
    setColonBlink(true, 1000);
    sMode = MODE_CLOCK;
    sLastSec = 0xFFFFFFFF;
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
    sColor   = CRGB(255, 80, 0);
    sLastSec = 0xFFFFFFFF;
}

void blank() {
    sMode = MODE_BLANK;
    clearAll();
}

void tick() {
    updateColonBlink();

    uint32_t now;
    switch (sMode) {
        case MODE_BLANK:
            return;

        case MODE_CLOCK: {
            time_t t = time(nullptr);
            struct tm tm_local;
            localtime_r(&t, &tm_local);
            uint32_t sec = (uint32_t)tm_local.tm_hour * 3600
                         + (uint32_t)tm_local.tm_min  * 60
                         + (uint32_t)tm_local.tm_sec;
            if (sec == sLastSec) return;
            sLastSec = sec;
            pushTime(sec);
            return;
        }

        case MODE_STOPWATCH:
            now = (millis() - sStartMs) / 1000;
            if (now == sLastSec) return;
            sLastSec = now;
            pushTime(now);
            return;

        case MODE_HOLD:
            if (sLastSec == sHoldSeconds) return;
            sLastSec = sHoldSeconds;
            pushTime(sHoldSeconds);
            return;
    }
}

}
