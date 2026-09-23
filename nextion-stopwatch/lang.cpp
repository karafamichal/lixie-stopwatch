#include "lang.h"

static Language sLang = LANG_EN;

// Column order must match the Language enum: [LANG_EN, LANG_DE].
// ASCII only — the Nextion fonts have no umlaut glyphs (see lang.h).
static const char* const TABLE[S__COUNT][LANG_COUNT] = {
    // Shared chrome
    /* S_BACK               */ {"< Back",                          "< Zurueck"},
    /* S_APP_TITLE          */ {"LIXIE STOPWATCH",                 "LIXIE STOPWATCH"},

    // Boot
    /* S_BOOTING            */ {"Booting...",                      "Startet..."},
    /* S_WIFI_CONNECTING    */ {"Connecting to WiFi...",           "WLAN wird verbunden..."},
    /* S_WIFI_OK            */ {"WiFi OK: ",                       "WLAN OK: "},
    /* S_NTP_SYNCING        */ {"Syncing time (NTP)...",           "Uhrzeit wird geholt (NTP)..."},
    /* S_AP_SETUP_1         */ {"WiFi setup mode",                 "WLAN-Einrichtung"},
    /* S_AP_SETUP_2         */ {"Join '",                          "Verbinde mit '"},
    /* S_AP_SETUP_3         */ {"then open 192.168.4.1",           "dann 192.168.4.1 aufrufen"},

    // Idle
    /* S_WEATHER_UNAVAILABLE*/ {"Weather unavailable",             "Wetterdaten fehlen"},
    /* S_NEWS_LOADING       */ {"Loading news...",                 "Nachrichten laden..."},
    /* S_START              */ {"START",                           "START"},

    // Pickers
    /* S_SELECT_CLIENT      */ {"Select client",                   "Kunde waehlen"},
    /* S_NO_CLIENTS         */ {"No clients available",            "Keine Kunden vorhanden"},
    /* S_HINT_CLIENT        */ {"Tap a client to continue",        "Kunde antippen, um fortzufahren"},
    /* S_NO_PROJECTS        */ {"No projects for this client",     "Kunde hat keine Projekte"},
    /* S_HINT_PROJECT       */ {"Tap a project to continue",       "Projekt antippen, um fortzufahren"},
    /* S_NO_APPS            */ {"No apps available",               "Keine Apps vorhanden"},
    /* S_SKIP_APP           */ {"Skip app",                        "Ohne App"},
    /* S_HINT_CATEGORY      */ {"Pick a category, or skip the app","Kategorie antippen oder ohne App starten"},
    /* S_NO_APPS_IN_CATEGORY*/ {"No apps in this category",        "Keine Apps in dieser Kategorie"},
    /* S_HINT_APP           */ {"Pick the app you'll be using",    "Welche App benutzt du?"},
    /* S_NO_APP             */ {"(no app)",                        "(keine App)"},

    // Running
    /* S_PAUSED             */ {"PAUSED",                          "PAUSIERT"},
    /* S_RUNNING            */ {"RUNNING",                         "AKTIV"},
    /* S_STARTED_PREFIX     */ {"Started: ",                       "Start: "},
    /* S_CONTINUE           */ {"CONTINUE",                        "WEITER"},
    /* S_PAUSE              */ {"PAUSE",                           "PAUSE"},
    /* S_STOP               */ {"STOP",                            "STOPP"},

    // Confirm
    /* S_SAVE_SESSION_Q     */ {"Save session?",                   "Sitzung speichern?"},
    /* S_DURATION_PREFIX    */ {"Duration: ",                      "Dauer: "},
    /* S_DISCARD            */ {"Discard",                         "Verwerfen"},
    /* S_SAVE               */ {"Save",                            "Speichern"},

    // Discard confirm
    /* S_DISCARD_SESSION_Q  */ {"Discard session?",                "Zeit verwerfen?"},
    /* S_TIME_WILL_BE_LOST  */ {"All elapsed time will be lost.",  "Die erfasste Zeit geht verloren."},
    /* S_TRACKED_PREFIX     */ {"Tracked: ",                       "Erfasst: "},
    /* S_NO_KEEP            */ {"No, keep",                        "Behalten"},
    /* S_YES_DISCARD        */ {"Yes, discard",                    "Verwerfen"},

    // Settings
    /* S_SETTINGS           */ {"Settings",                        "Einstellungen"},
    /* S_CLOCK_COLOUR       */ {"Clock colour:",                   "Uhrfarbe:"},
    /* S_BRIGHTNESS         */ {"Brightness:",                     "Helligkeit:"},
    /* S_LANGUAGE           */ {"Language:",                       "Sprache:"},
    /* S_BRIGHT_LOW         */ {"Low",                             "Min"},
    /* S_BRIGHT_MED         */ {"Med",                             "Mittel"},
    /* S_BRIGHT_HIGH        */ {"High",                            "Hoch"},
    /* S_BRIGHT_MAX         */ {"Max",                             "Max"},
    /* S_CANCEL             */ {"Cancel",                          "Abbrechen"},

    // Toasts (FONT_LARGE inside a 360 px box — keep these short)
    /* S_TOAST_SAVED        */ {"Saved",                           "Gespeichert"},
    /* S_TOAST_SAVED_BANG   */ {"Saved!",                          "Gespeichert!"},
    /* S_TOAST_SAVE_FAILED  */ {"Save failed",                     "Speicherfehler"},
    /* S_TOAST_DISCARDED    */ {"Discarded",                       "Verworfen"},

    // Weather conditions
    /* S_WX_CLEAR           */ {"Clear",                           "Klar"},
    /* S_WX_PARTLY_CLOUDY   */ {"Partly cloudy",                   "Wolkig"},
    /* S_WX_FOG             */ {"Fog",                             "Nebel"},
    /* S_WX_DRIZZLE         */ {"Drizzle",                         "Nieselregen"},
    /* S_WX_RAIN            */ {"Rain",                            "Regen"},
    /* S_WX_SNOW            */ {"Snow",                            "Schnee"},
    /* S_WX_SHOWERS         */ {"Showers",                         "Schauer"},
    /* S_WX_SNOW_SHOWERS    */ {"Snow showers",                    "Schneeschauer"},
    /* S_WX_THUNDERSTORM    */ {"Thunderstorm",                    "Gewitter"},
    /* S_WX_UNKNOWN         */ {"Unknown",                         "Unbekannt"},

    // Offline queue, idle reminder, pomodoro, firmware update
    /* S_TOAST_SAVED_OFFLINE*/ {"Saved offline",                   "Lokal gesichert"},
    /* S_REMINDER_TITLE     */ {"Forgot to start?",                "Timer vergessen?"},
    /* S_REMINDER_BODY      */ {"No timer has run for a while.",   "Seit einer Weile laeuft kein Timer."},
    /* S_DISMISS            */ {"Dismiss",                         "Schliessen"},
    /* S_FOCUS_PREFIX       */ {"Focus: ",                         "Fokus: "},
    /* S_BREAK_PREFIX       */ {"Break: ",                         "Pause: "},
    /* S_BREAK_OVER         */ {"Break over - tap CONTINUE",       "Pause vorbei - WEITER tippen"},
    /* S_UPDATING           */ {"Updating firmware...",            "Firmware wird aktualisiert..."},
    /* S_UPDATE_FAILED      */ {"Update failed",                   "Update-Fehler"},
};

