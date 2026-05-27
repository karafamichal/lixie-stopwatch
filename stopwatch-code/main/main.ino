#include <Adafruit_NeoPixel.h>

#define PIN_MATRIX    13   // Pin pripojený do DIN prvej matice
#define NUM_LEDS     75   
Adafruit_NeoPixel matrix = Adafruit_NeoPixel(NUM_LEDS, PIN_MATRIX, NEO_GRB + NEO_KHZ800);


const int NASTAV_JAS_PERCENTA = 50;  // Jas od 0% do 100%

const byte FARBA_R = 0;             // Červená zložka (0 až 255)
const byte FARBA_G = 255;           // Zelená zložka (0 až 255) -> Default: Zelená
const byte FARBA_B = 0;             // Modrá zložka (0 až 255)

// Premenné pre čas stopiek
unsigned long predchadzajuciCas = 0;
const long interval = 1000; // 1 sekunda

int hodiny = 0;
int minuty = 0;
int sekundy = 0;

void setup() {
  matrix.begin();
  matrix.clear();
  matrix.show(); 

  // Prepočet nastavených percent (0-100) na hodnotu pre knižnicu (0-255)
  int bitovyJas = map(NASTAV_JAS_PERCENTA, 0, 100, 0, 255);
  matrix.setBrightness(bitovyJas);
}

void loop() {
  unsigned long aktualnyCas = millis();

  // Logika stopiek - bežia automaticky od zapnutia
  if (aktualnyCas - predchadzajuciCas >= interval) {
    predchadzajuciCas = aktualnyCas;
    
    sekundy++;
    if (sekundy >= 60) {
      sekundy = 0;
      minuty++;
      if (minuty >= 60) {
        minuty = 0;
        hodiny++;
        if (hodiny >= 24) {
          hodiny = 0;
        }
      }
    }

    // Aktualizácia LEDiek na základe času
    aktualizujDisplej();
  }
}

void aktualizujDisplej() {
  matrix.clear();

  // Namiešanie farby podľa zadaných konštánt
  uint32_t aktualnaFarba = matrix.Color(FARBA_R, FARBA_G, FARBA_B);
  uint32_t farbaDvojbodky = matrix.Color(255, 255, 255); // Biela pre blikajúcu dvojbodku

  // Dvojbodka bliká: svieti každú párnu sekundu
  bool svietiDvojbodka = (sekundy % 2 == 0); 

  // --- 1. MATRIX: HODINY (Offset 0) ---
  matrix.setPixelColor(0 + (hodiny / 10), aktualnaFarba);  // Riadok 1 & 2
  matrix.setPixelColor(10 + (hodiny % 10), aktualnaFarba); // Riadok 3 & 4
  if (svietiDvojbodka) {
    matrix.setPixelColor(20, farbaDvojbodky);              // Riadok 5 (Dvojbodka)
  }

  // --- 2. MATRIX: MINÚTY (Offset 25) ---
  matrix.setPixelColor(25 + (minuty / 10), aktualnaFarba);
  matrix.setPixelColor(35 + (minuty % 10), aktualnaFarba);
  if (svietiDvojbodka) {
    matrix.setPixelColor(45, farbaDvojbodky);
  }

  // --- 3. MATRIX: SEKUNDY (Offset 50) ---
  matrix.setPixelColor(50 + (sekundy / 10), aktualnaFarba);
  matrix.setPixelColor(60 + (sekundy % 10), aktualnaFarba);
  // Riadok 5 na tretej matici zostáva voľný a zhasnutý

  matrix.show();
}