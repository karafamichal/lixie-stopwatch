// Faithful mirror of the on-device Nextion screen. Renders an HTML surface
// at the same 400×240 coordinate system as the firmware (see DISP_W/DISP_H
// in nextion-stopwatch/config.h). The surface is scaled with CSS to fit the
// modal width, but the click handler always converts to device-native
// coordinates before POSTing — that way the firmware's hit-tests in ui.cpp
// keep working unchanged.
//
// One important constraint: the firmware sends a `screen` string + the
// existing live snapshot (client/project/app/elapsed/paused). It does NOT
// stream a framebuffer. Anything that depends on per-screen *temporary*
// state (settings preview swatches, list scroll offset, toast text) is best-
// effort — we render the layout but not the live preview values. Clicks
// still land correctly because the device's hit-tests are coordinate-based.

import { useEffect, useRef, useState } from 'react';
import * as api from '../api';

const DISP_W = 400;
const DISP_H = 240;

// Approximate palette mapped from the firmware's RGB565 constants (config.h):
//   COL_BG   0x10A2 -> dark slate
//   COL_PANEL 0x2104 -> raised panel
//   COL_ACCENT 0xFB00 -> Lixie orange (#FF8000)
const COL = {
  bg:     '#101418',
  panel:  '#1f2229',
  accent: '#FF8000',
  text:   '#FFFFFF',
  muted:  '#9aa0aa',
  green:  '#07E007',  // ish
  red:    '#E03030',
  blue:   '#3060E0',
  black:  '#000000',
  white:  '#FFFFFF',
};

// Match drawHomeButton / HOME_X / HOME_W / HOME_H in ui.cpp
const HOME_X = DISP_W - 44;
const HOME_W = 40;
const HOME_H = 32;

// Match BACK_X / BACK_W in ui.cpp (widened so "< Zurueck" fits).
const BACK_X = 8;
const BACK_W = 80;

// On-screen labels, keyed the same way as nextion-stopwatch/lang.cpp. The
// device tells us which language it is showing via `state.language`, so the
// mirror always reads the same as the physical panel. The firmware's fonts
// are ASCII-only, hence "Zurueck" instead of "Zurück" — we reproduce that
// faithfully rather than prettify it.
const STRINGS = {
  en: {
    back:              '< Back',
    weatherUnavail:    'Weather unavailable',
    newsLoading:       'Loading news…',
    start:             'START',
    selectClient:      'Select client',
    noItems:           'No items available',
    tapRow:            'Tap a row to continue',
    of:                'of',
    skipApp:           'Skip app',
    paused:            'PAUSED',
    running:           'RUNNING',
    elapsed:           'Elapsed:',
    cont:              'CONTINUE',
    pause:             'PAUSE',
    stop:              'STOP',
    saveSessionQ:      'Save session?',
    noApp:             '(no app)',
    duration:          'Duration:',
    discard:           'Discard',
    save:              'Save',
    discardSessionQ:   'Discard session?',
    timeLost:          'All elapsed time will be lost.',
    tracked:           'Tracked:',
    noKeep:            'No, keep',
    yesDiscard:        'Yes, discard',
    settings:          'Settings',
    clockColour:       'Clock colour:',
    brightness:        'Brightness:',
    language:          'Language:',
    brightLabels:      ['Low', 'Med', 'High', 'Max'],
    cancel:            'Cancel',
    booting:           'Booting…',
  },
  de: {
    back:              '< Zurueck',
    weatherUnavail:    'Wetterdaten fehlen',
    newsLoading:       'Nachrichten laden…',
    start:             'START',
    selectClient:      'Kunde waehlen',
    noItems:           'Keine Eintraege vorhanden',
    tapRow:            'Zeile antippen, um fortzufahren',
    of:                'von',
    skipApp:           'Ohne App',
    paused:            'PAUSIERT',
    running:           'AKTIV',
    elapsed:           'Dauer:',
    cont:              'WEITER',
    pause:             'PAUSE',
    stop:              'STOPP',
    saveSessionQ:      'Sitzung speichern?',
    noApp:             '(keine App)',
    duration:          'Dauer:',
    discard:           'Verwerfen',
    save:              'Speichern',
    discardSessionQ:   'Zeit verwerfen?',
    timeLost:          'Die erfasste Zeit geht verloren.',
    tracked:           'Erfasst:',
    noKeep:            'Behalten',
    yesDiscard:        'Verwerfen',
    settings:          'Einstellungen',
    clockColour:       'Uhrfarbe:',
    brightness:        'Helligkeit:',
    language:          'Sprache:',
    brightLabels:      ['Min', 'Mittel', 'Hoch', 'Max'],
    cancel:            'Abbrechen',
    booting:           'Startet…',
  },
};

