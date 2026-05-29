#ifndef API_H
#define API_H

void setupWiFiAndNTP();          // pripojenie na Wi-Fi a NTP
bool fetchDigits(int digits[6]); // vráti 6 číslic (HH:MM:SS)
bool sendFinishedSession(int durationSeconds); // POST na server

#endif