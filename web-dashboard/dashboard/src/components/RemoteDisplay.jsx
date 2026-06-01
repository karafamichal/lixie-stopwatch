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

// The orange home tile drawn on every non-idle screen — y=4 normally, y=12
// on the running screen.
function HomeButton({ y = 4 }) {
  return (
    <Rect x={HOME_X} y={y} w={HOME_W} h={HOME_H} bg={COL.accent}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: COL.white, fontWeight: 700, fontSize: 16 }}>
        ⌂
      </div>
    </Rect>
  );
}

function Header({ title, showBack = false }) {
  return (
    <>
      <Rect x={0} y={0} w={DISP_W} h={40} bg={COL.panel} />
      <Rect x={0} y={40} w={DISP_W} h={1} bg={COL.accent} />
      {showBack && (
        <Rect x={8} y={6} w={64} h={28} bg={COL.bg}>
          <Label x={0} y={0} w={64} h={28} size={11}>&lt; Back</Label>
        </Rect>
      )}
      <Label x={showBack ? 80 : 12} y={6} w={DISP_W - (showBack ? 80 : 12) - (HOME_W + 8)} h={28}
             size={14} weight={600} align="left">{title}</Label>
      <HomeButton y={4} />
    </>
  );
}

// ── per-screen renderers ─────────────────────────────────────────────────────

function IdleScreen() {
  return (
    <>
      <Label x={0} y={4} w={DISP_W} h={38} size={22} weight={700} color={COL.accent}>LIXIE STOPWATCH</Label>
      {/* "..." settings tile */}
      <Rect x={HOME_X} y={4} w={HOME_W} h={HOME_H} bg={COL.panel} border={COL.accent}>
        <Label x={0} y={0} w={HOME_W} h={HOME_H} size={20} color={COL.accent} weight={700}>…</Label>
      </Rect>

      {/* Weather strip placeholder */}
      <Rect x={20} y={48} w={DISP_W - 40} h={36} bg={COL.panel}>
        <Label x={0} y={0} w={DISP_W - 40} h={36} size={12} color={COL.muted}>weather</Label>
      </Rect>

      {/* News placeholder */}
      <Label x={20} y={88} w={DISP_W - 40} h={48} size={11} color={COL.muted}>* news headline rotates here…</Label>

      {/* TAP TO START button */}
      <Rect x={60} y={148} w={DISP_W - 120} h={52} bg={COL.accent}>
        <Label x={0} y={0} w={DISP_W - 120} h={52} size={22} weight={700} color={COL.black}>TAP TO START</Label>
      </Rect>

      {/* Footer (date) */}
      <Label x={0} y={DISP_H - 18} w={DISP_W} h={18} size={11} color={COL.muted}>—</Label>
    </>
  );
}

function ListScreen({ title }) {
  // The device renders the live list from the API; we don't have its rows
  // streamed here. Show 4 empty row slots in the correct positions so taps
  // still land where the firmware expects them.
  const rows = [0, 1, 2, 3].map(i => {
    const y = 52 + i * 44;
    return (
      <Rect key={i} x={12} y={y} w={376} h={40} bg={COL.panel}>
        <Label x={48} y={0} w={300} h={40} size={13} align="left" color={COL.muted}>row {i + 1}</Label>
      </Rect>
    );
  });
  return (
    <>
      <Header title={title} />
      {rows}
      {/* Scroll up / down buttons */}
      <Rect x={DISP_W - 44} y={52} w={32} h={60} bg={COL.panel}>
        <Label x={0} y={0} w={32} h={60} size={22} color={COL.text}>^</Label>
      </Rect>
      <Rect x={DISP_W - 44} y={152} w={32} h={60} bg={COL.panel}>
        <Label x={0} y={0} w={32} h={60} size={22} color={COL.text}>v</Label>
      </Rect>
      <Label x={0} y={DISP_H - 18} w={DISP_W} h={18} size={11} color={COL.muted}>Tap a row to continue</Label>
    </>
  );
}

