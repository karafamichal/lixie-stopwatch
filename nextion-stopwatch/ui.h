// Header for the user interface – screens (SCR_IDLE, SCR_CLIENT...).
// Functions:
//   - showBootMessage() – boot‑time status text
//   - goTo() – switch between screens
//   - tick() – redraws current screen if marked dirty
//   - handleTouch() – dispatches touches based on the current screen
//   - toast() – short message (e.g. "Saved!")
// ============================================================================

#ifndef UI_H
#define UI_H

#include "nextion.h"
#include <ArduinoJson.h>

namespace UI {

enum Screen {
    SCR_BOOT,
    SCR_IDLE,
    SCR_CLIENT,
    SCR_PROJECT,
    SCR_CATEGORY,      // app-category picker, sits between project and app
    SCR_APP,
    SCR_RUNNING,
    SCR_CONFIRM,
    SCR_DISCARD_CONFIRM,
    SCR_SETTINGS,
    SCR_TOAST,
    SCR_SLEEP          // dim auto-sleep view; touch anywhere wakes back
};

// Show a one-line status while booting (WiFi, NTP, ...).
void showBootMessage(const String& msg);

// Switch screen and force a full redraw next tick.
void goTo(Screen s);

// Returns current screen.
Screen current();

// Tick once per ~50 ms — handles redraws of dynamic content (clock, timer).
void tick();

// Forward a touch into the active screen's hit-tester.
void handleTouch(const NextionTouch& t);

// Synthetic-touch injection from the WebSocket "remote control" channel.
// Behaves identically to a touch coming from the Nextion UART.
void injectTouch(int x, int y, bool pressed);

// Brief banner (e.g. "Saved!", "POST failed"). Shown for `ms`, then auto-
// transitions to `nextScreen` (defaults to SCR_IDLE).
void toast(const String& message, uint16_t ms = 1500, Screen nextScreen = SCR_IDLE);

// Snapshot of what the device is doing right now — published over WebSocket
// to the dashboard so multiple users can watch live sessions.
struct LiveSnapshot {
    const char* state;            // "idle"|"selecting"|"running"|"paused"|"confirm"
    const char* screen;            // "idle"|"client"|"project"|"category"|"app"|"running"|"confirm"|"discard_confirm"|"settings"|"toast"|"boot"|"sleep"
    int      clientId;            // -1 if none
    String   clientName;
    String   clientColor;         // "#RRGGBB", empty if none
    int      projectId;           // -1 if none
    String   projectName;
    String   projectColor;        // "#RRGGBB", empty if none
    int      appId;               // -1 if none
    String   appName;
    String   categoryName;        // selected app category, empty if none yet
    String   startIso;            // empty if no active session
    uint32_t elapsedSec;          // 0 if not running/paused
    bool     paused;
};

LiveSnapshot getLiveSnapshot();

// Append screen-specific extras to the outgoing state JSON so the dashboard
// can render a faithful mirror without having to re-fetch lists, weather,
// news, etc. by itself:
//   - on IDLE:    weather{}, news_headline, idle_date
//   - on CLIENT / PROJECT / APP: list_rows[], list_offset, list_count
//   - on TOAST:   toast_message
// Other screens get nothing added.
void writeStateExtras(JsonDocument& doc);

}  // namespace UI

#endif
