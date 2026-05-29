#ifndef WEATHER_H
#define WEATHER_H

#include <Arduino.h>

struct WeatherInfo {
    bool     valid        = false;
    String   city;
    float    tempC        = 0;
    String   condition;       // human-readable: "Clear", "Rain", ...
    uint32_t lastUpdateMs = 0;
};

namespace Weather {

// Blocking — does an IP lookup (ip-api.com) on first call to learn lat/lon,
// then queries Open-Meteo for current temperature + weather code. Updates
// the cached WeatherInfo. Returns true on success.
bool refresh();

const WeatherInfo& get();

}  // namespace Weather

#endif
