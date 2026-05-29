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

namespace UI {

enum Screen {
    SCR_BOOT,
    SCR_IDLE,
    SCR_CLIENT,
    SCR_PROJECT,
    SCR_APP,
    SCR_RUNNING,
    SCR_CONFIRM,
    SCR_DISCARD_CONFIRM,
    SCR_TOAST
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

// Brief banner (e.g. "Saved!", "POST failed"). Shown for `ms`, then auto-
// transitions to `nextScreen` (defaults to SCR_IDLE).
void toast(const String& message, uint16_t ms = 1500, Screen nextScreen = SCR_IDLE);

// Snapshot of what the device is doing right now — published over WebSocket
// to the dashboard so multiple users can watch live sessions.
struct LiveSnapshot {
    const char* state;            // "idle"|"selecting"|"running"|"paused"|"confirm"
    int      clientId;            // -1 if none
    String   clientName;
    String   clientColor;         // "#RRGGBB", empty if none
    int      projectId;           // -1 if none
    String   projectName;
    int      appId;               // -1 if none
    String   appName;
    String   startIso;            // empty if no active session
    uint32_t elapsedSec;          // 0 if not running/paused
    bool     paused;
};

LiveSnapshot getLiveSnapshot();

}  // namespace UI

#endif
