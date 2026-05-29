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
    if (WiFi.status() != WL_CONNECTED) return false;

    HTTPClient http;
    http.setTimeout(8000);

    bool isHttps = String(NEWS_RSS_URL).startsWith("https://");
    WiFiClientSecure secure;
    secure.setInsecure();   // skip cert validation — embedded UI, low value target

    bool ok = isHttps ? http.begin(secure, NEWS_RSS_URL)
                      : http.begin(NEWS_RSS_URL);
    if (!ok) return false;

    int code = http.GET();
    if (code != 200) { http.end(); return false; }

    String body = http.getString();
    http.end();

    // Trim absurdly large feeds to keep heap manageable.
    if (body.length() > 32000) body = body.substring(0, 32000);

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
