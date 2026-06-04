#include "news.h"
#include "config.h"
#include "utf8cp1250.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

static String   sItems[NEWS_MAX];
static int      sCount = 0;
static uint32_t sLastUpdateMs = 0;

static String decodeEntities(String s) {
    if (s.startsWith("<![CDATA[")) {
        s = s.substring(9);
        if (s.endsWith("]]>")) s = s.substring(0, s.length() - 3);
    }
    s.replace("&amp;",  "&");
    s.replace("&apos;", "'");
    s.replace("&quot;", "\"");
    s.replace("&lt;",   "<");
    s.replace("&gt;",   ">");
    s.replace("&nbsp;", " ");
    s.trim();
    return s;
}

namespace News {

bool refresh() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[news] skipped (no WiFi)");
        return false;
    }

    HTTPClient http;
    http.setTimeout(8000);
    // Many publishers 403 a bare empty UA, so always send one.
    http.setUserAgent("LixieStopWatch/1.0 (ESP32)");
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

    bool isHttps = String(NEWS_RSS_URL).startsWith("https://");
    WiFiClientSecure secure;
    secure.setInsecure();   // skip cert validation — embedded UI, low value target

    bool ok = isHttps ? http.begin(secure, NEWS_RSS_URL)
                      : http.begin(NEWS_RSS_URL);
    if (!ok) {
        Serial.printf("[news] begin() failed for %s\n", NEWS_RSS_URL);
        return false;
    }

    int code = http.GET();
    if (code != 200) {
        String body = http.getString();
        Serial.printf("[news] HTTP %d body=%s\n",
                      code, body.substring(0, 120).c_str());
        http.end();
        return false;
    }

    // Read the body manually — http.getString() returns "" for chunked
    // responses over TLS on the ESP32 Arduino core, which is exactly the
    // shape WordPress VIP / Varnish backends ship. Looping on
    // getStreamPtr()->available() handles both Content-Length and chunked.
    static const int   BODY_CAP   = 32000;
    static const uint32_t DEADLINE = 8000;
    WiFiClient* stream = http.getStreamPtr();
    int contentLen = http.getSize();          // -1 if unknown (chunked)
    String body;
    body.reserve(contentLen > 0 && contentLen < BODY_CAP ? contentLen : 8192);

    uint32_t start = millis();
    while ((millis() - start) < DEADLINE && (int)body.length() < BODY_CAP) {
        size_t avail = stream->available();
        if (avail > 0) {
            while (avail-- > 0 && (int)body.length() < BODY_CAP) {
                body += (char)stream->read();
            }
            continue;
        }
        if (contentLen > 0 && (int)body.length() >= contentLen) break;
        if (!http.connected() && stream->available() == 0) break;
        delay(2);
    }
    http.end();

    Serial.printf("[news] fetched %u bytes (cl=%d)\n",
                  (unsigned)body.length(), contentLen);

    sCount = 0;
    int idx = 0;
    bool skipFirst = true;   // first <title> is usually the feed name

    while (sCount < NEWS_MAX) {
        int open = body.indexOf("<title", idx);
        if (open < 0) break;
        int gt = body.indexOf('>', open);
        if (gt < 0) break;
        int close = body.indexOf("</title>", gt + 1);
        if (close < 0) break;
        String t = decodeEntities(body.substring(gt + 1, close));
        if (skipFirst) {
            skipFirst = false;
        } else if (t.length() > 0) {
            t = utf8ToAscii(t);                    // strip Slovak diacritics
            if (t.length() > 100) t = t.substring(0, 97) + "...";
            sItems[sCount++] = t;
        }
        idx = close + 8;
    }

    Serial.printf("[news] parsed %d headlines\n", sCount);

    sLastUpdateMs = millis();
    if (sLastUpdateMs == 0) sLastUpdateMs = 1;
    return sCount > 0;
}

int count() { return sCount; }

const String& get(int idx) {
    static String empty;
    return (idx >= 0 && idx < sCount) ? sItems[idx] : empty;
}

uint32_t lastUpdateMs() { return sLastUpdateMs; }

}  // namespace News