// Native names shown on the device's language buttons — same for every UI
// language, matching Lang::name() in the firmware.
const LANGUAGE_NAMES = ['English', 'Deutsch'];

function strings(state) {
  return STRINGS[state?.language] || STRINGS.en;
}

// ── small primitives ─────────────────────────────────────────────────────────

function Rect({ x, y, w, h, bg, border, children, style, ...rest }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        background: bg,
        border: border ? `1px solid ${border}` : undefined,
        boxSizing: 'border-box',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function Label({ x, y, w, h, color = COL.text, bg = 'transparent', size = 14, weight = 400, align = 'center', children }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        color, background: bg,
        fontSize: size,
        fontWeight: weight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : (align === 'right' ? 'flex-end' : 'flex-start'),
        padding: align === 'left' ? '0 6px' : (align === 'right' ? '0 6px 0 0' : '0 4px'),
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >{children}</div>
  );
}

// Home icon — no backdrop tile, just the orange house glyph rendered on top
// of whatever the header strip already drew. Matches drawHomeButton() in
// ui.cpp, which lost its orange tile when the design moved to icon-only.
function HomeButton({ y = 4 }) {
  return (
    <div style={{
      position: 'absolute',
      left: HOME_X, top: y, width: HOME_W, height: HOME_H,
      display: 'grid', placeItems: 'center',
      color: COL.accent, fontWeight: 700, fontSize: 20,
    }}>
      ⌂
    </div>
  );
}

function Header({ title, showBack = false, t = STRINGS.en }) {
  const titleX = showBack ? BACK_X + BACK_W + 8 : 12;
  return (
    <>
      <Rect x={0} y={0} w={DISP_W} h={40} bg={COL.panel} />
      <Rect x={0} y={40} w={DISP_W} h={1} bg={COL.accent} />
      {showBack && (
        <Rect x={BACK_X} y={6} w={BACK_W} h={28} bg={COL.bg}>
          <Label x={0} y={0} w={BACK_W} h={28} size={11}>{t.back}</Label>
        </Rect>
      )}
      <Label x={titleX} y={6} w={DISP_W - titleX - (HOME_W + 8)} h={28}
             size={14} weight={600} align="left">{title}</Label>
      <HomeButton y={4} />
    </>
  );
}

// ── per-screen renderers ─────────────────────────────────────────────────────

