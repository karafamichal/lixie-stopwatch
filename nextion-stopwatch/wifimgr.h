#ifndef WIFIMGR_H
#define WIFIMGR_H

#include <Arduino.h>

namespace WifiMgr {

// Attempt to bring the link up. The order is:
//   1. Credentials previously saved via the on-device setup page (NVS).
//   2. WIFI_SSID / WIFI_PASSWORD from config.h (factory defaults).
//   3. Soft-AP setup mode — returns false. Caller should switch to setup UI.
// Returns true if station mode is connected.
bool begin();

// Drives the captive-portal web server while we're in AP setup mode.
// Call from the main loop; no-op when station-connected.
void loop();

// True while we're serving the setup page; false during normal operation.
bool isApMode();

// Wipe stored credentials from NVS. Useful for a "Reset WiFi" menu later.
void forget();

}  // namespace WifiMgr

#endif
