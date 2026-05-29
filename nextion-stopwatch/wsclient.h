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

}  // namespace WsClient

#endif