function IdleScreen({ state }) {
  const t = strings(state);
  const w = state?.weather;
  const weatherText = w
    ? `${w.city || ''}   ${typeof w.temp_c === 'number' ? w.temp_c.toFixed(1) : '–'} °C   ${w.condition || ''}`.trim()
    : t.weatherUnavail;
  const news = state?.news_headline ? `* ${state.news_headline}` : t.newsLoading;
  return (
    <>
      <Label x={0} y={4} w={HOME_X} h={38} size={22} weight={700} color={COL.accent}>LIXIE STOPWATCH</Label>
      {/* Hamburger settings glyph (three horizontal bars) — icon only, no
          backdrop, matching drawIdleSettingsButton() in ui.cpp. */}
      <div style={{
        position: 'absolute',
        left: HOME_X, top: 4, width: HOME_W, height: HOME_H,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 5,
        pointerEvents: 'none',
      }}>
        <span style={{ width: 22, height: 4, borderRadius: 1, background: COL.accent }} />
        <span style={{ width: 22, height: 4, borderRadius: 1, background: COL.accent }} />
        <span style={{ width: 22, height: 4, borderRadius: 1, background: COL.accent }} />
      </div>

      {/* Weather strip — actual data from the device's last fetch */}
      <Rect x={20} y={48} w={DISP_W - 40} h={36} bg={COL.panel}>
        <Label x={0} y={0} w={DISP_W - 40} h={36} size={13} color={w ? COL.text : COL.muted}>
          {weatherText}
        </Label>
      </Rect>

      {/* News (rotates on device every NEWS_ROTATE_MS) */}
      <Label x={20} y={88} w={DISP_W - 40} h={48} size={11} color={COL.muted}>
        {news}
      </Label>

      {/* "START" pill button — same bbox as the firmware (60,148,280,52)
          with fully rounded ends (borderRadius = half the height = 26 px),
          matching drawIdle() in ui.cpp. */}
      <div style={{
        position: 'absolute',
        left:  60,
        top:   148,
        width:  DISP_W - 120,
        height: 52,
        borderRadius: 26,
        background: COL.accent,
        display: 'grid', placeItems: 'center',
      }}>
        <span style={{ color: COL.black, fontWeight: 700, fontSize: 22 }}>{t.start}</span>
      </div>

      {/* Footer date — also pushed by firmware */}
      <Label x={0} y={DISP_H - 18} w={DISP_W} h={18} size={11} color={COL.muted}>
        {state?.idle_date || '—'}
      </Label>
    </>
  );
}

// Render one Nextion list row (44 px tall on device; 40 px panel + 4 px gap).
// Includes the colour chip on the left like the firmware's drawList().
// All coords here are relative to the row (x=12, y=`y`) — chip = ROW_X+8 abs.
function ListRow({ y, item }) {
  if (!item) {
    return <Rect x={12} y={y} w={376} h={40} bg={COL.panel} />;
  }
  const label = item.extra ? `${item.extra}  ${item.name}` : item.name;
  return (
    <Rect x={12} y={y} w={376} h={40} bg={COL.panel}>
      {item.color && (
        <div style={{
          position: 'absolute',
          left: 8,        // matches Nextion::fillRect(ROW_X + 8, y + 8, 24, …)
          top: 8,
          width: 24,
          height: 24,
          background: item.color,
        }} />
      )}
      <Label x={40} y={4} w={376 - 50} h={28} size={13} align="left">
        {label}
      </Label>
    </Rect>
  );
}

function ListScreen({ title, state, visibleN = 4, showBack = false }) {
  const t       = strings(state);
  const rows    = state?.list_rows || [];
  const offset  = state?.list_offset ?? 0;
  const count   = state?.list_count ?? rows.length;
  const visible = Array.from({ length: visibleN }, (_, i) => rows[offset + i] || null);
  const empty   = count === 0;
  return (
    <>
      <Header title={title} showBack={showBack} t={t} />
      {visible.map((item, i) => (
        <ListRow key={i} y={52 + i * 44} item={item} />
      ))}
      {empty && (
        <Label x={12} y={52} w={376} h={44} size={13} color={COL.muted}>
          {t.noItems}
        </Label>
      )}
      {/* Scroll up / down buttons */}
      <Rect x={DISP_W - 44} y={52} w={32} h={60} bg={COL.panel}>
        <Label x={0} y={0} w={32} h={60} size={22} color={COL.text}>^</Label>
      </Rect>
      <Rect x={DISP_W - 44} y={152} w={32} h={60} bg={COL.panel}>
        <Label x={0} y={0} w={32} h={60} size={22} color={COL.text}>v</Label>
      </Rect>
      <Label x={0} y={DISP_H - 18} w={DISP_W} h={18} size={11} color={COL.muted}>
        {count > visibleN
          ? `${offset + 1}–${Math.min(offset + visibleN, count)} ${t.of} ${count}`
          : t.tapRow}
      </Label>
    </>
  );
}

