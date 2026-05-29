#ifndef NEWS_H
#define NEWS_H

#include <Arduino.h>

#define NEWS_MAX 5

namespace News {

// Blocking — fetches NEWS_RSS_URL, parses the first NEWS_MAX <title> tags
// (skipping the feed's own title), strips CDATA and XML entities. Returns
// true if at least one headline landed.
bool refresh();

int count();
const String& get(int idx);

// millis() at the moment the last successful refresh completed.
uint32_t lastUpdateMs();

}  // namespace News

#endif