static const char* const NAMES[LANG_COUNT] = {"English", "Deutsch"};
static const char* const CODES[LANG_COUNT] = {"en", "de"};

namespace Lang {

Language current() { return sLang; }

void set(Language l) {
    if (l >= LANG_COUNT) l = LANG_EN;
    sLang = l;
}

const char* str(StrId id) {
    if (id >= S__COUNT) return "?";
    return TABLE[id][sLang];
}

const char* name(Language l) {
    return l < LANG_COUNT ? NAMES[l] : NAMES[LANG_EN];
}

const char* code(Language l) {
    return l < LANG_COUNT ? CODES[l] : CODES[LANG_EN];
}

Language fromCode(const char* c) {
    if (!c) return LANG_EN;
    for (int i = 0; i < LANG_COUNT; i++) {
        if (strcasecmp(c, CODES[i]) == 0) return (Language)i;
    }
    return LANG_EN;
}

// WMO weather-code groups as used by Open-Meteo's `weathercode`.
const char* weather(int c) {
    if (c == 0)  return str(S_WX_CLEAR);
    if (c <= 3)  return str(S_WX_PARTLY_CLOUDY);
    if (c <= 48) return str(S_WX_FOG);
    if (c <= 57) return str(S_WX_DRIZZLE);
    if (c <= 67) return str(S_WX_RAIN);
    if (c <= 77) return str(S_WX_SNOW);
    if (c <= 82) return str(S_WX_SHOWERS);
    if (c <= 86) return str(S_WX_SNOW_SHOWERS);
    if (c <= 99) return str(S_WX_THUNDERSTORM);
    return str(S_WX_UNKNOWN);
}

}  // namespace Lang
