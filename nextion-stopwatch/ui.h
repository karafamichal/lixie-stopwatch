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

}  // namespace UI

#endif
