#include "utf8cp1250.h"

struct Pair { uint16_t cp; char ch; };

// Sorted ascending. Only non-ASCII codepoints are listed — input < 0x80 is
// pass-through, anything not in this table becomes '?'.
static const Pair MAP[] = {
    // Latin-1 supplement punctuation
    {0x00A0, ' '}, {0x00A1, '!'}, {0x00A2, 'c'}, {0x00A4, '$'},
    {0x00A6, '|'}, {0x00A7, 'S'}, {0x00A8, ' '}, {0x00A9, 'c'},
    {0x00AB, '<'}, {0x00AC, '!'}, {0x00AD, ' '}, {0x00AE, 'R'},
    {0x00B0, ' '}, {0x00B1, '+'}, {0x00B4, '\''},{0x00B5, 'u'},
    {0x00B6, 'P'}, {0x00B7, '.'}, {0x00B8, ','}, {0x00BB, '>'},
    // Latin-1 letters
    {0x00C0, 'A'}, {0x00C1, 'A'}, {0x00C2, 'A'}, {0x00C3, 'A'},
    {0x00C4, 'A'}, {0x00C5, 'A'}, {0x00C6, 'A'}, {0x00C7, 'C'},
    {0x00C8, 'E'}, {0x00C9, 'E'}, {0x00CA, 'E'}, {0x00CB, 'E'},
    {0x00CC, 'I'}, {0x00CD, 'I'}, {0x00CE, 'I'}, {0x00CF, 'I'},
    {0x00D0, 'D'}, {0x00D1, 'N'}, {0x00D2, 'O'}, {0x00D3, 'O'},
    {0x00D4, 'O'}, {0x00D5, 'O'}, {0x00D6, 'O'}, {0x00D7, 'x'},
    {0x00D8, 'O'}, {0x00D9, 'U'}, {0x00DA, 'U'}, {0x00DB, 'U'},
    {0x00DC, 'U'}, {0x00DD, 'Y'}, {0x00DE, 'T'}, {0x00DF, 's'},
    {0x00E0, 'a'}, {0x00E1, 'a'}, {0x00E2, 'a'}, {0x00E3, 'a'},
    {0x00E4, 'a'}, {0x00E5, 'a'}, {0x00E6, 'a'}, {0x00E7, 'c'},
    {0x00E8, 'e'}, {0x00E9, 'e'}, {0x00EA, 'e'}, {0x00EB, 'e'},
    {0x00EC, 'i'}, {0x00ED, 'i'}, {0x00EE, 'i'}, {0x00EF, 'i'},
    {0x00F0, 'd'}, {0x00F1, 'n'}, {0x00F2, 'o'}, {0x00F3, 'o'},
    {0x00F4, 'o'}, {0x00F5, 'o'}, {0x00F6, 'o'}, {0x00F7, '/'},
    {0x00F8, 'o'}, {0x00F9, 'u'}, {0x00FA, 'u'}, {0x00FB, 'u'},
    {0x00FC, 'u'}, {0x00FD, 'y'}, {0x00FE, 't'}, {0x00FF, 'y'},
    // Latin Extended-A (Slovak / Czech / Polish letters)
    {0x0102, 'A'}, {0x0103, 'a'},
    {0x0104, 'A'}, {0x0105, 'a'},
    {0x0106, 'C'}, {0x0107, 'c'},
    {0x010C, 'C'}, {0x010D, 'c'},
    {0x010E, 'D'}, {0x010F, 'd'},
    {0x0110, 'D'}, {0x0111, 'd'},
    {0x0118, 'E'}, {0x0119, 'e'},
    {0x011A, 'E'}, {0x011B, 'e'},
    {0x0139, 'L'}, {0x013A, 'l'},
    {0x013D, 'L'}, {0x013E, 'l'},
    {0x0141, 'L'}, {0x0142, 'l'},
    {0x0143, 'N'}, {0x0144, 'n'},
    {0x0147, 'N'}, {0x0148, 'n'},
    {0x0150, 'O'}, {0x0151, 'o'},
    {0x0154, 'R'}, {0x0155, 'r'},
    {0x0158, 'R'}, {0x0159, 'r'},
    {0x015A, 'S'}, {0x015B, 's'},
    {0x015E, 'S'}, {0x015F, 's'},
    {0x0160, 'S'}, {0x0161, 's'},
    {0x0162, 'T'}, {0x0163, 't'},
    {0x0164, 'T'}, {0x0165, 't'},
    {0x016E, 'U'}, {0x016F, 'u'},
    {0x0170, 'U'}, {0x0171, 'u'},
    {0x0179, 'Z'}, {0x017A, 'z'},
    {0x017B, 'Z'}, {0x017C, 'z'},
    {0x017D, 'Z'}, {0x017E, 'z'},
    // General punctuation
    {0x2013, '-'}, {0x2014, '-'},
    {0x2018, '\''}, {0x2019, '\''}, {0x201A, ','},
    {0x201C, '"'},  {0x201D, '"'},  {0x201E, '"'},
    {0x2020, '+'},  {0x2021, '+'},
    {0x2022, '*'},  {0x2026, '.'},
    {0x2030, '%'},  {0x2039, '<'}, {0x203A, '>'},
    {0x20AC, 'E'},  {0x2122, 'T'},
};
static const int MAP_LEN = sizeof(MAP) / sizeof(MAP[0]);

static char lookup(uint32_t cp) {
    if (cp > 0xFFFF) return '?';
    int lo = 0, hi = MAP_LEN - 1;
    while (lo <= hi) {
        int mid = (lo + hi) >> 1;
        if (MAP[mid].cp == cp) return MAP[mid].ch;
        if (MAP[mid].cp < cp) lo = mid + 1;
        else                  hi = mid - 1;
    }
    return '?';
}

String utf8ToAscii(const String& in) {
    String out;
    out.reserve(in.length());
    const size_t n = in.length();
    size_t i = 0;
    while (i < n) {
        uint8_t b1 = (uint8_t)in[i];

        if (b1 < 0x80) {
            out += (char)b1;
            i++;
            continue;
        }

        uint32_t cp = 0;
        size_t adv = 1;
        if ((b1 & 0xE0) == 0xC0 && i + 1 < n) {
            cp = ((b1 & 0x1F) << 6) | ((uint8_t)in[i + 1] & 0x3F);
            adv = 2;
        } else if ((b1 & 0xF0) == 0xE0 && i + 2 < n) {
            cp = ((b1 & 0x0F) << 12)
               | (((uint8_t)in[i + 1] & 0x3F) << 6)
               | ((uint8_t)in[i + 2] & 0x3F);
            adv = 3;
        } else if ((b1 & 0xF8) == 0xF0 && i + 3 < n) {
            out += '?';
            i += 4;
            continue;
        } else {
            i++;
            continue;
        }

        out += lookup(cp);
        i += adv;
    }
    return out;
}
