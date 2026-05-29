// Implements the serial link to the Nextion.
// Important:
//   - at start, sends "bauds=115200" at 9600 baud, then switches to 115200
//   - parses frames terminated by 0xFF 0xFF 0xFF, looks for type 0x67 (touch)
//   - drawing functions send commands like "fill x,y,w,h,color" plus three 0xFF
// ============================================================================

#include "nextion.h"
#include "config.h"
#include <HardwareSerial.h>
#include <stdarg.h>

static HardwareSerial NexSerial(NEXTION_UART_NUM);

// Incoming-byte buffer. Nextion frames terminate with 0xFF 0xFF 0xFF.
static uint8_t rxBuf[16];
static uint8_t rxLen = 0;
static uint8_t ffCount = 0;

static void writeTerminator() {
    NexSerial.write((uint8_t)0xFF);
    NexSerial.write((uint8_t)0xFF);
    NexSerial.write((uint8_t)0xFF);
}

namespace Nextion {

void begin() {
    // The Nextion boots its uploaded HMI immediately on power-up and may run a
    // built-in splash/animation in the meantime. We bring up UART at 9600 (its
    // factory default), persist the faster baud, then re-attach at 115200 and
    // hammer the display into a known blank state.
    NexSerial.begin(NEXTION_DEFAULT_BAUD, SERIAL_8N1, NEXTION_RX_PIN, NEXTION_TX_PIN);
    delay(100);
    NexSerial.print("bauds=");
    NexSerial.print(NEXTION_BAUD);
    writeTerminator();
    NexSerial.flush();
    delay(150);
    NexSerial.end();

    NexSerial.begin(NEXTION_BAUD, SERIAL_8N1, NEXTION_RX_PIN, NEXTION_TX_PIN);
    delay(100);

    // Silence any leftover boot reports.
    while (NexSerial.available()) NexSerial.read();

    // Disable ack/auto-sleep, enable touch coords, jump to page 0 and clear.
    // Sent twice because the display sometimes drops the very first frame
    // after a baud change.
    for (int i = 0; i < 2; i++) {
        cmd("bkcmd=0");
        cmd("sleep=0");        // make sure the panel is awake
        cmd("dim=100");        // backlight to 100%
        cmd("thup=1");          // wake on touch
        cmd("sendxy=1");
        cmd("page 0");
        cmd("cls 0");           // black wipe regardless of palette
        delay(20);
    }
    clear(COL_BG);              // final paint in our background colour
    rxLen = 0;
    ffCount = 0;
}

void cmd(const String& c) {
    NexSerial.print(c);
    writeTerminator();
}

void cmdf(const char* fmt, ...) {
    char buf[160];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);
    NexSerial.print(buf);
    writeTerminator();
}

String escape(const String& s) {
    String out;
    out.reserve(s.length());
    for (size_t i = 0; i < s.length(); ++i) {
        char c = s[i];
        if (c == '"') out += "\\\"";
        else if (c == '\\') out += "\\\\";
        else out += c;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Touch / event parsing
// ---------------------------------------------------------------------------
bool poll(NextionTouch& out) {
    while (NexSerial.available()) {
        uint8_t b = NexSerial.read();

        if (b == 0xFF) {
            ffCount++;
            if (ffCount >= 3) {
                // Frame complete — interpret.
                bool gotTouch = false;
                if (rxLen >= 6 && rxBuf[0] == 0x67) {
                    // sendxy press/release: 0x67 xH xL yH yL ev FF FF FF
                    out.x = (uint16_t)(rxBuf[1] << 8) | rxBuf[2];
                    out.y = (uint16_t)(rxBuf[3] << 8) | rxBuf[4];
                    out.pressed = (rxBuf[5] == 0x01);
                    gotTouch = true;
                }
                // Other frames (0x65, 0x66, etc.) are ignored here — we don't
                // rely on component-event reporting.
                rxLen = 0;
                ffCount = 0;
                if (gotTouch) return true;
            }
            continue;
        }

        ffCount = 0;
        if (rxLen < sizeof(rxBuf)) rxBuf[rxLen++] = b;
        else rxLen = 0;  // overflow safety
    }
    return false;
}

// Drawing

void clear(uint16_t color) {
    cmdf("cls %u", color);
}

void fillRect(int x, int y, int w, int h, uint16_t color) {
    cmdf("fill %d,%d,%d,%d,%u", x, y, w, h, color);
}

void drawRect(int x, int y, int w, int h, uint16_t color) {
    cmdf("draw %d,%d,%d,%d,%u", x, y, x + w, y + h, color);
}

void drawLine(int x1, int y1, int x2, int y2, uint16_t color) {
    cmdf("line %d,%d,%d,%d,%u", x1, y1, x2, y2, color);
}

void drawCircle(int x, int y, int r, uint16_t color, bool filled) {
    cmdf("%s %d,%d,%d,%u", filled ? "cirs" : "cir", x, y, r, color);
}

void drawText(int x, int y, int w, int h,
              uint8_t font, uint16_t fcolor, uint16_t bcolor,
              uint8_t align, const String& text) {
    // xstr x,y,w,h,font,fcolor,bcolor,xcen,ycen,sty,"text"
    // sty=1 = solid bcolor background.
    cmdf("xstr %d,%d,%d,%d,%u,%u,%u,%u,1,1,\"%s\"",
         x, y, w, h, font, fcolor, bcolor,
         align, escape(text).c_str());
}

void drawTextCentered(int x, int y, int w, int h,
                      uint8_t font, uint16_t fcolor, uint16_t bcolor,
                      const String& text) {
    cmdf("xstr %d,%d,%d,%d,%u,%u,%u,1,1,1,\"%s\"",
         x, y, w, h, font, fcolor, bcolor, escape(text).c_str());
}

void drawTextSty(int x, int y, int w, int h,
                 uint8_t font, uint16_t fcolor, uint16_t bcolor,
                 uint8_t align_h, uint8_t align_v,
                 uint8_t sty, const String& text) {
    cmdf("xstr %d,%d,%d,%d,%u,%u,%u,%u,%u,%u,\"%s\"",
         x, y, w, h, font, fcolor, bcolor,
         align_h, align_v, sty, escape(text).c_str());
}

}  // namespace Nextion