// Breadcrumb that mirrors the navigation path the user took on the device,
// e.g. "Acme Corp / Site redesign / Design" — same shape as breadcrumb()
// in ui.cpp. Skips empty / missing segments.
function crumb(...parts) {
  return parts.filter(p => p && String(p).length).join(' / ');
}

function CategoryScreen({ state }) {
  const t = strings(state);
  return (
    <>
      <ListScreen
        title={crumb(state?.client_name, state?.project_name)}
        state={state}
        visibleN={3}
        showBack
      />
      {/* Skip-app button — same coords as on the app screen so users get a
          consistent place to skip selection. */}
      <Rect x={12} y={DISP_H - 44} w={120} h={30} bg={COL.panel}>
        <Label x={0} y={0} w={120} h={30} size={12}>{t.skipApp}</Label>
      </Rect>
    </>
  );
}

function AppScreen({ state }) {
  const t = strings(state);
  return (
    <>
      <ListScreen
        title={crumb(state?.client_name, state?.project_name, state?.category_name)}
        state={state}
        visibleN={3}
        showBack
      />
      {/* Skip-app button overlays the footer area */}
      <Rect x={12} y={DISP_H - 44} w={120} h={30} bg={COL.panel}>
        <Label x={0} y={0} w={120} h={30} size={12}>{t.skipApp}</Label>
      </Rect>
    </>
  );
}

