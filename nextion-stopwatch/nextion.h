// Communication with the Nextion touch display (NX4024T032).
// Provides:
//   - begin() – UART setup, baud rate change, disable auto‑responses
//   - poll() – read touch events (raw coordinates)
//   - drawing functions (fillRect, drawText, drawLine...)
//   - cmd() / cmdf() – send raw commands to the display.
// ============================================================================

#ifndef NEXTION_H
#define NEXTION_H

#include <Arduino.h>

// Touch event delivered to the UI layer.
struct NextionTouch {
    uint16_t x;
    uint16_t y;
    bool     pressed;  // true on press-down, false on release
};

namespace Nextion {

// Bring up UART1 on the configured pins, bootstrap baud from 9600 -> 115200,
// enable sendxy mode so we receive raw touch coordinates.
void begin();

// --- Raw I/O ----------------------------------------------------------------

// Send a single ASCII command and append the 0xFF 0xFF 0xFF terminator.
void cmd(const String& c);
void cmdf(const char* fmt, ...);

// Drain pending bytes from the display (RX). Call this in loop() — when a
// complete touch packet arrives, getTouch() returns true and fills `out`.
bool poll(NextionTouch& out);

// --- Drawing primitives -----------------------------------------------------

void clear(uint16_t color);
void fillRect(int x, int y, int w, int h, uint16_t color);
void drawRect(int x, int y, int w, int h, uint16_t color);
void drawLine(int x1, int y1, int x2, int y2, uint16_t color);
void drawCircle(int x, int y, int r, uint16_t color, bool filled = false);

// xstr — string with explicit bounding box and alignment.
//   align: 0 = left, 1 = centre, 2 = right
void drawText(int x, int y, int w, int h,
              uint8_t font, uint16_t fcolor, uint16_t bcolor,
              uint8_t align, const String& text);

// Convenience: centred text inside (x,y,w,h) on transparent-looking background
// by painting bcolor first; for true transparency use sty=1 via drawTextSty().
void drawTextCentered(int x, int y, int w, int h,
                      uint8_t font, uint16_t fcolor, uint16_t bcolor,
                      const String& text);

// Full xstr with the sty (background style) parameter exposed.
//   sty: 0 = crop image bg, 1 = solid bcolor, 2 = image, 3 = no-bg (transparent)
void drawTextSty(int x, int y, int w, int h,
                 uint8_t font, uint16_t fcolor, uint16_t bcolor,
                 uint8_t align_h, uint8_t align_v,
                 uint8_t sty, const String& text);

// Escape any " inside the string so the Nextion parser stays happy.
String escape(const String& s);

}  // namespace Nextion

#endif
