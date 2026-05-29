#ifndef UTF8CP1250_H
#define UTF8CP1250_H

#include <Arduino.h>

// Convert a UTF-8 String to plain 7-bit ASCII by transliterating Latin
// diacritics (č->c, ľ->l, ä->a, ...). Punctuation like en/em dash and curly
// quotes is folded to their ASCII equivalents. The HMI we use generates
// fonts with only the ASCII charset, so anything else would render as a
// missing glyph.
//
// Unknown codepoints fall back to '?'.
String utf8ToAscii(const String& in);

#endif
