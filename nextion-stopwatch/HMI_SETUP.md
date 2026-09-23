# Nextion HMI setup — NX4024T032

The firmware draws **everything** at runtime via Nextion drawing commands
(`cls`, `fill`, `xstr`, `line`, etc.). The HMI file therefore only has to
provide the runtime fonts and a single empty page; no objects, no events.

> ⚠ **Required.** A brand-new display ships with a factory demo HMI that
> auto-runs an animation. That demo paints over our drawing commands and
> produces the "demo screen on top of the normal screen" symptom. You **must**
> upload the minimal HMI below at least once — after that, the demo is gone
> forever and our drawing commands own the framebuffer.

## 1. Create the HMI

1. Open Nextion Editor → **File ▸ New** → save as `lixie_stopwatch.HMI`.
2. **Settings ▸ Device** → pick `NX4024T032_011` (Basic, 400×240).
   Orientation: **Horizontal**.
3. Page 0 — leave empty. Background colour: `4258` (matches `COL_BG`).

## 2. Generate the four fonts

Use **Tools ▸ Font Generator** four times. Height is what matters; pick any
clean monospace or sans-serif font installed on your PC.

| Slot | Suggested font       | Height | Used for                |
|------|----------------------|--------|-------------------------|
| 0    | Arial                | 16 px  | small captions, hints   |
| 1    | Arial                | 24 px  | titles, list rows       |
| 2    | Arial Bold           | 40 px  | section headings, STOP  |
| 3    | DSEG7 / Bahnschrift  | 64 px  | the running stopwatch   |

After each generation, **Add Font** so they receive IDs `0..3` in that
order. Keep the default **ASCII** charset — the firmware transliterates
everything it draws to 7-bit ASCII (`utf8cp1250.cpp`), and the built-in
German translation (`lang.cpp`) is written without umlauts ("Zurueck",
"waehlen") for the same reason. The firmware references them via `config.h`:
`FONT_SMALL` / `FONT_MEDIUM` / `FONT_LARGE` / `FONT_HUGE`.

## 3. Page 0 preinitialise event

Open `Page0` → **Preinitialize Event** and paste:

```
bauds=115200
sendxy=1
bkcmd=0
cls 4258
```

`bauds=` persists across power cycles. `sendxy=1` makes the panel report
raw touch coordinates (`0x67 X Y ev FF FF FF`), which the firmware parses
in `Nextion::poll()`. `bkcmd=0` silences acknowledgement frames we never
read.

## 4. Compile & upload

1. **File ▸ TFT File Output** → save the `.tft`.
2. Copy onto a FAT32 microSD card (the file must be the only `.tft` on
   the card), insert into the display while powered off, power on. The
   display flashes the firmware automatically.
3. Eject the card and reboot the display.

## 5. Wiring to ESP32-S3 (N16R8)

```
NX4024T032 pin   ESP32-S3-N16R8
─────────────    ───────────────
+5V              5V   (USB-C from the dev board is enough)
GND              GND
TX               GPIO18  (RX1)
RX               GPIO17  (TX1)
```

> GPIO19/20 are reserved for native USB on the N16R8 — using them for
> UART kills the USB-CDC serial console. GPIO17/18 are free
> general-purpose pins.

Power both from the same 5 V rail and tie the grounds together. At the
default low/medium brightness the USB-C input is plenty; if you want to
run all 75 LEDs at full brightness with the display, switch to an
external 5 V / 5 A+ supply (see the main README for power notes).

## 6. First boot

On a brand-new display the factory baud is 9600. The firmware bootstraps
by sending `bauds=115200` at 9600, then switches its own UART to 115200.
After the first successful run the display remembers 115200 and
subsequent boots are immediate.