function AppScreen() {
  return (
    <>
      <ListScreen title="App — select" />
      {/* Skip-app button overlays the footer area */}
      <Rect x={12} y={DISP_H - 44} w={120} h={30} bg={COL.panel}>
        <Label x={0} y={0} w={120} h={30} size={12}>Skip app</Label>
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
  const accent = state?.client_color || COL.accent;
  const paused = !!state?.paused;
  return (
    <>
      {/* Top context strip (56 px) */}
      <Rect x={0} y={0} w={DISP_W} h={56} bg={COL.panel} />
      <Rect x={0} y={56} w={DISP_W} h={1} bg={accent} />
      <Label x={8} y={4} w={DISP_W - 16 - (HOME_W + 8)} h={24} size={14} weight={600} align="left">
        {state?.client_name || '—'}
      </Label>
      <Label x={8} y={30} w={DISP_W - 16 - (HOME_W + 8)} h={22} size={11} color={COL.muted} align="left">
        {state?.project_name || '—'}{state?.app_name ? `   ${state.app_name}` : '   (no app)'}
      </Label>
      <HomeButton y={12} />

      <Label x={0} y={66} w={DISP_W} h={38} size={22} weight={700}
             color={paused ? COL.red : COL.green}>
        {paused ? 'PAUSED' : 'RUNNING'}
      </Label>
      <Label x={0} y={112} w={DISP_W} h={30} size={14}>
        Elapsed: {fmtHMS(state?.elapsed_seconds)}
      </Label>

      {/* Pause / Continue (left) */}
      <Rect x={20} y={162} w={170} h={58} bg={paused ? COL.green : COL.blue}>
        <Label x={0} y={0} w={170} h={58} size={paused ? 16 : 22} weight={700}
               color={paused ? COL.black : COL.white}>
          {paused ? 'CONTINUE' : 'PAUSE'}
        </Label>
      </Rect>

      {/* Stop (right) */}
      <Rect x={210} y={162} w={170} h={58} bg={COL.red}>
        <Label x={0} y={0} w={170} h={58} size={22} weight={700} color={COL.white}>STOP</Label>
      </Rect>
    </>
  );
}

function ConfirmScreen({ state }) {
  return (
    <>
      <Header title="Save session?" />
      <Label x={0} y={56} w={DISP_W} h={24} size={14}>
        {(state?.client_name || '—')}  /  {(state?.project_name || '—')}
      </Label>
      <Label x={0} y={82} w={DISP_W} h={20} size={11} color={COL.muted}>
        {state?.app_name || '(no app)'}
      </Label>
      <Label x={0} y={114} w={DISP_W} h={30} size={16} color={COL.accent} weight={600}>
        Duration: {fmtHMS(state?.elapsed_seconds)}
      </Label>
      <Rect x={28} y={178} w={156} h={44} bg={COL.panel}>
        <Label x={0} y={0} w={156} h={44} size={14} color={COL.muted}>Discard</Label>
      </Rect>
      <Rect x={DISP_W - 184} y={178} w={156} h={44} bg={COL.green}>
        <Label x={0} y={0} w={156} h={44} size={14} weight={700} color={COL.black}>Save</Label>
      </Rect>
    </>
  );
}

function DiscardConfirmScreen({ state }) {
  return (
    <>
      <Rect x={20} y={30} w={DISP_W - 40} h={130} bg={COL.panel} />
      <Rect x={20} y={30} w={DISP_W - 40} h={1} bg={COL.red} />
      <Rect x={20} y={160} w={DISP_W - 40} h={1} bg={COL.red} />
      <Label x={20} y={44} w={DISP_W - 40} h={36} size={20} weight={700}>Discard session?</Label>
      <Label x={20} y={88} w={DISP_W - 40} h={26} size={13} color={COL.muted}>All elapsed time will be lost.</Label>
      <Label x={20} y={118} w={DISP_W - 40} h={28} size={14} color={COL.accent} weight={600}>
        Tracked: {fmtHMS(state?.elapsed_seconds)}
      </Label>
      <Rect x={28} y={178} w={160} h={50} bg={COL.blue}>
        <Label x={0} y={0} w={160} h={50} size={14} weight={700} color={COL.white}>No, keep</Label>
      </Rect>
      <Rect x={DISP_W - 188} y={178} w={160} h={50} bg={COL.red}>
        <Label x={0} y={0} w={160} h={50} size={14} weight={700} color={COL.white}>Yes, discard</Label>
      </Rect>
    </>
  );
}

function SettingsScreen() {
  // Layout constants mirror SET_SWATCH_* / SET_BRIGHT_* / SET_BTN_* in ui.cpp.
  const swW = 54, swH = 40, swY = 78, swGap = 4, swX0 = 28;
  const brW = 84, brH = 36, brY = 156, brGap = 12, brX0 = 14;
  const btnY = 200, btnW = 156, btnH = 32;
  const swatchHex = ['#FF8000', '#FF0000', '#FFD700', '#00FF00', '#00FFFF', '#FF00FF'];
  const brLabels = ['Low', 'Med', 'High', 'Max'];
  return (
    <>
      <Header title="Settings" />
      <Label x={20} y={50} w={360} h={24} size={13} color={COL.text} weight={600} align="left">Clock colour:</Label>
      {swatchHex.map((c, i) => (
        <Rect key={i} x={swX0 + i * (swW + swGap)} y={swY} w={swW} h={swH} bg={c} />
      ))}
      <Label x={20} y={128} w={360} h={24} size={13} color={COL.text} weight={600} align="left">Brightness:</Label>
      {brLabels.map((l, i) => (
        <Rect key={i} x={brX0 + i * (brW + brGap)} y={brY} w={brW} h={brH} bg={COL.panel}>
          <Label x={0} y={0} w={brW} h={brH} size={13}>{l}</Label>
        </Rect>
      ))}
      <Rect x={28} y={btnY} w={btnW} h={btnH} bg={COL.green}>
        <Label x={0} y={0} w={btnW} h={btnH} size={13} weight={700} color={COL.black}>Save</Label>
      </Rect>
      <Rect x={DISP_W - btnW - 28} y={btnY} w={btnW} h={btnH} bg={COL.panel}>
        <Label x={0} y={0} w={btnW} h={btnH} size={13} color={COL.muted}>Cancel</Label>
      </Rect>
    </>
  );
}

function ToastScreen() {
  return (
    <Rect x={20} y={80} w={DISP_W - 40} h={80} bg={COL.panel}>
      <Label x={0} y={0} w={DISP_W - 40} h={80} size={22} weight={700}>…</Label>
    </Rect>
  );
}

function BootScreen() {
  return (
    <>
      <Label x={0} y={80} w={DISP_W} h={40} size={22} weight={700} color={COL.accent}>LIXIE STOPWATCH</Label>
      <Label x={0} y={130} w={DISP_W} h={30} size={14} color={COL.muted}>Booting…</Label>
    </>
  );
}

function ScreenContent({ screen, state }) {
  switch (screen) {
    case 'idle':            return <IdleScreen />;
    case 'client':          return <ListScreen title="Select client" />;
    case 'project':         return <ListScreen title={`Project — ${state?.client_name || ''}`} />;
    case 'app':             return <AppScreen />;
    case 'running':         return <RunningScreen state={state} />;
    case 'confirm':         return <ConfirmScreen state={state} />;
    case 'discard_confirm': return <DiscardConfirmScreen state={state} />;
    case 'settings':        return <SettingsScreen />;
    case 'toast':           return <ToastScreen />;
    case 'boot':            return <BootScreen />;
    default:                return <IdleScreen />;
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
