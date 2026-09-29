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
//
// Digit colours come from a Style (one colour, one per digit, or a colour
// cycle). A cycling style is redrawn every ANIM_MS so the fade is smooth;
// everything else only redraws when the shown second changes.
// ============================================================================

#include "leddisplay.h"
#include "ledmap.h"
#include <time.h>

namespace LedDisplay {

enum Mode { MODE_BLANK, MODE_CLOCK, MODE_STOPWATCH, MODE_HOLD, MODE_COUNTDOWN };

static const uint32_t ANIM_MS = 40;                 // ~25 fps for cycles / demo

static Mode     sMode        = MODE_BLANK;
static Style    sStyle       = CRGB(255, 128, 0);   // active draw style
static CRGB     sClockColor  = CRGB(255, 128, 0);   // colour reused on clockMode()
static String   sClockSpec;                         // optional clock style string
static uint32_t sStartMs     = 0;
static uint32_t sHoldSeconds = 0;
static uint32_t sLastSec     = 0xFFFFFFFF;          // force first draw
static uint32_t sShownSec    = 0;                   // what pushTime() last drew
static uint32_t sLastDrawMs  = 0;
// Colon phase. Flipped once per visible second tick. Tracked here so we can
// also pin it on (HOLD) or off (BLANK) without disturbing the toggle counter.
static bool     sColonOn     = false;
static uint32_t sEndMs       = 0;                   // MODE_COUNTDOWN target
static bool     sAttention   = false;               // blink the digits
static bool     sAttnDark    = false;               // current blink phase
static bool     sDemo        = false;

Style parseStyle(const String& spec, CRGB fallback) {
    Style s(fallback);
    const char* p = spec.c_str();
    char* end;
    uint16_t sec = 0;
    if (p[0] == 'c' && p[1] == ':') {
        unsigned long v = strtoul(p + 2, &end, 10);
        if (*end != ':' || v < 1 || v > 3600) return Style(fallback);
        sec = (uint16_t)v;
        p   = end + 1;
    } else if (p[0] == 'd' && p[1] == ':') {
        p += 2;
    } else {
        return s;
    }
    uint8_t n = 0;
    while (n < 8 && *p == '#') {
        long v = strtol(p + 1, &end, 16);
        if (end - p != 7) return Style(fallback);
        s.c[n++] = CRGB((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
        p = *end == ',' ? end + 1 : end;
    }
    if (*p || (sec ? n < 2 : n != 6)) return Style(fallback);
    s.n        = n;
    s.cycleSec = sec;
    return s;
}

static CRGB colourAt(const Style& s, int pos, uint32_t ms) {
    if (s.cycleSec) {
        uint32_t period = (uint32_t)s.cycleSec * 1000UL;
        float    f      = (float)(ms % period) / period * s.n;   // 0 .. n
        int      i      = (int)f;
        return blend(s.c[i % s.n], s.c[(i + 1) % s.n], (uint8_t)((f - i) * 255));
    }
    return s.n == 6 ? s.c[pos] : s.c[0];
}

static void pushTime(uint32_t totalSec) {
    sShownSec   = totalSec;
    sLastDrawMs = millis();
    CRGB cols[6];
    for (int p = 0; p < 6; p++) cols[p] = colourAt(sStyle, p, sLastDrawMs);
    if (sAttention && sAttnDark) {
        const int none[6] = {-1, -1, -1, -1, -1, -1};
        showDigits(none, cols);
        return;
    }
    uint32_t s = totalSec % 60;
    uint32_t m = (totalSec / 60) % 60;
    uint32_t h = (totalSec / 3600) % 24;
    const int d[6] = {(int)(h / 10), (int)(h % 10), (int)(m / 10),
                      (int)(m % 10), (int)(s / 10), (int)(s % 10)};
    showDigits(d, cols);
}

static void forceColon(bool on) {
    if (on == sColonOn) return;
    sColonOn = on;
    setColonPhase(on);
}

static uint32_t clockSec() {
    time_t t = time(nullptr);
    struct tm tm_local;
    localtime_r(&t, &tm_local);
    return (uint32_t)tm_local.tm_hour * 3600
         + (uint32_t)tm_local.tm_min  * 60
         + (uint32_t)tm_local.tm_sec;
}

// Showcase animation: 12 s of the real time in a moving rainbow, then 8 s
// of every digit rolling through 0..9 like a slot machine.
static void tickDemo() {
    uint32_t ms = millis();
    if (ms - sLastDrawMs < ANIM_MS) return;
    sLastDrawMs = ms;

    int d[6];
    if ((ms / 1000) % 20 < 12) {
        uint32_t sec = clockSec();
        uint32_t h = sec / 3600, m = (sec / 60) % 60, s = sec % 60;
        int t[6] = {(int)(h / 10), (int)(h % 10), (int)(m / 10),
                    (int)(m % 10), (int)(s / 10), (int)(s % 10)};
        memcpy(d, t, sizeof(d));
    } else {
        for (int p = 0; p < 6; p++) d[p] = (ms / 90 + p) % 10;
    }
    CRGB cols[6];
    uint8_t hue = ms / 20;                          // full rainbow every ~5 s
    for (int p = 0; p < 6; p++) cols[p] = CHSV(hue + p * 24, 255, 255);
    showDigits(d, cols);
    forceColon((ms / 500) & 1);
}

void begin() {
    initLeds();
    // Colon is driven from tick() in sync with the displayed second.
    // No free-running blink timer.
    sMode    = MODE_CLOCK;
    sLastSec = 0xFFFFFFFF;
    sColonOn = false;
}

void startStopwatch(uint32_t startMs, const Style& style) {
    sMode    = MODE_STOPWATCH;
    sStartMs = startMs;
    sStyle   = style;
    sLastSec = 0xFFFFFFFF;
}

void holdDuration(uint32_t totalSeconds, const Style& style) {
    sMode        = MODE_HOLD;
    sHoldSeconds = totalSeconds;
    sStyle       = style;
    sLastSec     = 0xFFFFFFFF;
}

void countdown(uint32_t endMs, const Style& style) {
    sMode    = MODE_COUNTDOWN;
    sEndMs   = endMs;
    sStyle   = style;
    sLastSec = 0xFFFFFFFF;
}

void setAttention(bool on) {
    sAttention = on;
    sAttnDark  = false;
    sLastSec   = 0xFFFFFFFF;   // redraw with digits visible
}

void clockMode() {
    sMode      = MODE_CLOCK;
    sStyle     = parseStyle(sClockSpec, sClockColor);
    sAttention = false;
    sAttnDark  = false;
    sLastSec   = 0xFFFFFFFF;
}

static void refreshClock() {
    if (sMode == MODE_CLOCK) clockMode();   // re-derive style, force re-draw
}

void setClockColor(CRGB c) {
    sClockColor = c;
    refreshClock();
}

void setClockColorHex(const String& hex) {
    if (hex.length() != 7 || hex[0] != '#') return;
    long v = strtol(hex.c_str() + 1, nullptr, 16);
    setClockColor(CRGB((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF));
}

void setClockStyle(const String& spec) {
    sClockSpec = spec;
    refreshClock();
}

void setDemo(bool on) {
    sDemo    = on;
    sLastSec = 0xFFFFFFFF;
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
    // Attention blink: flip every 500 ms and force the active mode to redraw.
    if (sAttention) {
        bool dark = (millis() / 500) & 1;
        if (dark != sAttnDark) {
            sAttnDark = dark;
            sLastSec  = 0xFFFFFFFF;
        }
    }

    switch (sMode) {
        case MODE_BLANK:
            forceColon(false);
            return;

        case MODE_CLOCK: {
            if (sDemo) { tickDemo(); return; }
            uint32_t sec = clockSec();
            if (sec != sLastSec) {
                // New second → redraw digits AND flip the colon. One full
                // second on, one full second off — the same cadence as a
                // digital wall clock.
                sLastSec = sec;
                pushTime(sec);
                forceColon(!sColonOn);
            }
            break;
        }

        case MODE_STOPWATCH: {
            uint32_t elapsedSec = (millis() - sStartMs) / 1000;
            if (elapsedSec != sLastSec) {
                sLastSec = elapsedSec;
                pushTime(elapsedSec);
                forceColon(!sColonOn);
            }
            break;
        }

        case MODE_COUNTDOWN: {
            int32_t  leftMs = (int32_t)(sEndMs - millis());
            uint32_t sec    = leftMs > 0 ? ((uint32_t)leftMs + 999) / 1000 : 0;
            if (sec != sLastSec) {
                sLastSec = sec;
                pushTime(sec);
                forceColon(sec == 0 ? true : !sColonOn);
            }
            break;
        }

        case MODE_HOLD:
            if (sLastSec != sHoldSeconds) {
                sLastSec = sHoldSeconds;
                pushTime(sHoldSeconds);
            }
            // Frozen display — keep the dots steady on so the colons don't
            // look broken while the user picks Save/Discard.
            forceColon(true);
            break;
    }

    // Colour cycle: keep fading between second ticks.
    if (sStyle.cycleSec && millis() - sLastDrawMs >= ANIM_MS) pushTime(sShownSec);
}

}
