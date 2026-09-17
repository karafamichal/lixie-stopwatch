// UI language support for the Nextion touch display.
//
// Every user-visible string the firmware draws lives in one table per
// language (see lang.cpp). Screens call TR(S_...) instead of a literal so
// switching the language is a single NVS write + redraw.
//
// The Nextion fonts are generated with the ASCII charset only (see
// HMI_SETUP.md), so translations must not contain umlauts / sharp-s —
// use "ae/oe/ue/ss" or pick wording that avoids them.
// ============================================================================

#ifndef LANG_H
#define LANG_H

#include <Arduino.h>

enum Language : uint8_t {
    LANG_EN = 0,
    LANG_DE = 1,
    LANG_COUNT
};

// String identifiers — one per distinct piece of on-screen text.
enum StrId : uint8_t {
    // Shared chrome
    S_BACK,                 // "< Back"
    S_APP_TITLE,            // "LIXIE STOPWATCH"

    // Boot
    S_BOOTING,
    S_WIFI_CONNECTING,
    S_WIFI_OK,              // prefix, IP appended
    S_NTP_SYNCING,
    S_AP_SETUP_1,           // "WiFi setup mode"
    S_AP_SETUP_2,           // "Join '" (SSID appended by caller)
    S_AP_SETUP_3,           // "then open 192.168.4.1"

    // Idle
    S_WEATHER_UNAVAILABLE,
    S_NEWS_LOADING,
    S_START,

    // Pickers
    S_SELECT_CLIENT,
    S_NO_CLIENTS,
    S_HINT_CLIENT,
    S_NO_PROJECTS,
    S_HINT_PROJECT,
    S_NO_APPS,
    S_SKIP_APP,
    S_HINT_CATEGORY,
    S_NO_APPS_IN_CATEGORY,
    S_HINT_APP,
    S_NO_APP,               // "(no app)"

    // Running
    S_PAUSED,
    S_RUNNING,
    S_STARTED_PREFIX,       // "Started: "
    S_CONTINUE,
    S_PAUSE,
    S_STOP,

    // Confirm
    S_SAVE_SESSION_Q,
    S_DURATION_PREFIX,
    S_DISCARD,
    S_SAVE,

    // Discard confirm
    S_DISCARD_SESSION_Q,
    S_TIME_WILL_BE_LOST,
    S_TRACKED_PREFIX,
    S_NO_KEEP,
    S_YES_DISCARD,

    // Settings
    S_SETTINGS,
    S_CLOCK_COLOUR,
    S_BRIGHTNESS,
    S_LANGUAGE,
    S_BRIGHT_LOW,
    S_BRIGHT_MED,
    S_BRIGHT_HIGH,
    S_BRIGHT_MAX,
    S_CANCEL,

    // Toasts
    S_TOAST_SAVED,          // settings saved
    S_TOAST_SAVED_BANG,     // session saved
    S_TOAST_SAVE_FAILED,
    S_TOAST_DISCARDED,

    // Weather conditions (WMO groups)
    S_WX_CLEAR,
    S_WX_PARTLY_CLOUDY,
    S_WX_FOG,
    S_WX_DRIZZLE,
    S_WX_RAIN,
    S_WX_SNOW,
    S_WX_SHOWERS,
    S_WX_SNOW_SHOWERS,
    S_WX_THUNDERSTORM,
    S_WX_UNKNOWN,

    S__COUNT
};

namespace Lang {

// Currently active language (kept in sync by Settings).
Language current();
void     set(Language l);

// Translated text for `id` in the active language.
const char* str(StrId id);

// Native display name of a language, e.g. "English" / "Deutsch".
const char* name(Language l);

// Two-letter code used on the wire ("en" / "de") and its inverse. Unknown
// codes return LANG_EN.
const char* code(Language l);
Language    fromCode(const char* code);

// Localized label for an Open-Meteo WMO weather code.
const char* weather(int wmoCode);

}  // namespace Lang

// Short alias so call sites stay readable: TR(S_SAVE)
#define TR(id) Lang::str(id)

#endif
