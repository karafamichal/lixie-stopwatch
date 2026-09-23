#ifndef WSCLIENT_H
#define WSCLIENT_H

#include <Arduino.h>

// Persistent WebSocket pipe to the Flask backend. The connection is
// reestablished automatically by the underlying library; UI never has to
// worry about it. We push a JSON state snapshot every second while the user
// is actively timing, and every five seconds otherwise.
//
// Requires the "WebSockets" library by Markus Sattler (links2004) installed
// via the Arduino Library Manager.
namespace WsClient {

void begin();
void loop();
bool isConnected();

// Installs a firmware image the dashboard asked for (message type "ota"),
// but only once no session is running. Call from loop(); on success the
// device reboots into the new image and never returns from here.
void runPendingOta();

}  // namespace WsClient

#endif
