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
#include "weather.h"
#include "news.h"
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

static Entity sClients[MAX_ENTITIES];   static int sClientCount  = 0;
static Entity sProjects[MAX_ENTITIES];  static int sProjectCount = 0;
static Entity sApps[MAX_ENTITIES];      static int sAppCount     = 0;

// One scroll offset per list-screen. Preserved across back-navigation, reset
// only when the underlying list is refetched (new client → fresh project list).
static int sClientOffset  = 0;
static int sProjectOffset = 0;
static int sAppOffset     = 0;

static const int LIST_VISIBLE = 4;
static const int ROW_H = 44;
static const int ROW_X = 12, ROW_Y0 = 52, ROW_W = 376;

// Current selection
static int sSelClient  = -1;   static String sSelClientName;
static int sSelProject = -1;   static String sSelProjectName;
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
    Nextion::fillRect(HOME_X, y, HOME_W, HOME_H, COL_ACCENT);
    int cx = HOME_X + HOME_W / 2;

    // Roof — filled triangle drawn as 8 horizontal lines, widening downwards.
    for (int row = 0; row < 8; row++) {
        int half = row * 2;
        if (half > 14) half = 14;
        Nextion::drawLine(cx - half, y + 6 + row,
                          cx + half, y + 6 + row, COL_WHITE);
    }
    // Walls
    Nextion::fillRect(cx - 11, y + 14, 22, 12, COL_WHITE);
    // Door — knocked out in accent so it reads as a hole.
    Nextion::fillRect(cx - 3,  y + 18,  6,  8, COL_ACCENT);
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
static void drawList(Entity* items, int count, const String& emptyMsg, int offset) {
    for (int i = 0; i < LIST_VISIBLE; ++i) {
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
static int listHit(const NextionTouch& t, int count, int offset) {
    int btnX = DISP_W - 44;
    if (inRect(t, btnX, ROW_Y0, 32, 60)) return -2;
    if (inRect(t, btnX, ROW_Y0 + 100, 32, 60)) return -3;
    for (int i = 0; i < LIST_VISIBLE; ++i) {
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
//   y=  4..42  title "LIXIE STOPKY"
//   y= 48..82  weather panel (city, temp, condition)
//   y= 88..136 news headline (rotates every NEWS_ROTATE_MS)
//   y=148..200 "TAP TO START" button
//   y=222..240 WiFi footer

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

static void drawIdle() {
    Nextion::clear(COL_BG);
    Nextion::drawTextCentered(0, 4, DISP_W, 38,
                              FONT_LARGE, COL_ACCENT, COL_BG, "LIXIE STOPKY");

    drawIdleWeather();
    drawIdleNews();

    Nextion::fillRect(60, 148, DISP_W - 120, 52, COL_ACCENT);
    Nextion::drawTextCentered(60, 148, DISP_W - 120, 52,
                              FONT_LARGE, COL_BLACK, COL_ACCENT, "TAP TO START");

    // Footer = today's date, in Slovak DD.MM.YYYY format.
    time_t now = time(nullptr);
    struct tm tm_local;
    localtime_r(&now, &tm_local);
    char dateBuf[16];
    strftime(dateBuf, sizeof(dateBuf), "%d.%m.%Y", &tm_local);
    drawFooterHint(String(dateBuf));
}

static void drawClientScreen() {
    Nextion::clear(COL_BG);
    drawHeader("Select client", false);
    drawList(sClients, sClientCount, "No clients available", sClientOffset);
    drawFooterHint("Tap a client to continue");
}

static void drawProjectScreen() {
    Nextion::clear(COL_BG);
    drawHeader(String("Project — ") + sSelClientName, true);
    drawList(sProjects, sProjectCount, "No projects for this client", sProjectOffset);
    drawFooterHint("Tap a project to continue");
}

static void drawAppScreen() {
    Nextion::clear(COL_BG);
    drawHeader(String("App — ") + sSelProjectName, true);
    drawList(sApps, sAppCount, "No apps available", sAppOffset);

    Nextion::fillRect(12, DISP_H - 44, 120, 30, COL_PANEL);
    Nextion::drawTextCentered(12, DISP_H - 44, 120, 30,
                              FONT_SMALL, COL_TEXT, COL_PANEL, "Skip app");
    drawFooterHint("Pick the app you'll be using");
}

static void drawRunningScreen() {
    Nextion::clear(COL_BG);

    // Top context strip (56 px tall — reserve right side for the home button).
    Nextion::fillRect(0, 0, DISP_W, 56, COL_PANEL);
    Nextion::drawLine(0, 56, DISP_W, 56, sSelClientColor);
    int topTextW = DISP_W - 16 - (HOME_W + 8);
    Nextion::drawTextSty(8, 4, topTextW, 24,
                         FONT_MEDIUM, COL_TEXT, COL_PANEL, 1, 1, 1,
                         sSelClientName);
    Nextion::drawTextSty(8, 30, topTextW, 22,
                         FONT_SMALL, COL_MUTED, COL_PANEL, 1, 1, 1,
                         sSelProjectName + "   "
                             + (sSelApp >= 0 ? sSelAppName : String("(no app)")));
    drawHomeButton(12);   // centred in the taller running-screen strip

    // Status
    Nextion::drawTextCentered(0, 66, DISP_W, 38,
                              FONT_LARGE,
                              sPaused ? COL_RED : COL_GREEN, COL_BG,
                              sPaused ? "PAUSED" : "RUNNING");

    // Human-readable start time
    Nextion::drawTextCentered(0, 112, DISP_W, 30,
                              FONT_MEDIUM, COL_TEXT, COL_BG,
                              "Started: " + sStartLocal);

    // Pause / Continue button (left). CONTINUE is too long for FONT_LARGE in
    // the available 170 px width; drop to FONT_MEDIUM so it fits cleanly.
    uint16_t pauseBg   = sPaused ? COL_GREEN : COL_BLUE;
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

static void drawToastScreen() {
    Nextion::clear(COL_BG);
    Nextion::fillRect(20, 80, DISP_W - 40, 80, COL_PANEL);
    Nextion::drawTextCentered(20, 80, DISP_W - 40, 80,
                              FONT_LARGE, COL_TEXT, COL_PANEL, sToastMsg);
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

static void onScrollHit(int hit, int count, int& offset) {
    if (hit == -2 && offset > 0) { offset--; sDirty = true; }
    if (hit == -3 && offset + LIST_VISIBLE < count) { offset++; sDirty = true; }
}

static void onTouchIdle(const NextionTouch& t) {
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

static void onTouchClient(const NextionTouch& t) {
    if (inHomeButton(t, 4)) { goHome(); return; }
    int hit = listHit(t, sClientCount, sClientOffset);
    if (hit < 0) { onScrollHit(hit, sClientCount, sClientOffset); return; }
    Entity& c = sClients[hit];
    sSelClient      = c.id;
    sSelClientName  = c.name;
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
    sAppCount   = Api::fetchApps(sApps, MAX_ENTITIES);
    sAppOffset  = 0;     // fresh app list
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
    if (inRect(t, 8, 6, 64, 28)) { goTo(SCR_PROJECT); return; }  // back keeps sProjectOffset
    if (inRect(t, 12, DISP_H - 44, 120, 30)) { startSession(-1, "(no app)"); return; }
    int hit = listHit(t, sAppCount, sAppOffset);
    if (hit < 0) { onScrollHit(hit, sAppCount, sAppOffset); return; }
    Entity& a = sApps[hit];
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
                              FONT_LARGE, COL_ACCENT, COL_BG, "LIXIE STOPKY");
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

    if (sDirty) {
        switch (sScreen) {
            case SCR_BOOT:            /* drawn by showBootMessage */ break;
            case SCR_IDLE:            drawIdle();                 break;
            case SCR_CLIENT:          drawClientScreen();         break;
            case SCR_PROJECT:         drawProjectScreen();        break;
            case SCR_APP:             drawAppScreen();            break;
            case SCR_RUNNING:         drawRunningScreen();        break;
            case SCR_CONFIRM:         drawConfirmScreen();        break;
            case SCR_DISCARD_CONFIRM: drawDiscardConfirmScreen(); break;
            case SCR_TOAST:           drawToastScreen();          break;
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
    switch (sScreen) {
        case SCR_IDLE:            onTouchIdle(t);           break;
        case SCR_CLIENT:          onTouchClient(t);         break;
        case SCR_PROJECT:         onTouchProject(t);        break;
        case SCR_APP:             onTouchApp(t);            break;
        case SCR_RUNNING:         onTouchRunning(t);        break;
        case SCR_CONFIRM:         onTouchConfirm(t);        break;
        case SCR_DISCARD_CONFIRM: onTouchDiscardConfirm(t); break;
        default: break;
    }
}

}  // namespace UI
