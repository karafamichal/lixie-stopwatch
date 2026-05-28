#include "ui.h"
#include "api.h"
#include "config.h"
#include <WiFi.h>
#include <time.h>

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

static int sListOffset = 0;                  // top index for scrolling lists
static const int LIST_VISIBLE = 4;            // rows on screen at once
static const int ROW_H = 44;
static const int ROW_X = 12, ROW_Y0 = 52, ROW_W = 376;

// Current selection
static int sSelClient  = -1;   static String sSelClientName;
static int sSelProject = -1;   static String sSelProjectName;
static int sSelApp     = -1;   static String sSelAppName;
static uint16_t sSelClientColor = COL_ACCENT;

// Stopwatch
static uint32_t sStartMs    = 0;
static String   sStartIso;  // captured at moment of START
static uint32_t sLastTimerSec = 0;

// Toast
static String   sToastMsg;
static uint32_t sToastUntil = 0;

// Clock cache for idle screen
static uint32_t sLastClockSec = 0;

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

// ---------------------------------------------------------------------------
// Drawing — header strip used on every non-idle screen
// ---------------------------------------------------------------------------
static void drawHeader(const String& title, bool showBack) {
    Nextion::fillRect(0, 0, DISP_W, 40, COL_PANEL);
    Nextion::drawLine(0, 40, DISP_W, 40, COL_ACCENT);
    if (showBack) {
        Nextion::fillRect(8, 6, 64, 28, COL_BG);
        Nextion::drawTextCentered(8, 6, 64, 28, FONT_SMALL, COL_TEXT, COL_BG, "< Back");
    }
    Nextion::drawTextSty(showBack ? 80 : 12, 6, DISP_W - (showBack ? 92 : 24), 28,
                         FONT_MEDIUM, COL_TEXT, COL_PANEL, 0, 1, 1, title);
}

static void drawFooterHint(const String& s) {
    Nextion::fillRect(0, DISP_H - 18, DISP_W, 18, COL_BG);
    Nextion::drawTextCentered(0, DISP_H - 18, DISP_W, 18,
                              FONT_SMALL, COL_MUTED, COL_BG, s);
}

// ---------------------------------------------------------------------------
// List rendering (shared by client/project/app screens)
// ---------------------------------------------------------------------------
static void drawList(Entity* items, int count, const String& emptyMsg) {
    // background panels for visible rows
    for (int i = 0; i < LIST_VISIBLE; ++i) {
        int y = ROW_Y0 + i * ROW_H;
        int idx = sListOffset + i;
        Nextion::fillRect(ROW_X, y, ROW_W, ROW_H - 4, COL_PANEL);

        if (idx >= count) continue;

        Entity& e = items[idx];
        uint16_t col = hexToRgb565(e.color);

        // colour swatch
        Nextion::fillRect(ROW_X + 8, y + 8, 24, ROW_H - 20, col);

        // label
        String label = e.name;
        if (e.extra.length() && (e.extra[0] != 0)) {
            // For apps the extra is the icon (emoji) — Nextion's built-in fonts
            // usually don't render emoji, so we prepend the first char as a
            // lightweight marker only when ASCII. Projects keep client_name as
            // an extra hint.
            label = e.extra + "  " + e.name;
        }
        Nextion::drawTextSty(ROW_X + 40, y + 4, ROW_W - 50, ROW_H - 12,
                             FONT_MEDIUM, COL_TEXT, COL_PANEL, 0, 1, 1, label);
    }

    if (count == 0) {
        Nextion::drawTextCentered(ROW_X, ROW_Y0, ROW_W, ROW_H,
                                  FONT_MEDIUM, COL_MUTED, COL_BG, emptyMsg);
    }

    // scroll controls (right side)
    int btnX = DISP_W - 44;
    Nextion::fillRect(btnX, ROW_Y0, 32, 60, COL_PANEL);
    Nextion::drawTextCentered(btnX, ROW_Y0, 32, 60, FONT_LARGE, COL_TEXT, COL_PANEL, "^");
    Nextion::fillRect(btnX, ROW_Y0 + 100, 32, 60, COL_PANEL);
    Nextion::drawTextCentered(btnX, ROW_Y0 + 100, 32, 60, FONT_LARGE, COL_TEXT, COL_PANEL, "v");
}

