#include "settings.h"
#include "config.h"
#include "leddisplay.h"
#include "ledmap.h"
#include "nextion.h"
#include <Preferences.h>

static String   sClockHex     = "#FF8000";
static String   sColonHex     = "#FF8000";
static uint8_t  sBrightness   = LED_BRIGHTNESS;
static uint8_t  sDisplayBri   = 100;     // backlight %
static uint16_t sSleepTimeout = 30;      // seconds; 0 = disabled
static bool     sSleepOnIdle  = false;
static Language sLanguage     = LANG_EN;

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

}  // namespace Settings