function fmtHMS(secs) {
  if (secs == null || isNaN(secs)) return '00:00:00';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function RunningScreen({ state }) {
  const t      = strings(state);
  const accent = state?.client_color || COL.accent;
  const paused = !!state?.paused;
  const subtitle = (paused ? t.paused : t.running)
    + (state?.app_name ? `   ${state.app_name}` : '');
  return (
    <>
      {/* Top context strip (56 px) */}
      <Rect x={0} y={0} w={DISP_W} h={56} bg={COL.panel} />
      <Rect x={0} y={56} w={DISP_W} h={1} bg={accent} />
      <Label x={8} y={4} w={DISP_W - 16 - (HOME_W + 8)} h={24} size={14} weight={600} align="left">
        {state?.client_name || '—'}
      </Label>
      <Label x={8} y={30} w={DISP_W - 16 - (HOME_W + 8)} h={22} size={11}
             color={paused ? COL.red : COL.green} align="left">
        {subtitle}
      </Label>
      <HomeButton y={12} />

      {/* Project name now sits where RUNNING/PAUSED used to — rendered in
          the project's own colour so the session is instantly recognisable. */}
      <Label x={0} y={66} w={DISP_W} h={38} size={22} weight={700}
             color={state?.project_color || COL.text}>
        {state?.project_name || '—'}
      </Label>
      <Label x={0} y={112} w={DISP_W} h={30} size={14}>
        {t.elapsed} {fmtHMS(state?.elapsed_seconds)}
      </Label>

      {/* Pause / Continue (left). PAUSE = neutral grey #6B6B6B to match
          the firmware (COL_GREY); CONTINUE stays green for the affordance. */}
      <Rect x={20} y={162} w={170} h={58} bg={paused ? COL.green : '#6B6B6B'}>
        <Label x={0} y={0} w={170} h={58} size={paused ? 16 : 22} weight={700}
               color={paused ? COL.black : COL.white}>
          {paused ? t.cont : t.pause}
        </Label>
      </Rect>

      {/* Stop (right) */}
      <Rect x={210} y={162} w={170} h={58} bg={COL.red}>
        <Label x={0} y={0} w={170} h={58} size={22} weight={700} color={COL.white}>{t.stop}</Label>
      </Rect>
    </>
  );
}

function ConfirmScreen({ state }) {
  const t = strings(state);
  return (
    <>
      <Header title={t.saveSessionQ} t={t} />
      <Label x={0} y={56} w={DISP_W} h={24} size={14}>
        {(state?.client_name || '—')}  /  {(state?.project_name || '—')}
      </Label>
      <Label x={0} y={82} w={DISP_W} h={20} size={11} color={COL.muted}>
        {state?.app_name || t.noApp}
      </Label>
      <Label x={0} y={114} w={DISP_W} h={30} size={16} color={COL.accent} weight={600}>
        {t.duration} {fmtHMS(state?.elapsed_seconds)}
      </Label>
      <Rect x={28} y={178} w={156} h={44} bg={COL.panel}>
        <Label x={0} y={0} w={156} h={44} size={14} color={COL.muted}>{t.discard}</Label>
      </Rect>
      <Rect x={DISP_W - 184} y={178} w={156} h={44} bg={COL.green}>
        <Label x={0} y={0} w={156} h={44} size={14} weight={700} color={COL.black}>{t.save}</Label>
      </Rect>
    </>
  );
}

function DiscardConfirmScreen({ state }) {
  const t = strings(state);
  return (
    <>
      <Rect x={20} y={30} w={DISP_W - 40} h={130} bg={COL.panel} />
      <Rect x={20} y={30} w={DISP_W - 40} h={1} bg={COL.red} />
      <Rect x={20} y={160} w={DISP_W - 40} h={1} bg={COL.red} />
      <Label x={20} y={44} w={DISP_W - 40} h={36} size={20} weight={700}>{t.discardSessionQ}</Label>
      <Label x={20} y={88} w={DISP_W - 40} h={26} size={13} color={COL.muted}>{t.timeLost}</Label>
      <Label x={20} y={118} w={DISP_W - 40} h={28} size={14} color={COL.accent} weight={600}>
        {t.tracked} {fmtHMS(state?.elapsed_seconds)}
      </Label>
      <Rect x={28} y={178} w={160} h={50} bg={COL.blue}>
        <Label x={0} y={0} w={160} h={50} size={14} weight={700} color={COL.white}>{t.noKeep}</Label>
      </Rect>
      <Rect x={DISP_W - 188} y={178} w={160} h={50} bg={COL.red}>
        <Label x={0} y={0} w={160} h={50} size={14} weight={700} color={COL.white}>{t.yesDiscard}</Label>
      </Rect>
    </>
  );
}

function SettingsScreen({ state }) {
  const t = strings(state);
  // Layout constants mirror SET_* in ui.cpp (three rows + Save / Cancel).
  const swW = 54, swH = 36, swY = 70, swGap = 4, swX0 = 28;
  const brW = 84, brH = 30, brY = 138, brGap = 12, brX0 = 14;
  const lgW = 112, lgH = 26, lgY = 174, lgGap = 8;
  const lgX0 = DISP_W - 20 - (LANGUAGE_NAMES.length * lgW + (LANGUAGE_NAMES.length - 1) * lgGap);
  const btnY = 206, btnW = 156, btnH = 30;
  const swatchHex = ['#FF8000', '#FF0000', '#FFD700', '#00FF00', '#00FFFF', '#FF00FF'];
  // The device only streams the *saved* language, not the live preview the
  // user may be tapping through — highlight the saved one as best effort.
  const activeLang = state?.language === 'de' ? 1 : 0;
  return (
    <>
      <Header title={t.settings} t={t} />
      <Label x={20} y={44} w={360} h={22} size={13} color={COL.text} weight={600} align="left">{t.clockColour}</Label>
      {swatchHex.map((c, i) => (
        <Rect key={i} x={swX0 + i * (swW + swGap)} y={swY} w={swW} h={swH} bg={c} />
      ))}
      <Label x={20} y={112} w={360} h={22} size={13} color={COL.text} weight={600} align="left">{t.brightness}</Label>
      {t.brightLabels.map((l, i) => (
        <Rect key={i} x={brX0 + i * (brW + brGap)} y={brY} w={brW} h={brH} bg={COL.panel}>
          <Label x={0} y={0} w={brW} h={brH} size={13}>{l}</Label>
        </Rect>
      ))}
      <Label x={20} y={lgY} w={lgX0 - 24} h={lgH} size={13} color={COL.text} weight={600} align="left">{t.language}</Label>
      {LANGUAGE_NAMES.map((name, i) => {
        const on = i === activeLang;
        return (
          <Rect key={name} x={lgX0 + i * (lgW + lgGap)} y={lgY} w={lgW} h={lgH} bg={on ? COL.accent : COL.panel}>
            <Label x={0} y={0} w={lgW} h={lgH} size={13} weight={on ? 700 : 400} color={on ? COL.black : COL.text}>{name}</Label>
          </Rect>
        );
      })}
      <Rect x={28} y={btnY} w={btnW} h={btnH} bg={COL.green}>
        <Label x={0} y={0} w={btnW} h={btnH} size={13} weight={700} color={COL.black}>{t.save}</Label>
      </Rect>
      <Rect x={DISP_W - btnW - 28} y={btnY} w={btnW} h={btnH} bg={COL.panel}>
        <Label x={0} y={0} w={btnW} h={btnH} size={13} color={COL.muted}>{t.cancel}</Label>
      </Rect>
    </>
  );
}

function ToastScreen({ state }) {
  return (
    <Rect x={20} y={80} w={DISP_W - 40} h={80} bg={COL.panel}>
      <Label x={0} y={0} w={DISP_W - 40} h={80} size={22} weight={700}>
        {state?.toast_message || '…'}
      </Label>
    </Rect>
  );
}

function BootScreen({ state }) {
  const t = strings(state);
  return (
    <>
      <Label x={0} y={80} w={DISP_W} h={40} size={22} weight={700} color={COL.accent}>LIXIE STOPWATCH</Label>
      <Label x={0} y={130} w={DISP_W} h={30} size={14} color={COL.muted}>{t.booting}</Label>
    </>
  );
}

// Stopwatch glyph rendered as inline SVG — used when the device sleeps mid-
// running session. Mirrors drawStopwatchIcon() in ui.cpp.
function StopwatchGlyph() {
  return (
    <svg viewBox="0 0 100 100" width={120} height={120}>
      <g fill="none" stroke={COL.accent} strokeWidth="4">
        <circle cx="50" cy="55" r="34" />
        <line x1="50" y1="55" x2="50" y2="30" />
        <line x1="50" y1="55" x2="68" y2="55" />
        <line x1="50" y1="21" x2="50" y2="14" />
      </g>
      <rect x="46" y="10"  width="8" height="6" fill={COL.accent} />
      <circle cx="50" cy="55" r="3" fill={COL.accent} />
    </svg>
  );
}

// Coffee-cup glyph rendered as inline SVG — used when paused or when the
// idle screen has gone to sleep. Mirrors drawCoffeeIcon() in ui.cpp.
function CoffeeGlyph() {
  return (
    <svg viewBox="0 0 100 100" width={120} height={120}>
      <g fill="none" stroke={COL.accent} strokeWidth="4">
        <rect x="22" y="40" width="50" height="42" />
        <line x1="28" y1="48" x2="66" y2="48" />
        <circle cx="78" cy="60" r="10" />
        {/* Steam wisps */}
        <path d="M34 32 Q30 26 34 22 Q38 18 34 12" />
        <path d="M50 32 Q46 26 50 22 Q54 18 50 12" />
        <path d="M66 32 Q62 26 66 22 Q70 18 66 12" />
      </g>
    </svg>
  );
}

function SleepScreen({ state }) {
  // Pick the icon from the underlying state — running session shows the
  // stopwatch, paused / idle-sleep show the coffee cup. The container is
  // fully black to match Nextion's drawSleepScreen().
  const paused = state?.state === 'paused' || state?.state === 'idle';
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: '#000',
      display: 'grid', placeItems: 'center',
    }}>
      {paused ? <CoffeeGlyph /> : <StopwatchGlyph />}
    </div>
  );
}

