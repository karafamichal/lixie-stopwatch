// All the user interface logic.
// Contains:
//   - drawing of each screen (drawIdle, drawClientScreen...)
//   - touch handlers (onTouchClient, onTouchProject...)
//   - calls to Api functions to fetch clients/projects/apps
//   - control of the LED matrix (LedDisplay::startStopwatch, holdDuration...)
//   - posting timelogs (Api::postTimelog)
// This is the largest file – it connects the display, API and LED matrix.
// ============================================================================

#include "ui.h"
#include "api.h"
#include "config.h"
#include "leddisplay.h"
#include "ledmap.h"
#include "weather.h"
#include "news.h"
#include "settings.h"
#include <WiFi.h>
#include <time.h>
#include <FastLED.h>

namespace UI {

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
static Screen   sScreen     = SCR_BOOT;
static Screen   sPrevScreen = SCR_BOOT;
static bool     sDirty      = true;

static Entity sClients[MAX_ENTITIES];      static int sClientCount       = 0;
static Entity sProjects[MAX_ENTITIES];     static int sProjectCount      = 0;
static Entity sApps[MAX_ENTITIES];         static int sAppCount          = 0;
// Categories derived from sApps[].extra so the app picker doesn't force the
// user to scroll past every tool. Filled by buildCategoryList().
static Entity sCategories[MAX_ENTITIES];   static int sCategoryCount     = 0;
// Apps filtered down to the one category the user just picked — drawn on
// SCR_APP instead of the full sApps[] list.
static Entity sCategoryApps[MAX_ENTITIES]; static int sCategoryAppCount  = 0;
static String sSelCategory;                // empty = none picked yet

// One scroll offset per list-screen. Preserved across back-navigation, reset
// only when the underlying list is refetched (new client → fresh project list).
static int sClientOffset   = 0;
static int sProjectOffset  = 0;
static int sCategoryOffset = 0;
static int sAppOffset      = 0;

static const int LIST_VISIBLE        = 4;
// Category and app pickers leave room at the bottom for the "Skip app"
// button, so they show one fewer row to keep text from being covered.
static const int LIST_VISIBLE_SHORT  = 3;
static const int ROW_H = 44;
static const int ROW_X = 12, ROW_Y0 = 52, ROW_W = 376;

// Current selection
static int sSelClient  = -1;   static String sSelClientName;  static String sSelClientHex;
static int sSelProject = -1;   static String sSelProjectName; static String sSelProjectHex;
static int sSelApp     = -1;   static String sSelAppName;
static uint16_t sSelClientColor = COL_ACCENT;

// Stopwatch + pause bookkeeping.
//   sSegmentStartMs = millis() the current running segment began at
//   sAccumSec       = total active seconds before the current segment
// total elapsed = sAccumSec + (sPaused ? 0 : (millis() - sSegmentStartMs) / 1000)
static uint32_t sStartMs        = 0;
static time_t   sStartEpoch     = 0;
static String   sStartIso;            // ISO-8601 UTC for the API
static String   sStartLocal;          // "DD.MM.YYYY HH:MM" for the screen
static uint32_t sLastTimerSec   = 0;  // captured when STOP is pressed
static uint32_t sSegmentStartMs = 0;
static uint32_t sAccumSec       = 0;
static bool     sPaused         = false;

// Idle-screen feed tracking
static uint32_t sIdleWeatherDrawnMs = 0;
static uint32_t sIdleNewsDrawnMs    = 0;
static uint32_t sIdleNewsRotateMs   = 0;
static int      sIdleNewsIdx        = 0;

// Toast
static String   sToastMsg;
static uint32_t sToastUntil = 0;
static Screen   sToastNext  = SCR_IDLE;

// Auto-sleep bookkeeping. sLastTouchMs is bumped on every press; sSleepWakeTo
// remembers which screen we came from so we can restore it on tap-to-wake.
// sSleepDrawnAsPaused / sSleepDrawnFromIdle let us swap icons in place when
// the underlying state changes while the user is staring at the dim screen.
static uint32_t sLastTouchMs        = 0;
static Screen   sSleepWakeTo        = SCR_IDLE;
static bool     sSleepDrawnAsPaused = false;
static bool     sSleepDrawnFromIdle = false;

// ---- Settings screen --------------------------------------------------------
struct ColorPreset { const char* hex; uint16_t rgb565; };
static const ColorPreset COLOR_PRESETS[] = {
    {"#FF8000", 0xFC00},  // Lixie orange
    {"#FF0000", 0xF800},  // Red
    {"#FFD700", 0xFEA0},  // Gold
    {"#00FF00", 0x07E0},  // Green
    {"#00FFFF", 0x07FF},  // Cyan
    {"#FF00FF", 0xF81F},  // Magenta
};
static const int N_COLOR_PRESETS = 6;

static const uint8_t BRIGHT_LEVELS[]   = {30, 80, 150, 250};
static const char*   BRIGHT_LABELS[]   = {"Low", "Med", "High", "Max"};
static const int     N_BRIGHT_LEVELS   = 4;

// Editor state — set in initSettingsScreen, applied to NVS on Save.
static int    sTempColorIdx      = 0;
static int    sTempBrightIdx     = 3;
static String sSettingsOrigHex;
static uint8_t sSettingsOrigBri  = LED_BRIGHTNESS;

// Discard-confirm context: where to land if the user picks Yes, and where to
// go back to on No. Set by the caller right before transitioning into
// SCR_DISCARD_CONFIRM.
enum DiscardKind { DISCARD_FROM_RUNNING, DISCARD_FROM_CONFIRM };
static DiscardKind sDiscardKind = DISCARD_FROM_RUNNING;

static CRGB rgb565ToCrgb(uint16_t c) {
    uint8_t r = (c >> 11) & 0x1F;
    uint8_t g = (c >>  5) & 0x3F;
    uint8_t b =  c        & 0x1F;
    return CRGB((r << 3) | (r >> 2),
                (g << 2) | (g >> 4),
                (b << 3) | (b >> 2));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
static uint16_t hexToRgb565(const String& hex) {
    if (hex.length() != 7 || hex[0] != '#') return COL_ACCENT;
    long v = strtol(hex.c_str() + 1, nullptr, 16);
    uint8_t r = (v >> 16) & 0xFF;
    uint8_t g = (v >>  8) & 0xFF;
    uint8_t b =  v        & 0xFF;
    return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

static String two(int v) {
    char b[4]; snprintf(b, sizeof(b), "%02d", v); return String(b);
}

static String fmtHMS(uint32_t sec) {
    uint32_t h = sec / 3600, m = (sec / 60) % 60, s = sec % 60;
    char b[12]; snprintf(b, sizeof(b), "%02u:%02u:%02u", h, m, s);
    return String(b);
}

static String isoNowUtc() {
    time_t now = time(nullptr);
    struct tm tm_utc;
    gmtime_r(&now, &tm_utc);
    char b[24];
    strftime(b, sizeof(b), "%Y-%m-%dT%H:%M:%SZ", &tm_utc);
    return String(b);
}

static bool inRect(const NextionTouch& t, int x, int y, int w, int h) {
    return t.x >= (uint16_t)x && t.x < (uint16_t)(x + w) &&
           t.y >= (uint16_t)y && t.y < (uint16_t)(y + h);
}

static String formatLocalDateTime(time_t t) {
    struct tm tm_local;
    localtime_r(&t, &tm_local);
    char b[24];
    strftime(b, sizeof(b), "%d.%m.%Y %H:%M", &tm_local);
    return String(b);
}

static uint32_t currentElapsedSec() {
    if (sPaused) return sAccumSec;
    return sAccumSec + (millis() - sSegmentStartMs) / 1000;
}

// ---------------------------------------------------------------------------
// Drawing — header strip used on every non-idle screen
// ---------------------------------------------------------------------------

// Top-right home button: 40x32 orange tile with a white house glyph stitched
// together from horizontal lines and rectangles, since the ASCII font has no
// icon characters. Touch zone matches the visible tile exactly.
static const int HOME_X = DISP_W - 44;
static const int HOME_W = 40;
static const int HOME_H = 32;

static void drawHomeButton(int y) {
    // Icon only — no backdrop tile. The strokes sit on top of whatever the
    // header strip drew underneath (COL_PANEL on every screen that uses
    // this button), with the door "knocked out" in that same panel colour
    // so the icon reads as a clean orange house silhouette.
    int cx = HOME_X + HOME_W / 2;

    // Roof — filled triangle drawn as 8 horizontal lines, widening downwards.
    for (int row = 0; row < 8; row++) {
        int half = row * 2;
        if (half > 14) half = 14;
        Nextion::drawLine(cx - half, y + 6 + row,
                          cx + half, y + 6 + row, COL_ACCENT);
    }
    // Walls
    Nextion::fillRect(cx - 11, y + 14, 22, 12, COL_ACCENT);
    // Door
    Nextion::fillRect(cx - 3,  y + 18,  6,  8, COL_PANEL);
}

static bool inHomeButton(const NextionTouch& t, int y) {
    return inRect(t, HOME_X, y, HOME_W, HOME_H);
}

static void drawHeader(const String& title, bool showBack) {
    Nextion::fillRect(0, 0, DISP_W, 40, COL_PANEL);
    Nextion::drawLine(0, 40, DISP_W, 40, COL_ACCENT);
    if (showBack) {
        Nextion::fillRect(8, 6, 64, 28, COL_BG);
        Nextion::drawTextCentered(8, 6, 64, 28, FONT_SMALL, COL_TEXT, COL_BG, "< Back");
    }
    // Reserve the right edge for the home button (HOME_W + 8 padding).
    int titleX = showBack ? 80 : 12;
    int titleW = DISP_W - titleX - (HOME_W + 8);
    Nextion::drawTextSty(titleX, 6, titleW, 28,
                         FONT_MEDIUM, COL_TEXT, COL_PANEL, 0, 1, 1, title);
    drawHomeButton(4);
}

static void drawFooterHint(const String& s) {
    Nextion::fillRect(0, DISP_H - 18, DISP_W, 18, COL_BG);
    Nextion::drawTextCentered(0, DISP_H - 18, DISP_W, 18,
                              FONT_SMALL, COL_MUTED, COL_BG, s);
}

// ---------------------------------------------------------------------------
// List rendering (shared by client/project/app screens)
// ---------------------------------------------------------------------------
static void drawList(Entity* items, int count, const String& emptyMsg, int offset,
                     int visibleN = LIST_VISIBLE) {
    for (int i = 0; i < visibleN; ++i) {
        int y = ROW_Y0 + i * ROW_H;
        int idx = offset + i;
        Nextion::fillRect(ROW_X, y, ROW_W, ROW_H - 4, COL_PANEL);

        if (idx >= count) continue;

        Entity& e = items[idx];
        uint16_t col = hexToRgb565(e.color);

        Nextion::fillRect(ROW_X + 8, y + 8, 24, ROW_H - 20, col);

        String label = e.name;
        if (e.extra.length() && (e.extra[0] != 0)) {
            label = e.extra + "  " + e.name;
        }
        Nextion::drawTextSty(ROW_X + 40, y + 4, ROW_W - 50, ROW_H - 12,
                             FONT_MEDIUM, COL_TEXT, COL_PANEL, 0, 1, 1, label);
    }

    if (count == 0) {
        Nextion::drawTextCentered(ROW_X, ROW_Y0, ROW_W, ROW_H,
                                  FONT_MEDIUM, COL_MUTED, COL_BG, emptyMsg);
    }

    int btnX = DISP_W - 44;
    Nextion::fillRect(btnX, ROW_Y0, 32, 60, COL_PANEL);
    Nextion::drawTextCentered(btnX, ROW_Y0, 32, 60, FONT_LARGE, COL_TEXT, COL_PANEL, "^");
    Nextion::fillRect(btnX, ROW_Y0 + 100, 32, 60, COL_PANEL);
    Nextion::drawTextCentered(btnX, ROW_Y0 + 100, 32, 60, FONT_LARGE, COL_TEXT, COL_PANEL, "v");
}

// -2 = scroll up, -3 = scroll down, -1 = no hit, otherwise list index.
static int listHit(const NextionTouch& t, int count, int offset,
                   int visibleN = LIST_VISIBLE) {
    int btnX = DISP_W - 44;
    if (inRect(t, btnX, ROW_Y0, 32, 60)) return -2;
    if (inRect(t, btnX, ROW_Y0 + 100, 32, 60)) return -3;
    for (int i = 0; i < visibleN; ++i) {
        int y = ROW_Y0 + i * ROW_H;
        if (inRect(t, ROW_X, y, ROW_W, ROW_H - 4)) {
            int idx = offset + i;
            if (idx >= 0 && idx < count) return idx;
        }
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Per-screen draw functions
// ---------------------------------------------------------------------------
//
// Idle screen layout (400 x 240):
//   y=  4..42  title "LIXIE STOPWATCH"
//   y= 48..82  weather panel (city, temp, condition)
//   y= 88..136 news headline (rotates every NEWS_ROTATE_MS)
//   y=148..200 "START" pill button (rounded ends, capR = 26)
//   y=222..240 date footer

static void drawIdleWeather() {
    const WeatherInfo& w = Weather::get();
    Nextion::fillRect(20, 48, DISP_W - 40, 36, COL_PANEL);
    String line;
    if (w.valid) {
        char buf[80];
        // Font is ASCII-only — no degree-sign glyph, so use " C".
        snprintf(buf, sizeof(buf), "%s   %.1f C   %s",
                 w.city.c_str(), w.tempC, w.condition.c_str());
        line = buf;
    } else {
        line = "Weather unavailable";
    }
    Nextion::drawTextCentered(20, 48, DISP_W - 40, 36,
                              FONT_MEDIUM, COL_TEXT, COL_PANEL, line);
    sIdleWeatherDrawnMs = w.lastUpdateMs;
}

static void drawIdleNews() {
    Nextion::fillRect(20, 88, DISP_W - 40, 48, COL_BG);
    String headline;
    if (News::count() > 0) {
        sIdleNewsIdx %= News::count();
        headline = "* " + News::get(sIdleNewsIdx);
    } else {
        headline = "Loading news...";
    }
    Nextion::drawTextCentered(20, 88, DISP_W - 40, 48,
                              FONT_SMALL, COL_MUTED, COL_BG, headline);
    sIdleNewsDrawnMs  = News::lastUpdateMs();
    sIdleNewsRotateMs = millis();
}

static void drawIdleSettingsButton() {
    // Settings entry point — hamburger menu glyph (three horizontal bars).
    // Icon only, no backdrop. Hit-test still covers the full HOME_X/
    // HOME_W/HOME_H tile so corner taps still open Settings.
    const int barW = 22;
    const int barH = 4;
    const int x    = HOME_X + (HOME_W - barW) / 2;
    const int cy   = 4 + HOME_H / 2;
    const int sp   = 9;                       // vertical spacing centre-to-centre
    Nextion::fillRect(x, cy - sp - barH / 2, barW, barH, COL_ACCENT);
    Nextion::fillRect(x, cy      - barH / 2, barW, barH, COL_ACCENT);
    Nextion::fillRect(x, cy + sp - barH / 2, barW, barH, COL_ACCENT);
}

static void drawIdle() {
    Nextion::clear(COL_BG);
    // Centre the title in the area to the LEFT of the settings tile so the
    // last few characters don't end up tucked behind the "..." button at
    // HOME_X. HOME_X = DISP_W - 44, so the title bbox stops there.
    Nextion::drawTextCentered(0, 4, HOME_X, 38,
                              FONT_LARGE, COL_ACCENT, COL_BG, "LIXIE STOPWATCH");
    drawIdleSettingsButton();

    drawIdleWeather();
    drawIdleNews();

    // "TAP TO START" pill button — same rectangular bbox as before but with
    // rounded ends (semicircle end-caps) so the corners match the round 3D
    // case design. Hit-test in onTouchIdle() already treats the whole
    // rectangle as the start-workflow trigger; the caps fall inside that
    // bounding box so tap behaviour is unchanged.
    const int btnX = 60, btnY = 148, btnW = DISP_W - 120, btnH = 52;
    const int capR = btnH / 2;       // 26 → full pill curvature
    Nextion::fillRect(btnX + capR, btnY, btnW - 2 * capR, btnH, COL_ACCENT);
    Nextion::drawCircle(btnX + capR,        btnY + capR, capR, COL_ACCENT, true);
    Nextion::drawCircle(btnX + btnW - capR, btnY + capR, capR, COL_ACCENT, true);
    Nextion::drawTextCentered(btnX + capR, btnY, btnW - 2 * capR, btnH,
                              FONT_LARGE, COL_BLACK, COL_ACCENT, "START");

    // Footer = today's date, in Slovak DD.MM.YYYY format.
    time_t now = time(nullptr);
    struct tm tm_local;
    localtime_r(&now, &tm_local);
    char dateBuf[16];
    strftime(dateBuf, sizeof(dateBuf), "%d.%m.%Y", &tm_local);
    drawFooterHint(String(dateBuf));
}

// Walk sApps[] and collect the set of unique categories into sCategories[]
// in first-seen order (which the API already groups by category, so similar
// tools stay next to each other).
static void buildCategoryList() {
    sCategoryCount = 0;
    for (int i = 0; i < sAppCount && sCategoryCount < MAX_ENTITIES; i++) {
        const String& cat = sApps[i].extra;
        if (cat.length() == 0) continue;
        bool seen = false;
        for (int j = 0; j < sCategoryCount; j++) {
            if (sCategories[j].name == cat) { seen = true; break; }
        }
        if (seen) continue;
        sCategories[sCategoryCount].id    = sCategoryCount;
        sCategories[sCategoryCount].name  = cat;
        sCategories[sCategoryCount].color = sApps[i].color;   // first tool's swatch
        sCategories[sCategoryCount].extra = "";
        sCategoryCount++;
    }
}

// Pull the rows of sApps[] whose `extra` matches sSelCategory into a
// separate buffer that SCR_APP renders.
static void filterAppsByCategory() {
    sCategoryAppCount = 0;
    for (int i = 0; i < sAppCount && sCategoryAppCount < MAX_ENTITIES; i++) {
        if (sApps[i].extra == sSelCategory) {
            sCategoryApps[sCategoryAppCount++] = sApps[i];
        }
    }
}

// Breadcrumb that mirrors the navigation path the user took, e.g.
// "Acme Corp / Site redesign / Design". Skips empty segments.
static String breadcrumb(const String& a,
                         const String& b = String(),
                         const String& c = String()) {
    String s = a;
    if (b.length()) s += " / " + b;
    if (c.length()) s += " / " + c;
    return s;
}

static void drawClientScreen() {
    Nextion::clear(COL_BG);
    drawHeader("Select client", false);
    drawList(sClients, sClientCount, "No clients available", sClientOffset);
    drawFooterHint("Tap a client to continue");
}

static void drawProjectScreen() {
    Nextion::clear(COL_BG);
    drawHeader(breadcrumb(sSelClientName), true);
    drawList(sProjects, sProjectCount, "No projects for this client", sProjectOffset);
    drawFooterHint("Tap a project to continue");
}

static void drawCategoryScreen() {
    Nextion::clear(COL_BG);
    drawHeader(breadcrumb(sSelClientName, sSelProjectName), true);
    // Render only LIST_VISIBLE_SHORT rows so the "Skip app" button below
    // doesn't overlap the fourth row's text.
    drawList(sCategories, sCategoryCount, "No apps available", sCategoryOffset,
             LIST_VISIBLE_SHORT);

    Nextion::fillRect(12, DISP_H - 44, 120, 30, COL_PANEL);
    Nextion::drawTextCentered(12, DISP_H - 44, 120, 30,
                              FONT_SMALL, COL_TEXT, COL_PANEL, "Skip app");
    drawFooterHint("Pick a category, or skip the app");
}

static void drawAppScreen() {
    Nextion::clear(COL_BG);
    drawHeader(breadcrumb(sSelClientName, sSelProjectName, sSelCategory), true);
    drawList(sCategoryApps, sCategoryAppCount, "No apps in this category", sAppOffset,
             LIST_VISIBLE_SHORT);

    Nextion::fillRect(12, DISP_H - 44, 120, 30, COL_PANEL);
    Nextion::drawTextCentered(12, DISP_H - 44, 120, 30,
                              FONT_SMALL, COL_TEXT, COL_PANEL, "Skip app");
    drawFooterHint("Pick the app you'll be using");
}

static void drawRunningScreen() {
    Nextion::clear(COL_BG);

    // Top context strip (56 px tall — reserve right side for the home button).
    // Client name on top, status (PAUSED / RUNNING) + app on the subtitle row.
    Nextion::fillRect(0, 0, DISP_W, 56, COL_PANEL);
    Nextion::drawLine(0, 56, DISP_W, 56, sSelClientColor);
    int topTextW = DISP_W - 16 - (HOME_W + 8);
    Nextion::drawTextSty(8, 4, topTextW, 24,
                         FONT_MEDIUM, COL_TEXT, COL_PANEL, 1, 1, 1,
                         sSelClientName);

    String subtitle = sPaused ? String("PAUSED") : String("RUNNING");
    if (sSelApp >= 0) subtitle += "   " + sSelAppName;
    Nextion::drawTextSty(8, 30, topTextW, 22,
                         FONT_SMALL,
                         sPaused ? COL_RED : COL_GREEN,
                         COL_PANEL, 1, 1, 1,
                         subtitle);
    drawHomeButton(12);   // centred in the taller running-screen strip

    // Project name — sits where RUNNING/PAUSED used to be, rendered in the
    // project's own swatch colour so the session is instantly recognisable.
    uint16_t projectCol = sSelProjectHex.length() == 7
                              ? hexToRgb565(sSelProjectHex) : COL_TEXT;
    Nextion::drawTextCentered(0, 66, DISP_W, 38,
                              FONT_LARGE, projectCol, COL_BG,
                              sSelProjectName);

    // Human-readable start time
    Nextion::drawTextCentered(0, 112, DISP_W, 30,
                              FONT_MEDIUM, COL_TEXT, COL_BG,
                              "Started: " + sStartLocal);

    // Pause / Continue button (left). CONTINUE is too long for FONT_LARGE in
    // the available 170 px width; drop to FONT_MEDIUM so it fits cleanly.
    uint16_t pauseBg   = sPaused ? COL_GREEN : COL_GREY;
    uint16_t pauseFg   = sPaused ? COL_BLACK : COL_WHITE;
    uint8_t  pauseFont = sPaused ? FONT_MEDIUM : FONT_LARGE;
    Nextion::fillRect(20, 162, 170, 58, pauseBg);
    Nextion::drawTextCentered(20, 162, 170, 58,
                              pauseFont, pauseFg, pauseBg,
                              sPaused ? "CONTINUE" : "PAUSE");

    // Stop button (right)
    Nextion::fillRect(210, 162, 170, 58, COL_RED);
    Nextion::drawTextCentered(210, 162, 170, 58,
                              FONT_LARGE, COL_WHITE, COL_RED, "STOP");
}

static void drawConfirmScreen() {
    Nextion::clear(COL_BG);
    drawHeader("Save session?", false);

    Nextion::drawTextCentered(0, 56, DISP_W, 24,
                              FONT_MEDIUM, COL_TEXT, COL_BG,
                              sSelClientName + "  /  " + sSelProjectName);
    Nextion::drawTextCentered(0, 82, DISP_W, 20,
                              FONT_SMALL, COL_MUTED, COL_BG,
                              sSelApp >= 0 ? sSelAppName : String("(no app)"));

    Nextion::drawTextCentered(0, 114, DISP_W, 30,
                              FONT_MEDIUM, COL_ACCENT, COL_BG,
                              "Duration: " + fmtHMS(sLastTimerSec));

    Nextion::fillRect(28, 178, 156, 44, COL_PANEL);
    Nextion::drawTextCentered(28, 178, 156, 44,
                              FONT_MEDIUM, COL_MUTED, COL_PANEL, "Discard");

    Nextion::fillRect(DISP_W - 184, 178, 156, 44, COL_GREEN);
    Nextion::drawTextCentered(DISP_W - 184, 178, 156, 44,
                              FONT_MEDIUM, COL_BLACK, COL_GREEN, "Save");
}

// Settings layout constants — kept here so both draw and hit-test agree.
static const int SET_SWATCH_W   = 54;
static const int SET_SWATCH_H   = 40;
static const int SET_SWATCH_Y   = 78;
static const int SET_SWATCH_GAP = 4;
static const int SET_SWATCH_X0  = 28;       // (400 - (6*54 + 5*4)) / 2

static const int SET_BRIGHT_W   = 84;
static const int SET_BRIGHT_H   = 36;
static const int SET_BRIGHT_Y   = 156;
static const int SET_BRIGHT_GAP = 12;
static const int SET_BRIGHT_X0  = 14;       // (400 - (4*84 + 3*12)) / 2

static const int SET_BTN_Y      = 200;
static const int SET_BTN_W      = 156;
static const int SET_BTN_H      = 32;

static int settingsSwatchX(int i) { return SET_SWATCH_X0 + i * (SET_SWATCH_W + SET_SWATCH_GAP); }
static int settingsBrightX(int i) { return SET_BRIGHT_X0 + i * (SET_BRIGHT_W + SET_BRIGHT_GAP); }

static void drawSettingsScreen() {
    Nextion::clear(COL_BG);
    drawHeader("Settings", false);  // home button is at right edge

    // ---- Clock colour row ----
    Nextion::drawTextSty(20, 50, 360, 24,
                         FONT_MEDIUM, COL_TEXT, COL_BG, 0, 1, 1,
                         "Clock colour:");
    for (int i = 0; i < N_COLOR_PRESETS; i++) {
        int x = settingsSwatchX(i);
        Nextion::fillRect(x, SET_SWATCH_Y, SET_SWATCH_W, SET_SWATCH_H,
                          COLOR_PRESETS[i].rgb565);
        if (sTempColorIdx == i) {
            // Bright outline ring to show selection.
            Nextion::drawRect(x - 2, SET_SWATCH_Y - 2,
                              SET_SWATCH_W + 4, SET_SWATCH_H + 4, COL_WHITE);
        }
    }

    // ---- Brightness row ----
    Nextion::drawTextSty(20, 128, 360, 24,
                         FONT_MEDIUM, COL_TEXT, COL_BG, 0, 1, 1,
                         "Brightness:");
    for (int i = 0; i < N_BRIGHT_LEVELS; i++) {
        int      x   = settingsBrightX(i);
        bool     on  = (sTempBrightIdx == i);
        uint16_t bg  = on ? COL_ACCENT : COL_PANEL;
        uint16_t fg  = on ? COL_BLACK  : COL_TEXT;
        Nextion::fillRect(x, SET_BRIGHT_Y, SET_BRIGHT_W, SET_BRIGHT_H, bg);
        Nextion::drawTextCentered(x, SET_BRIGHT_Y, SET_BRIGHT_W, SET_BRIGHT_H,
                                  FONT_MEDIUM, fg, bg, BRIGHT_LABELS[i]);
    }

    // ---- Save / Cancel ----
    Nextion::fillRect(28, SET_BTN_Y, SET_BTN_W, SET_BTN_H, COL_GREEN);
    Nextion::drawTextCentered(28, SET_BTN_Y, SET_BTN_W, SET_BTN_H,
                              FONT_MEDIUM, COL_BLACK, COL_GREEN, "Save");

    int cancelX = DISP_W - SET_BTN_W - 28;
    Nextion::fillRect(cancelX, SET_BTN_Y, SET_BTN_W, SET_BTN_H, COL_PANEL);
    Nextion::drawTextCentered(cancelX, SET_BTN_Y, SET_BTN_W, SET_BTN_H,
                              FONT_MEDIUM, COL_MUTED, COL_PANEL, "Cancel");
}

static void initSettingsScreen() {
    sSettingsOrigHex = Settings::clockColorHex();
    sSettingsOrigBri = Settings::brightness();

    sTempColorIdx = 0;
    for (int i = 0; i < N_COLOR_PRESETS; i++) {
        if (sSettingsOrigHex.equalsIgnoreCase(COLOR_PRESETS[i].hex)) {
            sTempColorIdx = i;
            break;
        }
    }
    sTempBrightIdx = N_BRIGHT_LEVELS - 1;
    for (int i = 0; i < N_BRIGHT_LEVELS; i++) {
        if (sSettingsOrigBri <= BRIGHT_LEVELS[i]) { sTempBrightIdx = i; break; }
    }
}

static void onTouchSettings(const NextionTouch& t) {
    // Home in header → cancel and exit.
    if (inHomeButton(t, 4)) {
        // Restore preview to the originals before leaving.
        LedDisplay::setClockColorHex(sSettingsOrigHex);
        LedDisplay::setBrightness(sSettingsOrigBri);
        goTo(SCR_IDLE);
        return;
    }

    // Colour swatches — live preview only, no NVS write yet.
    for (int i = 0; i < N_COLOR_PRESETS; i++) {
        if (inRect(t, settingsSwatchX(i), SET_SWATCH_Y,
                   SET_SWATCH_W, SET_SWATCH_H)) {
            sTempColorIdx = i;
            LedDisplay::setClockColorHex(COLOR_PRESETS[i].hex);
            sDirty = true;
            return;
        }
    }
    // Brightness — live preview.
    for (int i = 0; i < N_BRIGHT_LEVELS; i++) {
        if (inRect(t, settingsBrightX(i), SET_BRIGHT_Y,
                   SET_BRIGHT_W, SET_BRIGHT_H)) {
            sTempBrightIdx = i;
            LedDisplay::setBrightness(BRIGHT_LEVELS[i]);
            sDirty = true;
            return;
        }
    }
    // Save
    if (inRect(t, 28, SET_BTN_Y, SET_BTN_W, SET_BTN_H)) {
        Settings::setClockColorHex(COLOR_PRESETS[sTempColorIdx].hex);
        Settings::setBrightness   (BRIGHT_LEVELS[sTempBrightIdx]);
        toast("Saved", 900, SCR_IDLE);
        return;
    }
    // Cancel
    int cancelX = DISP_W - SET_BTN_W - 28;
    if (inRect(t, cancelX, SET_BTN_Y, SET_BTN_W, SET_BTN_H)) {
        LedDisplay::setClockColorHex(sSettingsOrigHex);
        LedDisplay::setBrightness(sSettingsOrigBri);
        goTo(SCR_IDLE);
        return;
    }
}

static void drawToastScreen() {
    Nextion::clear(COL_BG);
    Nextion::fillRect(20, 80, DISP_W - 40, 80, COL_PANEL);
    Nextion::drawTextCentered(20, 80, DISP_W - 40, 80,
                              FONT_LARGE, COL_TEXT, COL_PANEL, sToastMsg);
}

// Simple stopwatch glyph centred at (cx, cy). Outline circle face + the
// little top button + a "twelve o'clock" tick + minute and hour hands.
// All strokes drawn via the existing draw primitives so we don't depend
// on a font that has a stopwatch character.
static void drawStopwatchIcon(int cx, int cy) {
    const uint16_t col = COL_ACCENT;
    const int      r   = 56;

    // Face — drawn as four concentric circles for a thicker outline since
    // drawCircle without `filled=true` is a single-pixel stroke.
    for (int dr = 0; dr < 3; dr++) Nextion::drawCircle(cx, cy, r - dr, col, false);

    // Top button: a small rectangle straddling 12 o'clock.
    Nextion::fillRect(cx - 5, cy - r - 9, 10, 9, col);

    // 12 o'clock tick inside the face.
    Nextion::drawLine(cx, cy - r + 4, cx, cy - r + 12, col);

    // Minute hand (straight up) + hour hand (pointing right).
    Nextion::drawLine(cx, cy, cx,         cy - r + 18, col);
    Nextion::drawLine(cx, cy, cx + r - 28, cy,         col);

    // Centre pivot.
    Nextion::drawCircle(cx, cy, 3, col, true);
}

// Coffee mug glyph centred at (cx, cy). Cup body + handle + a couple of
// steam wisps drawn as short angled lines.
static void drawCoffeeIcon(int cx, int cy) {
    const uint16_t col = COL_ACCENT;
    const int      bodyW = 70, bodyH = 60;
    const int      bodyX = cx - bodyW / 2;
    const int      bodyY = cy - bodyH / 2 + 8;

    // Mug body (a thick outlined rounded-ish rectangle).
    for (int t = 0; t < 4; t++)
        Nextion::drawRect(bodyX + t, bodyY + t, bodyW - 2 * t, bodyH - 2 * t, col);

    // Rim line just below the top to suggest the inside.
    Nextion::drawLine(bodyX + 6, bodyY + 8, bodyX + bodyW - 6, bodyY + 8, col);

    // Handle on the right (two concentric arcs faked as full circles, but
    // clipped to the right of the mug — only the right half is visible).
    Nextion::drawCircle(bodyX + bodyW + 6, bodyY + bodyH / 2 + 2, 14, col, false);
    Nextion::drawCircle(bodyX + bodyW + 6, bodyY + bodyH / 2 + 2, 13, col, false);

    // Steam — three short wavy strokes above the mug.
    const int sy = bodyY - 22;
    for (int i = -1; i <= 1; i++) {
        int sx = cx + i * 14;
        Nextion::drawLine(sx,     sy + 10, sx - 4, sy + 2,  col);
        Nextion::drawLine(sx - 4, sy + 2,  sx + 2, sy - 6,  col);
        Nextion::drawLine(sx + 2, sy - 6,  sx - 2, sy - 14, col);
    }
}

static void drawSleepScreen() {
    Nextion::clear(COL_BLACK);
    bool fromIdle = (sSleepWakeTo == SCR_IDLE);
    bool paused   = fromIdle ? true : sPaused;     // idle = coffee always
    if (paused) drawCoffeeIcon(DISP_W / 2, DISP_H / 2);
    else        drawStopwatchIcon(DISP_W / 2, DISP_H / 2);
    sSleepDrawnAsPaused = paused;
    sSleepDrawnFromIdle = fromIdle;
}

static void enterSleep() {
    sSleepWakeTo = sScreen;
    goTo(SCR_SLEEP);
}

static void wakeFromSleep() {
    sLastTouchMs = millis();
    goTo(sSleepWakeTo);
}

// Is the current screen one we're allowed to auto-sleep from?
static bool screenIsSleepable() {
    if (sScreen == SCR_RUNNING) return true;
    if (sScreen == SCR_IDLE && Settings::sleepOnIdle()) return true;
    return false;
}

static void onTouchSleep(const NextionTouch& /*t*/) {
    // Any tap anywhere wakes the display.
    wakeFromSleep();
}

static void drawDiscardConfirmScreen() {
    Nextion::clear(COL_BG);

    // Modal panel
    Nextion::fillRect(20, 30, DISP_W - 40, 130, COL_PANEL);
    Nextion::drawLine(20, 30, DISP_W - 20, 30, COL_RED);
    Nextion::drawLine(20, 160, DISP_W - 20, 160, COL_RED);

    Nextion::drawTextCentered(20, 44, DISP_W - 40, 36,
                              FONT_LARGE, COL_TEXT, COL_PANEL,
                              "Discard session?");
    Nextion::drawTextCentered(20, 88, DISP_W - 40, 26,
                              FONT_MEDIUM, COL_MUTED, COL_PANEL,
                              "All elapsed time will be lost.");
    // Show how much they'd be losing.
    Nextion::drawTextCentered(20, 118, DISP_W - 40, 28,
                              FONT_MEDIUM, COL_ACCENT, COL_PANEL,
                              "Tracked: " + fmtHMS(
                                  sDiscardKind == DISCARD_FROM_RUNNING
                                      ? currentElapsedSec()
                                      : sLastTimerSec));

    // No, keep — left, safe
    Nextion::fillRect(28, 178, 160, 50, COL_BLUE);
    Nextion::drawTextCentered(28, 178, 160, 50,
                              FONT_MEDIUM, COL_WHITE, COL_BLUE, "No, keep");

    // Yes, discard — right, destructive
    Nextion::fillRect(DISP_W - 188, 178, 160, 50, COL_RED);
    Nextion::drawTextCentered(DISP_W - 188, 178, 160, 50,
                              FONT_MEDIUM, COL_WHITE, COL_RED, "Yes, discard");
}

// ---------------------------------------------------------------------------
// Touch handlers
// ---------------------------------------------------------------------------
static void askDiscard(DiscardKind kind) {
    sDiscardKind = kind;
    goTo(SCR_DISCARD_CONFIRM);
}

static void goHome() {
    // SCR_RUNNING covers both the live-running state and the paused state
    // (paused is just sPaused=true on the same screen). Either way the user
    // has elapsed time that would be lost, so the dialog must fire.
    if (sScreen == SCR_RUNNING) {
        askDiscard(DISCARD_FROM_RUNNING);
        return;
    }
    // Confirm screen also holds an unsaved measurement.
    if (sScreen == SCR_CONFIRM) {
        askDiscard(DISCARD_FROM_CONFIRM);
        return;
    }
    LedDisplay::clockMode();
    sSelApp = -1;
    goTo(SCR_IDLE);
}

static void onTouchDiscardConfirm(const NextionTouch& t) {
    // "No, keep" — bail out, go back to where we came from.
    if (inRect(t, 28, 178, 160, 50)) {
        goTo(sDiscardKind == DISCARD_FROM_RUNNING ? SCR_RUNNING : SCR_CONFIRM);
        return;
    }
    // "Yes, discard" — actually destroy the session.
    if (inRect(t, DISP_W - 188, 178, 160, 50)) {
        LedDisplay::clockMode();
        if (sDiscardKind == DISCARD_FROM_RUNNING) {
            toast("Discarded", 1200, SCR_IDLE);
        } else {
            toast("Discarded", 1200, SCR_APP);
        }
        return;
    }
}

static void onScrollHit(int hit, int count, int& offset, int visibleN = LIST_VISIBLE) {
    if (hit == -2 && offset > 0) { offset--; sDirty = true; }
    if (hit == -3 && offset + visibleN < count) { offset++; sDirty = true; }
}

static void onTouchIdle(const NextionTouch& t) {
    // Settings tile (top-right corner) → matrix colour / brightness editor.
    if (inHomeButton(t, 4)) {
        initSettingsScreen();
        goTo(SCR_SETTINGS);
        return;
    }
    // Hidden affordance: tapping the weather strip forces a refresh. No
    // visible hint — the strip just updates if anything changed.
    if (inRect(t, 20, 48, DISP_W - 40, 36)) {
        Weather::refresh();
        drawIdleWeather();
        return;
    }
    // Anywhere else → start the selection workflow.
    goTo(SCR_CLIENT);
    sClientCount  = Api::fetchClients(sClients, MAX_ENTITIES);
    sClientOffset = 0;
    sDirty = true;
}

// Forward-declared so the category/app touch handlers can call it before
// the definition appears below.
static void startSession(int appId, const String& appName);

static void onTouchClient(const NextionTouch& t) {
    if (inHomeButton(t, 4)) { goHome(); return; }
    int hit = listHit(t, sClientCount, sClientOffset);
    if (hit < 0) { onScrollHit(hit, sClientCount, sClientOffset); return; }
    Entity& c = sClients[hit];
    sSelClient      = c.id;
    sSelClientName  = c.name;
    sSelClientHex   = c.color;
    sSelClientColor = hexToRgb565(c.color);
    sProjectCount   = Api::fetchProjects(c.id, sProjects, MAX_ENTITIES);
    sProjectOffset  = 0;  // new project list for a new client
    goTo(SCR_PROJECT);
}

static void onTouchProject(const NextionTouch& t) {
    if (inHomeButton(t, 4)) { goHome(); return; }
    if (inRect(t, 8, 6, 64, 28)) { goTo(SCR_CLIENT); return; }  // back keeps sClientOffset
    int hit = listHit(t, sProjectCount, sProjectOffset);
    if (hit < 0) { onScrollHit(hit, sProjectCount, sProjectOffset); return; }
    Entity& p = sProjects[hit];
    sSelProject     = p.id;
    sSelProjectName = p.name;
    sSelProjectHex  = p.color;
    // Fetch the full app catalogue and derive the category set the user
    // will pick from next. The user can also hit "Skip app" on either the
    // category or the app screen to start the session without an app.
    sAppCount        = Api::fetchApps(sApps, MAX_ENTITIES);
    buildCategoryList();
    sCategoryOffset  = 0;
    sAppOffset       = 0;
    sSelCategory     = "";
    goTo(SCR_CATEGORY);
}

static void onTouchCategory(const NextionTouch& t) {
    if (inHomeButton(t, 4)) { goHome(); return; }
    if (inRect(t, 8, 6, 64, 28)) { goTo(SCR_PROJECT); return; }
    // "Skip app" — bottom-left button at the same coords as on SCR_APP.
    if (inRect(t, 12, DISP_H - 44, 120, 30)) {
        startSession(-1, "");
        return;
    }
    int hit = listHit(t, sCategoryCount, sCategoryOffset, LIST_VISIBLE_SHORT);
    if (hit < 0) { onScrollHit(hit, sCategoryCount, sCategoryOffset, LIST_VISIBLE_SHORT); return; }
    sSelCategory = sCategories[hit].name;
    filterAppsByCategory();
    sAppOffset   = 0;
    goTo(SCR_APP);
}

static void startSession(int appId, const String& appName) {
    sSelApp         = appId;
    sSelAppName     = appName;
    sStartMs        = millis();
    sStartEpoch     = time(nullptr);
    sStartIso       = isoNowUtc();
    sStartLocal     = formatLocalDateTime(sStartEpoch);
    sSegmentStartMs = millis();
    sAccumSec       = 0;
    sPaused         = false;
    LedDisplay::startStopwatch(sStartMs, rgb565ToCrgb(sSelClientColor));
    goTo(SCR_RUNNING);
}

static void onTouchApp(const NextionTouch& t) {
    if (inHomeButton(t, 4)) { goHome(); return; }
    if (inRect(t, 8, 6, 64, 28)) { goTo(SCR_CATEGORY); return; }   // back to categories
    if (inRect(t, 12, DISP_H - 44, 120, 30)) { startSession(-1, "(no app)"); return; }
    int hit = listHit(t, sCategoryAppCount, sAppOffset, LIST_VISIBLE_SHORT);
    if (hit < 0) { onScrollHit(hit, sCategoryAppCount, sAppOffset, LIST_VISIBLE_SHORT); return; }
    Entity& a = sCategoryApps[hit];
    startSession(a.id, a.name);
}

static void togglePause() {
    CRGB col = rgb565ToCrgb(sSelClientColor);
    if (sPaused) {
        // Resume: start a new active segment. Tell the LED display the start
        // time it should pretend the stopwatch began, so the displayed total
        // continues smoothly.
        sSegmentStartMs = millis();
        sPaused = false;
        LedDisplay::startStopwatch(millis() - sAccumSec * 1000UL, col);
    } else {
        // Pause: bank the current segment, freeze LED matrix.
        sAccumSec += (millis() - sSegmentStartMs) / 1000;
        sPaused = true;
        LedDisplay::holdDuration(sAccumSec, col);
    }
}

static void onTouchRunning(const NextionTouch& t) {
    if (inHomeButton(t, 12)) { goHome(); return; }
    // Pause / Continue (left)
    if (inRect(t, 20, 162, 170, 58)) {
        togglePause();
        sDirty = true;
        return;
    }
    // Stop (right) — capture elapsed for the API + the dialog, then swing
    // the matrix back to wall clock. Only Running and Paused states show
    // the stopwatch on the LEDs; Confirm shows the time of day.
    if (inRect(t, 210, 162, 170, 58)) {
        sLastTimerSec = currentElapsedSec();
        LedDisplay::clockMode();
        goTo(SCR_CONFIRM);
    }
}

static void onTouchConfirm(const NextionTouch& t) {
    if (inHomeButton(t, 4)) { goHome(); return; }
    if (inRect(t, 28, 178, 156, 44)) {  // Discard
        // Ask for confirmation — losing a tracked session by misclick is
        // worse than one extra tap.
        askDiscard(DISCARD_FROM_CONFIRM);
        return;
    }
    if (inRect(t, DISP_W - 184, 178, 156, 44)) {  // Save
        bool ok = Api::postTimelog(sSelClient, sSelProject, sSelApp,
                                   sStartIso, sLastTimerSec);
        LedDisplay::clockMode();
        toast(ok ? "Saved!" : "Save failed");
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
void showBootMessage(const String& msg) {
    Nextion::clear(COL_BG);
    Nextion::drawTextCentered(0, 80, DISP_W, 40,
                              FONT_LARGE, COL_ACCENT, COL_BG, "LIXIE STOPWATCH");
    Nextion::drawTextCentered(0, 130, DISP_W, 30,
                              FONT_MEDIUM, COL_MUTED, COL_BG, msg);
    sScreen = SCR_BOOT;
    sDirty = false;
}

void goTo(Screen s) {
    sPrevScreen = sScreen;
    sScreen = s;
    sDirty = true;
}

Screen current() { return sScreen; }

void toast(const String& message, uint16_t ms, Screen nextScreen) {
    sToastMsg   = message;
    sToastUntil = millis() + ms;
    sToastNext  = nextScreen;
    goTo(SCR_TOAST);
}

void tick() {
    // Toast auto-dismiss
    if (sScreen == SCR_TOAST && millis() >= sToastUntil) {
        if (sToastNext == SCR_IDLE) sSelApp = -1;
        goTo(sToastNext);
    }

    // Auto-sleep transition: if the active screen allows sleep and the user
    // hasn't touched anything for `sleepTimeoutSec()` seconds, dim the
    // display to the icon-only sleep view.
    uint16_t sleepSec = Settings::sleepTimeoutSec();
    if (sleepSec > 0 && screenIsSleepable() &&
        (millis() - sLastTouchMs) >= (uint32_t)sleepSec * 1000UL) {
        enterSleep();
    }

    // While the sleep view is up, swap the icon if running ↔ paused state
    // flipped underneath us (e.g. a dashboard-driven pause/continue).
    if (sScreen == SCR_SLEEP) {
        bool fromIdle = (sSleepWakeTo == SCR_IDLE);
        bool paused   = fromIdle ? true : sPaused;
        if (paused != sSleepDrawnAsPaused || fromIdle != sSleepDrawnFromIdle) {
            sDirty = true;
        }
    }

    if (sDirty) {
        switch (sScreen) {
            case SCR_BOOT:            /* drawn by showBootMessage */ break;
            case SCR_IDLE:            drawIdle();                 break;
            case SCR_CLIENT:          drawClientScreen();         break;
            case SCR_PROJECT:         drawProjectScreen();        break;
            case SCR_CATEGORY:        drawCategoryScreen();       break;
            case SCR_APP:             drawAppScreen();            break;
            case SCR_RUNNING:         drawRunningScreen();        break;
            case SCR_CONFIRM:         drawConfirmScreen();        break;
            case SCR_DISCARD_CONFIRM: drawDiscardConfirmScreen(); break;
            case SCR_SETTINGS:        drawSettingsScreen();       break;
            case SCR_TOAST:           drawToastScreen();          break;
            case SCR_SLEEP:           drawSleepScreen();          break;
        }
        sDirty = false;
    }

    // Idle-screen ambient updates: weather strip refreshes when its source
    // data lands, news headline rotates on a timer.
    if (sScreen == SCR_IDLE) {
        if (Weather::get().lastUpdateMs != sIdleWeatherDrawnMs) {
            drawIdleWeather();
        }
        if (News::lastUpdateMs() != sIdleNewsDrawnMs) {
            sIdleNewsIdx = 0;
            drawIdleNews();
        } else if (News::count() > 1 &&
                   millis() - sIdleNewsRotateMs > NEWS_ROTATE_MS) {
            sIdleNewsIdx = (sIdleNewsIdx + 1) % News::count();
            drawIdleNews();
        }
    }
}

void handleTouch(const NextionTouch& t) {
    if (!t.pressed) return;  // act on press, ignore release
    sLastTouchMs = millis();
    switch (sScreen) {
        case SCR_IDLE:            onTouchIdle(t);           break;
        case SCR_CLIENT:          onTouchClient(t);         break;
        case SCR_PROJECT:         onTouchProject(t);        break;
        case SCR_CATEGORY:        onTouchCategory(t);       break;
        case SCR_APP:             onTouchApp(t);            break;
        case SCR_RUNNING:         onTouchRunning(t);        break;
        case SCR_CONFIRM:         onTouchConfirm(t);        break;
        case SCR_DISCARD_CONFIRM: onTouchDiscardConfirm(t); break;
        case SCR_SETTINGS:        onTouchSettings(t);       break;
        case SCR_SLEEP:           onTouchSleep(t);          break;
        default: break;
    }
}

void injectTouch(int x, int y, bool pressed) {
    NextionTouch t;
    t.x       = (uint16_t)x;
    t.y       = (uint16_t)y;
    t.pressed = pressed;
    handleTouch(t);
}

LiveSnapshot getLiveSnapshot() {
    LiveSnapshot s;
    // Safe default — guarantees s.state is never an uninitialized pointer if
    // a new Screen value is added without a matching case below.
    s.state  = "idle";
    s.screen = "idle";

    switch (sScreen) {
        case SCR_IDLE:            s.state = "idle";       s.screen = "idle";            break;
        case SCR_CLIENT:          s.state = "selecting";  s.screen = "client";          break;
        case SCR_PROJECT:         s.state = "selecting";  s.screen = "project";         break;
        case SCR_CATEGORY:        s.state = "selecting";  s.screen = "category";        break;
        case SCR_APP:             s.state = "selecting";  s.screen = "app";             break;
        case SCR_RUNNING:         s.state = sPaused ? "paused" : "running"; s.screen = "running"; break;
        case SCR_CONFIRM:         s.state = "confirm";    s.screen = "confirm";         break;
        case SCR_DISCARD_CONFIRM: s.state = "running";    s.screen = "discard_confirm"; break;
        case SCR_SETTINGS:        s.state = "idle";       s.screen = "settings";        break;
        case SCR_TOAST:           s.state = "idle";       s.screen = "toast";           break;
        case SCR_BOOT:            s.state = "boot";       s.screen = "boot";            break;
        case SCR_SLEEP:
            // Report the underlying activity so the dashboard's "live" view
            // still reads "running" / "paused" / "idle" — only the on-device
            // screen is dimmed, the session itself didn't change state.
            if (sSleepWakeTo == SCR_RUNNING) {
                s.state = sPaused ? "paused" : "running";
            } else {
                s.state = "idle";
            }
            s.screen = "sleep";
            break;
    }

    s.clientId    = sSelClient;
    s.clientName  = sSelClientName;
    s.clientColor = sSelClientHex;
    s.projectId   = sSelProject;
    s.projectName = sSelProjectName;
    s.projectColor = sSelProjectHex;
    s.appId        = sSelApp;
    s.appName      = sSelAppName;
    s.categoryName = sSelCategory;
    s.startIso    = sStartIso;
    s.paused      = sPaused;

    if (sScreen == SCR_RUNNING || sScreen == SCR_DISCARD_CONFIRM) {
        s.elapsedSec = currentElapsedSec();
    } else if (sScreen == SCR_CONFIRM) {
        s.elapsedSec = sLastTimerSec;
    } else {
        s.elapsedSec = 0;
    }
    return s;
}

void writeStateExtras(JsonDocument& doc) {
    // Per-screen content the dashboard needs to render an honest mirror.
    if (sScreen == SCR_IDLE) {
        const WeatherInfo& w = Weather::get();
        if (w.valid) {
            JsonObject wo = doc["weather"].to<JsonObject>();
            wo["city"]      = w.city;
            wo["temp_c"]    = w.tempC;
            wo["condition"] = w.condition;
        }
        if (News::count() > 0) {
            int idx = sIdleNewsIdx % News::count();
            doc["news_headline"] = News::get(idx);
        }
        // Date matches the on-device footer ("DD.MM.YYYY").
        time_t now = time(nullptr);
        if (now > 100000) {
            struct tm tm_local;
            localtime_r(&now, &tm_local);
            char buf[16];
            strftime(buf, sizeof(buf), "%d.%m.%Y", &tm_local);
            doc["idle_date"] = buf;
        }
    }
    else if (sScreen == SCR_CLIENT  || sScreen == SCR_PROJECT  ||
             sScreen == SCR_CATEGORY || sScreen == SCR_APP) {
        Entity* arr = nullptr;
        int count = 0, offset = 0;
        if (sScreen == SCR_CLIENT) {
            arr = sClients;       count = sClientCount;      offset = sClientOffset;
        } else if (sScreen == SCR_PROJECT) {
            arr = sProjects;      count = sProjectCount;     offset = sProjectOffset;
        } else if (sScreen == SCR_CATEGORY) {
            arr = sCategories;    count = sCategoryCount;    offset = sCategoryOffset;
        } else {
            arr = sCategoryApps;  count = sCategoryAppCount; offset = sAppOffset;
        }
        doc["list_count"]  = count;
        doc["list_offset"] = offset;
        JsonArray rows = doc["list_rows"].to<JsonArray>();
        for (int i = 0; i < count; i++) {
            JsonObject r = rows.add<JsonObject>();
            r["name"]  = arr[i].name;
            r["color"] = arr[i].color;
            if (arr[i].extra.length()) r["extra"] = arr[i].extra;
        }
    }
    else if (sScreen == SCR_TOAST) {
        doc["toast_message"] = sToastMsg;
    }
}

}  // namespace UI
