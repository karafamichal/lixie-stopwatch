#ifndef API_H
#define API_H

// Načíta 6 číslic z API (alebo z mock dát)
bool fetchDigits(int digits[6]);

// Odošle ukončenie session na server
bool sendFinishedSession(int durationSeconds);

#endif