function ScreenContent({ screen, state }) {
  switch (screen) {
    case 'idle':            return <IdleScreen state={state} />;
    case 'client':          return <ListScreen title={strings(state).selectClient} state={state} />;
    case 'project':         return <ListScreen title={crumb(state?.client_name)} state={state} showBack />;
    case 'category':        return <CategoryScreen state={state} />;
    case 'app':             return <AppScreen state={state} />;
    case 'running':         return <RunningScreen state={state} />;
    case 'confirm':         return <ConfirmScreen state={state} />;
    case 'discard_confirm': return <DiscardConfirmScreen state={state} />;
    case 'settings':        return <SettingsScreen state={state} />;
    case 'toast':           return <ToastScreen state={state} />;
    case 'boot':            return <BootScreen state={state} />;
    case 'sleep':           return <SleepScreen state={state} />;
    default:                return <IdleScreen state={state} />;
  }
}

// ── main component ───────────────────────────────────────────────────────────

export default function RemoteDisplay({ device, online, state }) {
  const surfaceRef = useRef(null);
  const [scale,    setScale]    = useState(1);
  const [flash,    setFlash]    = useState(null);          // {x,y} of last tap
  const [error,    setError]    = useState('');
  const [sending,  setSending]  = useState(false);
  const screen = state?.screen || 'boot';

  // Watch the surface width and keep an inner-layer scale factor so children
  // can be positioned in native 400×240 device coords.
  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const apply = () => setScale(el.clientWidth / DISP_W);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Briefly highlight where the user tapped so they get visual feedback even
  // while we wait for the device to push the resulting screen change.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 400);
    return () => clearTimeout(t);
  }, [flash]);

  const handleClick = async (e) => {
    if (!online) {
      setError('Device is offline.');
      return;
    }
    const rect = surfaceRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width)  * DISP_W);
    const y = Math.round(((e.clientY - rect.top)  / rect.height) * DISP_H);
    const clamped = {
      x: Math.max(0, Math.min(DISP_W - 1, x)),
      y: Math.max(0, Math.min(DISP_H - 1, y)),
    };
    setFlash(clamped);
    setError('');
    setSending(true);
    try {
      await api.devices.remoteTouch(device.id, clamped.x, clamped.y);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send touch');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <p className="text-slate-500 font-mono truncate">{device.hardware_id}</p>
        <span className={online ? 'text-emerald-400' : 'text-slate-500'}>
          {online ? '● live' : '○ offline'}
        </span>
      </div>

      {/* The clickable surface. width:100% with aspect-ratio keeps the 400:240
          ratio. The inner div is fixed at 400×240 device-px and CSS-scaled
          to match — children can then position themselves in native coords. */}
      <div
        ref={surfaceRef}
        onClick={handleClick}
        className="relative w-full select-none cursor-crosshair rounded-lg overflow-hidden border border-slate-700"
        style={{ background: COL.bg, aspectRatio: `${DISP_W} / ${DISP_H}` }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: DISP_W,
            height: DISP_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          <ScreenContent screen={screen} state={state} />

          {/* Tap ripple */}
          {flash && (
            <div
              style={{
                position: 'absolute',
                left: flash.x - 14, top: flash.y - 14,
                width: 28, height: 28,
                borderRadius: '50%',
                border: '2px solid #FF8000',
                pointerEvents: 'none',
                opacity: 0.85,
                animation: 'pulse-fade 400ms ease-out forwards',
              }}
            />
          )}
        </div>
        <style>{`
          @keyframes pulse-fade {
            from { transform: scale(0.5); opacity: 0.9; }
            to   { transform: scale(1.8); opacity: 0; }
          }
        `}</style>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-slate-500">
          Screen: <span className="text-slate-300">{screen}</span>
          {sending && <span className="ml-2 text-amber-400">sending…</span>}
        </span>
        {error && <span className="text-red-400">{error}</span>}
        {!online && !error && (
          <span className="text-slate-500">Reconnect the device to control it.</span>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Click anywhere on the screen above to send a touch to the device. The mirror
        re-renders within a tick after the device confirms the new screen.
      </p>
    </div>
  );
}
