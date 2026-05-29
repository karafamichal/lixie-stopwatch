#include "wifimgr.h"
#include "config.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>

static Preferences prefs;
static WebServer   server(80);
static DNSServer   dnsServer;
static bool        sApMode = false;

// HTML-escape the few characters we care about for safe SSID display.
static String htmlEsc(const String& s) {
    String o; o.reserve(s.length());
    for (size_t i = 0; i < s.length(); ++i) {
        char c = s[i];
        if      (c == '<')  o += "&lt;";
        else if (c == '>')  o += "&gt;";
        else if (c == '&')  o += "&amp;";
        else if (c == '"')  o += "&quot;";
        else if (c == '\'') o += "&#39;";
        else o += c;
    }
    return o;
}

static bool tryStation(const char* ssid, const char* pass) {
    if (!ssid || !*ssid) return false;
    Serial.printf("[wifi] connecting to '%s'...", ssid);
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, pass);
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - t0 < WIFI_CONNECT_TIMEOUT_MS) {
        delay(250);
        Serial.print(".");
    }
    Serial.println();
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("[wifi] OK ip=%s\n", WiFi.localIP().toString().c_str());
        return true;
    }
    Serial.println("[wifi] timeout");
    WiFi.disconnect(true, true);
    return false;
}

// ---------------------------------------------------------------------------
// AP / captive portal
// ---------------------------------------------------------------------------
static String renderPage(const String& flash) {
    String h;
    h.reserve(2048);
    h += F("<!DOCTYPE html><html><head><meta charset='utf-8'>"
           "<meta name='viewport' content='width=device-width,initial-scale=1'>"
           "<title>Lixie Stopky WiFi Setup</title><style>"
           "body{font-family:sans-serif;background:#15171c;color:#eee;"
           "max-width:480px;margin:0 auto;padding:18px;}"
           "h1{color:#ff8000;margin-bottom:4px;font-size:22px;}"
           ".sub{color:#888;font-size:13px;margin-bottom:18px;}"
           "label{display:block;margin-top:14px;color:#aaa;font-size:13px;}"
           "select,input{width:100%;padding:10px;margin-top:4px;"
           "background:#23252c;color:#eee;border:1px solid #3a3d45;"
           "border-radius:6px;font-size:15px;box-sizing:border-box;}"
           "button{margin-top:18px;width:100%;padding:12px;"
           "background:#ff8000;color:#000;border:none;border-radius:6px;"
           "font-size:16px;font-weight:bold;cursor:pointer;}"
           ".msg{margin:12px 0;padding:10px;background:#1d3a1d;color:#9f9;"
           "border-radius:6px;font-size:13px;}"
           ".foot{margin-top:24px;color:#666;font-size:11px;}"
           "</style></head><body>"
           "<h1>LIXIE STOPKY</h1>"
           "<div class='sub'>WiFi setup — pick a network and enter the password</div>");

    if (flash.length()) {
        h += "<div class='msg'>" + flash + "</div>";
    }

    h += F("<form method='POST' action='/save'>"
           "<label>Network</label><select name='ssid'>");

    int n = WiFi.scanNetworks();
    if (n <= 0) {
        h += "<option value=''>(no networks visible — reload the page)</option>";
    } else {
        for (int i = 0; i < n; i++) {
            String ssid = WiFi.SSID(i);
            int    rssi = WiFi.RSSI(i);
            bool   open = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
            h += "<option value='" + htmlEsc(ssid) + "'>"
               + htmlEsc(ssid) + "  ("
               + String(rssi) + " dBm"
               + (open ? ", open" : "")
               + ")</option>";
        }
    }
    h += F("</select>"
           "<label>Password</label>"
           "<input name='pass' type='password' placeholder='leave empty for open networks'>"
           "<button type='submit'>Save &amp; Connect</button>"
           "</form>"
           "<div class='foot'>The device restarts after saving. "
           "If it can't connect, this setup page will reappear.</div>"
           "</body></html>");
    return h;
}

static void handleRoot()      { server.send(200, "text/html", renderPage("")); }
static void handleGenerate204(){ server.send(200, "text/html", renderPage("")); }  // Android captive check
static void handleHotspot()   { server.send(200, "text/html", renderPage("")); }  // Apple captive check

static void handleSave() {
    String ssid = server.arg("ssid");
    String pass = server.arg("pass");
    if (ssid.length() == 0) {
        server.send(400, "text/html",
                    renderPage("SSID is required."));
        return;
    }
    prefs.begin("wifi", false);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.end();

    server.send(200, "text/html",
                F("<!DOCTYPE html><html><head><meta charset='utf-8'>"
                  "<title>Saved</title><style>"
                  "body{font-family:sans-serif;background:#15171c;color:#eee;"
                  "text-align:center;padding:40px 20px;}"
                  "h1{color:#9f9;}p{color:#aaa;}</style></head><body>"
                  "<h1>Saved</h1>"
                  "<p>Device restarting…</p>"
                  "<p>If the connection fails this AP will reappear.</p>"
                  "</body></html>"));
    delay(1200);
    ESP.restart();
}

static void enterApMode() {
    Serial.println("[wifi] entering AP setup mode");
    sApMode = true;

    WiFi.mode(WIFI_AP);
    bool ok = (strlen(AP_PASSWORD) >= 8)
                  ? WiFi.softAP(AP_SSID, AP_PASSWORD)
                  : WiFi.softAP(AP_SSID);
    IPAddress apIP = WiFi.softAPIP();
    Serial.printf("[wifi] AP '%s' up=%d ip=%s\n",
                  AP_SSID, ok ? 1 : 0, apIP.toString().c_str());

    // Captive DNS — every name resolves to us.
    dnsServer.start(53, "*", apIP);

    server.on("/",                handleRoot);
    server.on("/save",            HTTP_POST, handleSave);
    server.on("/generate_204",    handleGenerate204);   // Android
    server.on("/hotspot-detect.html", handleHotspot);   // iOS / macOS
    server.on("/connecttest.txt", handleHotspot);       // Windows
    server.onNotFound(handleRoot);
    server.begin();
}

namespace WifiMgr {

bool begin() {
    // 1. Try whatever the user last saved via the setup page.
    prefs.begin("wifi", true);
    String savedSsid = prefs.getString("ssid", "");
    String savedPass = prefs.getString("pass", "");
    prefs.end();

    if (savedSsid.length() &&
        tryStation(savedSsid.c_str(), savedPass.c_str())) {
        return true;
    }

    // 2. Fall back to the build-time defaults baked into config.h.
    if (strlen(WIFI_SSID) > 0 &&
        (savedSsid != WIFI_SSID || savedPass != WIFI_PASSWORD) &&
        tryStation(WIFI_SSID, WIFI_PASSWORD)) {
        return true;
    }

    // 3. Nothing worked — bring up the soft-AP for provisioning.
    enterApMode();
    return false;
}

void loop() {
    if (!sApMode) return;
    dnsServer.processNextRequest();
    server.handleClient();
}

bool isApMode() { return sApMode; }

void forget() {
    prefs.begin("wifi", false);
    prefs.clear();
    prefs.end();
}

}  // namespace WifiMgr
