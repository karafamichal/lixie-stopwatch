#include "settings.h"
#include "config.h"
#include "leddisplay.h"
#include "ledmap.h"
#include <Preferences.h>

static String  sClockHex   = "#FF8000";
static String  sColonHex   = "#FF8000";
static uint8_t sBrightness = LED_BRIGHTNESS;

static void apply() {
    LedDisplay::setClockColorHex(sClockHex);
    LedDisplay::setColonColorHex(sColonHex);
    setLedBrightness(sBrightness);
}

namespace Settings {

void begin() {
    Preferences p;
    p.begin("leds", true);
    sClockHex   = p.getString("color",  "#FF8000");
    sColonHex   = p.getString("colon",  sClockHex);   // default = same as clock
    sBrightness = p.getUChar ("bright", LED_BRIGHTNESS);
    p.end();
    apply();
    Serial.printf("[settings] clock=%s colon=%s bright=%u\n",
                  sClockHex.c_str(), sColonHex.c_str(), sBrightness);
}

String  clockColorHex() { return sClockHex; }
String  colonColorHex() { return sColonHex; }
uint8_t brightness()    { return sBrightness; }

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

}  // namespace Settings