// Hit-test the list region. Returns selected index, or -2 for "scroll up",
// -3 for "scroll down", -1 for nothing.
static int listHit(const NextionTouch& t, int count) {
    int btnX = DISP_W - 44;
    if (inRect(t, btnX, ROW_Y0, 32, 60)) return -2;
    if (inRect(t, btnX, ROW_Y0 + 100, 32, 60)) return -3;
    for (int i = 0; i < LIST_VISIBLE; ++i) {
        int y = ROW_Y0 + i * ROW_H;
        if (inRect(t, ROW_X, y, ROW_W, ROW_H - 4)) {
            int idx = sListOffset + i;
            if (idx >= 0 && idx < count) return idx;
        }
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Per-screen draw functions
// ---------------------------------------------------------------------------
static void drawIdle() {
    Nextion::clear(COL_BG);
    Nextion::drawTextCentered(0, 12, DISP_W, 24,
                              FONT_MEDIUM, COL_ACCENT, COL_BG, "NIXIE STOPKY");

    // clock placeholder area — filled per-second by tick()
    Nextion::fillRect(0, 70, DISP_W, 96, COL_BG);

    // big "TAP TO START" hint at the bottom (the whole screen is the hotspot)
    Nextion::fillRect(40, 184, DISP_W - 80, 36, COL_ACCENT);
    Nextion::drawTextCentered(40, 184, DISP_W - 80, 36,
                              FONT_MEDIUM, COL_BLACK, COL_ACCENT,
                              "TAP TO START");

    // WiFi state in bottom corner
    drawFooterHint(WiFi.status() == WL_CONNECTED
                       ? "WiFi: " + WiFi.SSID() + "   " + WiFi.localIP().toString()
                       : "WiFi: disconnected");
    sLastClockSec = 0;  // force refresh
}

static void redrawIdleClock() {
    time_t now = time(nullptr);
    if (now == sLastClockSec) return;
    sLastClockSec = now;
    struct tm tm_local;
    localtime_r(&now, &tm_local);
    char buf[12];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d",
             tm_local.tm_hour, tm_local.tm_min, tm_local.tm_sec);
    Nextion::drawTextSty(0, 70, DISP_W, 96, FONT_HUGE,
                         COL_ACCENT, COL_BG, 1, 1, 1, String(buf));
}

static void drawClientScreen() {
    Nextion::clear(COL_BG);
    drawHeader("Select client", false);
    drawList(sClients, sClientCount, "No clients available");
    drawFooterHint("Tap a client to continue");
}

static void drawProjectScreen() {
    Nextion::clear(COL_BG);
    drawHeader(String("Project — ") + sSelClientName, true);
    drawList(sProjects, sProjectCount, "No projects for this client");
    drawFooterHint("Tap a project to continue");
}

static void drawAppScreen() {
    Nextion::clear(COL_BG);
    drawHeader(String("App — ") + sSelProjectName, true);
    drawList(sApps, sAppCount, "No apps available");

    // "Skip app" button — app is optional in the API.
    Nextion::fillRect(12, DISP_H - 44, 120, 30, COL_PANEL);
    Nextion::drawTextCentered(12, DISP_H - 44, 120, 30,
                              FONT_SMALL, COL_TEXT, COL_PANEL, "Skip app");
    drawFooterHint("Pick the app you'll be using");
}

static void drawRunningScreen() {
    Nextion::clear(COL_BG);

    // Top context
    Nextion::fillRect(0, 0, DISP_W, 48, COL_PANEL);
    Nextion::drawLine(0, 48, DISP_W, 48, sSelClientColor);
    String topLine = sSelClientName + "  /  " + sSelProjectName;
    Nextion::drawTextSty(8, 4, DISP_W - 16, 20,
                         FONT_SMALL, COL_TEXT, COL_PANEL, 1, 1, 1, topLine);
    Nextion::drawTextSty(8, 24, DISP_W - 16, 20,
                         FONT_SMALL, COL_MUTED, COL_PANEL, 1, 1, 1,
                         sSelApp >= 0 ? sSelAppName : String("(no app)"));

    // Timer area
    Nextion::fillRect(0, 60, DISP_W, 110, COL_BG);
    sLastTimerSec = 0;  // force redraw

    // Big stop button
    Nextion::fillRect(60, 184, DISP_W - 120, 44, COL_RED);
    Nextion::drawTextCentered(60, 184, DISP_W - 120, 44,
                              FONT_LARGE, COL_WHITE, COL_RED, "STOP");
}

static void redrawRunningTimer() {
    uint32_t sec = (millis() - sStartMs) / 1000;
    if (sec == sLastTimerSec) return;
    sLastTimerSec = sec;
    Nextion::drawTextSty(0, 60, DISP_W, 110, FONT_HUGE,
                         sSelClientColor, COL_BG, 1, 1, 1, fmtHMS(sec));
}

static void drawConfirmScreen() {
    Nextion::clear(COL_BG);
    drawHeader("Save session?", false);

    Nextion::drawTextCentered(0, 56, DISP_W, 24,
                              FONT_MEDIUM, COL_MUTED, COL_BG,
                              sSelClientName + "  /  " + sSelProjectName);

    Nextion::drawTextSty(0, 88, DISP_W, 70, FONT_HUGE,
                         COL_ACCENT, COL_BG, 1, 1, 1,
                         fmtHMS(sLastTimerSec));

    // Buttons
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

// ---------------------------------------------------------------------------
// Touch handlers
// ---------------------------------------------------------------------------
static void onTouchIdle(const NextionTouch& t) {
    // Any tap → fetch clients and move on.
    goTo(SCR_CLIENT);
    sClientCount = Api::fetchClients(sClients, MAX_ENTITIES);
    sListOffset = 0;
    sDirty = true;
}

static void onScrollHit(int hit, int count) {
    if (hit == -2 && sListOffset > 0) { sListOffset--; sDirty = true; }
    if (hit == -3 && sListOffset + LIST_VISIBLE < count) { sListOffset++; sDirty = true; }
}

static void onTouchClient(const NextionTouch& t) {
    int hit = listHit(t, sClientCount);
    if (hit < 0) { onScrollHit(hit, sClientCount); return; }
    Entity& c = sClients[hit];
    sSelClient      = c.id;
    sSelClientName  = c.name;
    sSelClientColor = hexToRgb565(c.color);
    sProjectCount   = Api::fetchProjects(c.id, sProjects, MAX_ENTITIES);
    sListOffset = 0;
    goTo(SCR_PROJECT);
}

static void onTouchProject(const NextionTouch& t) {
    // Back arrow
    if (inRect(t, 8, 6, 64, 28)) { goTo(SCR_CLIENT); return; }
    int hit = listHit(t, sProjectCount);
    if (hit < 0) { onScrollHit(hit, sProjectCount); return; }
    Entity& p = sProjects[hit];
    sSelProject     = p.id;
    sSelProjectName = p.name;
    sAppCount = Api::fetchApps(sApps, MAX_ENTITIES);
    sListOffset = 0;
    goTo(SCR_APP);
}

static void startSession(int appId, const String& appName) {
    sSelApp     = appId;
    sSelAppName = appName;
    sStartMs    = millis();
    sStartIso   = isoNowUtc();
    goTo(SCR_RUNNING);
}

static void onTouchApp(const NextionTouch& t) {
    if (inRect(t, 8, 6, 64, 28)) { goTo(SCR_PROJECT); return; }
    if (inRect(t, 12, DISP_H - 44, 120, 30)) { startSession(-1, "(no app)"); return; }
    int hit = listHit(t, sAppCount);
    if (hit < 0) { onScrollHit(hit, sAppCount); return; }
    Entity& a = sApps[hit];
    startSession(a.id, a.name);
}

static void onTouchRunning(const NextionTouch& t) {
    if (inRect(t, 60, 184, DISP_W - 120, 44)) {
        sLastTimerSec = (millis() - sStartMs) / 1000;
        goTo(SCR_CONFIRM);
    }
}

static void onTouchConfirm(const NextionTouch& t) {
    if (inRect(t, 28, 178, 156, 44)) {  // Discard
        toast("Discarded");
        return;
    }
    if (inRect(t, DISP_W - 184, 178, 156, 44)) {  // Save
        bool ok = Api::postTimelog(sSelClient, sSelProject, sSelApp,
                                   sStartIso, sLastTimerSec);
        toast(ok ? "Saved!" : "Save failed");
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
void showBootMessage(const String& msg) {
    Nextion::clear(COL_BG);
    Nextion::drawTextCentered(0, 80, DISP_W, 40,
                              FONT_LARGE, COL_ACCENT, COL_BG, "NIXIE STOPKY");
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

void toast(const String& message, uint16_t ms) {
    sToastMsg = message;
    sToastUntil = millis() + ms;
    goTo(SCR_TOAST);
}

void tick() {
    // Toast auto-dismiss
    if (sScreen == SCR_TOAST && millis() >= sToastUntil) {
        // Clear out session state after a save/discard cycle.
        sSelApp = -1;
        goTo(SCR_IDLE);
    }

    if (sDirty) {
        switch (sScreen) {
            case SCR_BOOT:    /* drawn by showBootMessage */ break;
            case SCR_IDLE:    drawIdle();           break;
            case SCR_CLIENT:  drawClientScreen();   break;
            case SCR_PROJECT: drawProjectScreen();  break;
            case SCR_APP:     drawAppScreen();      break;
            case SCR_RUNNING: drawRunningScreen();  break;
            case SCR_CONFIRM: drawConfirmScreen();  break;
            case SCR_TOAST:   drawToastScreen();    break;
        }
        sDirty = false;
    }

    if (sScreen == SCR_IDLE)    redrawIdleClock();
    if (sScreen == SCR_RUNNING) redrawRunningTimer();
}

void handleTouch(const NextionTouch& t) {
    if (!t.pressed) return;  // act on press, ignore release
    switch (sScreen) {
        case SCR_IDLE:    onTouchIdle(t);    break;
        case SCR_CLIENT:  onTouchClient(t);  break;
        case SCR_PROJECT: onTouchProject(t); break;
        case SCR_APP:     onTouchApp(t);     break;
        case SCR_RUNNING: onTouchRunning(t); break;
        case SCR_CONFIRM: onTouchConfirm(t); break;
        default: break;
    }
}

}  // namespace UI
