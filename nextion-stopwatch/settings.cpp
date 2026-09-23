#include "settings.h"
#include "config.h"
#include "leddisplay.h"
#include "ledmap.h"
#include "nextion.h"
#include <Preferences.h>
#include <time.h>

static String   sClockHex     = "#FF8000";
static String   sColonHex     = "#FF8000";
static uint8_t  sBrightness   = LED_BRIGHTNESS;
static uint8_t  sDisplayBri   = 100;     // backlight %
static uint16_t sSleepTimeout = 30;      // seconds; 0 = disabled
static bool     sSleepOnIdle  = false;
static Language sLanguage     = LANG_EN;
static uint8_t  sPomodoroMin  = 0;       // 0 = pomodoro off
static uint8_t  sBreakMin     = 5;
static uint16_t sReminderMin  = 0;       // 0 = reminder off
static uint8_t  sNightStart   = 0;       // start == end = night mode off
static uint8_t  sNightEnd     = 0;
static uint8_t  sNightBri     = 10;

static void putU8(const char* key, uint8_t v) {
    Preferences p;
    p.begin("leds", false);
    p.putUChar(key, v);
    p.end();
}

static void apply() {
    LedDisplay::setClockColorHex(sClockHex);
    LedDisplay::setColonColorHex(sColonHex);
    setLedBrightness(sBrightness);
    Nextion::setDim(sDisplayBri);
    Lang::set(sLanguage);
}

namespace Settings {

void begin() {
    Preferences p;
    p.begin("leds", true);
    sClockHex     = p.getString("color",   "#FF8000");
    sColonHex     = p.getString("colon",   sClockHex);
    sBrightness   = p.getUChar ("bright",  LED_BRIGHTNESS);
    sDisplayBri   = p.getUChar ("dispbri", 100);
    sSleepTimeout = p.getUShort("sleeps",  30);
    sSleepOnIdle  = p.getBool  ("sleepidle", false);
    sLanguage     = (Language)p.getUChar("lang", LANG_EN);
    if (sLanguage >= LANG_COUNT) sLanguage = LANG_EN;
    sPomodoroMin  = p.getUChar ("pomo",   0);
    sBreakMin     = p.getUChar ("brk",    5);
    sReminderMin  = p.getUShort("remind", 0);
    sNightStart   = p.getUChar ("nstart", 0);
    sNightEnd     = p.getUChar ("nend",   0);
    sNightBri     = p.getUChar ("nbri",   10);
    p.end();
    apply();
    Serial.printf("[settings] clock=%s colon=%s bright=%u disp=%u sleep=%u idle=%d\n",
                  sClockHex.c_str(), sColonHex.c_str(), sBrightness,
                  sDisplayBri, sSleepTimeout, (int)sSleepOnIdle);
}

String   clockColorHex()    { return sClockHex; }
String   colonColorHex()    { return sColonHex; }
uint8_t  brightness()       { return sBrightness; }
uint8_t  displayBrightness(){ return sDisplayBri; }
uint16_t sleepTimeoutSec()  { return sSleepTimeout; }
bool     sleepOnIdle()      { return sSleepOnIdle; }
Language language()         { return sLanguage; }

void setClockColorHex(const String& hex) {
    if (hex.length() != 7 || hex[0] != '#') return;
    sClockHex = hex;
    Preferences p;
    p.begin("leds", false);
    p.putString("color", hex);
    p.end();
    LedDisplay::setClockColorHex(hex);
}

void setColonColorHex(const String& hex) {
    if (hex.length() != 7 || hex[0] != '#') return;
    sColonHex = hex;
    Preferences p;
    p.begin("leds", false);
    p.putString("colon", hex);
    p.end();
    LedDisplay::setColonColorHex(hex);
}

void setBrightness(uint8_t b) {
    sBrightness = b;
    Preferences p;
    p.begin("leds", false);
    p.putUChar("bright", b);
    p.end();
    setLedBrightness(b);
}

void setDisplayBrightness(uint8_t pct) {
    if (pct > 100) pct = 100;
    sDisplayBri = pct;
    Preferences p;
    p.begin("leds", false);
    p.putUChar("dispbri", pct);
    p.end();
    Nextion::setDim(pct);
}

void setSleepTimeoutSec(uint16_t s) {
    sSleepTimeout = s;
    Preferences p;
    p.begin("leds", false);
    p.putUShort("sleeps", s);
    p.end();
}

void setSleepOnIdle(bool on) {
    sSleepOnIdle = on;
    Preferences p;
    p.begin("leds", false);
    p.putBool("sleepidle", on);
    p.end();
}

void setLanguage(Language l) {
    if (l >= LANG_COUNT) return;
    sLanguage = l;
    Preferences p;
    p.begin("leds", false);
    p.putUChar("lang", (uint8_t)l);
    p.end();
    Lang::set(l);
}

uint8_t  pomodoroMin()     { return sPomodoroMin; }
uint8_t  breakMin()        { return sBreakMin; }
uint16_t reminderMin()     { return sReminderMin; }
uint8_t  nightStart()      { return sNightStart; }
uint8_t  nightEnd()        { return sNightEnd; }
uint8_t  nightBrightness() { return sNightBri; }

void setPomodoroMin(uint8_t m) { sPomodoroMin = m; putU8("pomo", m); }
void setBreakMin(uint8_t m)    { sBreakMin = m ? m : 1; putU8("brk", sBreakMin); }
void setNightStart(uint8_t h)  { sNightStart = h % 24; putU8("nstart", sNightStart); }
void setNightEnd(uint8_t h)    { sNightEnd = h % 24; putU8("nend", sNightEnd); }
void setNightBrightness(uint8_t b) { sNightBri = b; putU8("nbri", b); }

void setReminderMin(uint16_t m) {
    sReminderMin = m;
    Preferences p;
    p.begin("leds", false);
    p.putUShort("remind", m);
    p.end();
}

bool isNightNow() {
    if (sNightStart == sNightEnd) return false;
    time_t t = time(nullptr);
    if (t < 100000) return false;          // clock not synced yet
    struct tm tm_local;
    localtime_r(&t, &tm_local);
    int h = tm_local.tm_hour;
    return sNightStart < sNightEnd
        ? (h >= sNightStart && h < sNightEnd)     // e.g. 01..06
        : (h >= sNightStart || h < sNightEnd);    // wraps midnight, e.g. 22..06
}

void applyNightMode(bool sessionActive) {
    uint8_t want = (!sessionActive && isNightNow()) ? sNightBri : sBrightness;
    // Level-triggered: also repairs the brightness after anything else
    // (dashboard push, settings preview) changed it behind our back.
    if (FastLED.getBrightness() != want) setLedBrightness(want);
}

}  // namespace Settings
