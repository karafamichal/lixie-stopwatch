import { useState, useEffect, useCallback, useRef } from 'react';
import { Pencil, Trash2, Wifi, WifiOff, Palette, MonitorSmartphone, Download } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ColorPicker from '../components/ColorPicker';
import RemoteDisplay from '../components/RemoteDisplay';
import { t, locale } from '../i18n';

const BRIGHTNESS_LEVELS = [
  { label: 'Low',  value: 30  },
  { label: 'Med',  value: 80  },
  { label: 'High', value: 150 },
  { label: 'Max',  value: 250 },
];

// UI languages the firmware ships (nextion-stopwatch/lang.cpp). `code` is
// what goes over the wire; `label` is the native name the device itself
// shows on its Settings screen.
const DISPLAY_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
];

// A device is "live" if we've received a WS state push from it in the last
// 15 s. The ESP32 pushes idle state every 5 s, so 15 s is conservative.
const LIVE_WINDOW_MS = 15000;

// REST fallback: a `last_seen` newer than this counts as online even without
// a WS message yet (covers page load before the first WS state arrives).
const RECENT_LAST_SEEN_MS = 60000;

// Pomodoro / reminder / night-mode settings (firmware 1.1+). Night mode is
// off while night_start == night_end.
const DEFAULT_EXTRA = {
  pomodoro_min: 0, break_min: 5, reminder_min: 0,
  night_start: 0, night_end: 0, night_brightness: 10,
};
const EXTRA_RANGES = {
  pomodoro_min: [0, 120], break_min: [1, 60], reminder_min: [0, 480],
  night_start: [0, 23], night_end: [0, 23], night_brightness: [0, 255],
};
const NIGHT_LEVELS = [
  { label: 'LEDs off', value: 0 },
  { label: 'Very dim', value: 10 },
  { label: 'Dim',      value: 40 },
];

function clampInt(v, [lo, hi], fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none py-1">
      <span className="text-sm text-slate-300">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? 'bg-amber-500' : 'bg-slate-600'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </label>
  );
}

function NumberField({ value, onChange, min, max, label }) {
  return (
    <input type="number" className="input w-20" min={min} max={max} aria-label={label}
      value={value} onChange={e => onChange(e.target.value)} />
  );
}

function HourSelect({ value, onChange, label }) {
  return (
    <select className="input w-24" value={value} aria-label={label} onChange={e => onChange(parseInt(e.target.value, 10))}>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
      ))}
    </select>
  );
}

function findBrightnessIdx(v) {
  if (v == null) return 3;
  for (let i = 0; i < BRIGHTNESS_LEVELS.length; i++) {
    if (v <= BRIGHTNESS_LEVELS[i].value) return i;
  }
  return BRIGHTNESS_LEVELS.length - 1;
}

export default function Devices() {
  const [devices,      setDevices]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [editTarget,   setEditTarget]   = useState(null);
  const [label,        setLabel]        = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Matrix settings editor
  const [settingsTarget,    setSettingsTarget]    = useState(null);
  const [settingsColor,     setSettingsColor]     = useState('#FF8000');
  const [settingsColon,     setSettingsColon]     = useState('#FF8000');
  const [settingsLinked,    setSettingsLinked]    = useState(true);
  const [settingsBright,    setSettingsBright]    = useState(150);
  const [settingsDispBri,   setSettingsDispBri]   = useState(100);     // 0..100 %
  const [settingsSleepSec,  setSettingsSleepSec]  = useState(30);
  const [settingsSleepIdle, setSettingsSleepIdle] = useState(false);
  const [settingsLang,      setSettingsLang]      = useState('en');
  const [settingsBusy,      setSettingsBusy]      = useState(false);
  const [settingsFlash,     setSettingsFlash]     = useState('');
  const [extra,             setExtra]             = useState(DEFAULT_EXTRA);
  const setX = (key, value) => setExtra(e => ({ ...e, [key]: value }));

  // Firmware update
  const [fwInfo,    setFwInfo]    = useState(null);
  const [otaTarget, setOtaTarget] = useState(null);
  const [otaFlash,  setOtaFlash]  = useState('');

  // Live presence + full last state — hardware_id -> { ...device_state, _ts }.
  const [liveStates, setLiveStates] = useState({});
  const [now,        setNow]        = useState(Date.now());
  const wsRef = useRef(null);

  // Remote control modal target.
  const [remoteTarget, setRemoteTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.devices.list()
      .then(setDevices)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  useEffect(() => { api.firmware.info().then(setFwInfo).catch(() => {}); }, []);

  // Tick a local clock so the icon flips back to offline even when the WS
  // goes silent (e.g. device powered off — no message to react to).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to the dashboard WS so every device_state push refreshes our
  // liveStates map (used for both online detection AND the remote-control
  // mirror). Auto-reconnects on close.
  useEffect(() => {
    let closed = false;
    let retryTimer = null;

    const open = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/api/v1/ws`);
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe' }));
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'device_state' && msg.hardware_id) {
            setLiveStates(s => ({
              ...s,
              [msg.hardware_id]: { ...msg, _ts: Date.now() },
            }));
          }
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        retryTimer = setTimeout(open, 2000);
      };
      ws.onerror = () => ws.close();
    };

    // Seed with the REST live snapshot so devices show online right away
    // even before the first WS message lands.
    fetch('/api/v1/live')
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const seed = {};
        for (const r of rows) seed[r.hardware_id] = { ...r, _ts: Date.now() };
        setLiveStates(s => ({ ...seed, ...s }));
      })
      .catch(() => {});

    open();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const isOnline = useCallback((d) => {
    const live = liveStates[d.hardware_id];
    if (live && now - live._ts < LIVE_WINDOW_MS) return true;
    if (d.last_seen && Date.now() - new Date(d.last_seen).getTime() < RECENT_LAST_SEEN_MS) return true;
    return false;
  }, [liveStates, now]);

  const openEdit = (d) => { setLabel(d.label || ''); setEditTarget(d); };

  const handleSaveLabel = async (e) => {
    e.preventDefault();
    await api.devices.update(editTarget.id, { label });
    setEditTarget(null);
    load();
  };

  const handleDelete = async () => {
    await api.devices.remove(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const openSettings = async (d) => {
    setSettingsTarget(d);
    setSettingsFlash('');
    setSettingsBusy(true);
    try {
      const s = await api.devices.getSettings(d.id);
      const c = s.color || '#FF8000';
      setSettingsColor    (c);
      setSettingsColon    (s.colon_color || c);
      setSettingsLinked   (s.colon_linked !== false);                          // default true
      setSettingsBright   (s.brightness         != null ? s.brightness         : 150);
      setSettingsDispBri  (s.display_brightness != null ? s.display_brightness : 100);
      setSettingsSleepSec (s.sleep_timeout_sec  != null ? s.sleep_timeout_sec  : 30);
      setSettingsSleepIdle(s.sleep_on_idle === true);
      setSettingsLang     (s.language || 'en');
      setExtra(Object.fromEntries(Object.entries(DEFAULT_EXTRA).map(([k, d]) => [k, s[k] ?? d])));
    } catch {
      setExtra(DEFAULT_EXTRA);
      setSettingsColor('#FF8000');
      setSettingsColon('#FF8000');
      setSettingsLinked(true);
      setSettingsBright(150);
      setSettingsDispBri(100);
      setSettingsSleepSec(30);
      setSettingsSleepIdle(false);
      setSettingsLang('en');
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsBusy(true);
    setSettingsFlash('');
    try {
      const payload = {
        color:              settingsColor,
        brightness:         settingsBright,
        colon_linked:       settingsLinked,
        display_brightness: settingsDispBri,
        sleep_timeout_sec:  settingsSleepSec,
        sleep_on_idle:      settingsSleepIdle,
        language:           settingsLang,
        ...Object.fromEntries(Object.entries(extra).map(
          ([k, v]) => [k, clampInt(v, EXTRA_RANGES[k], DEFAULT_EXTRA[k])])),
      };
      // When unlinked, send the user's colon choice; when linked, the server
      // mirrors `color` so we don't need to send colon_color at all.
      if (!settingsLinked) payload.colon_color = settingsColon;
      const res = await api.devices.setSettings(settingsTarget.id, payload);
      setSettingsFlash(res.delivered
        ? t('Sent to device.')
        : t('Saved — device is offline, will apply on next connect.'));
      setTimeout(() => setSettingsTarget(null), 1100);
    } catch (e) {
      setSettingsFlash(e.response?.data?.error || t('Failed to save'));
    } finally {
      setSettingsBusy(false);
    }
  };

  const installFirmware = async () => {
    const d = otaTarget;
    setOtaTarget(null);
    try {
      const res = await api.firmware.install(d.id);
      setOtaFlash(res.delivered
        ? t('Update sent to {name}. It installs as soon as no session is running, then the device restarts.', { name: d.label || d.hardware_id })
        : t('{name} is offline. Try again when it is connected.', { name: d.label || d.hardware_id }));
    } catch (e) {
      setOtaFlash(e.response?.data?.error || t('Something went wrong'));
    }
  };

  const firmwareCell = (d) => {
    const live = liveStates[d.hardware_id];
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-slate-300">{live?.fw || '–'}</span>
        {live?.queued > 0 && (
          <span className="badge-pending" title={t('Sessions saved on the device while the server was unreachable')}>
            {t('{n} waiting to sync', { n: live.queued })}
          </span>
        )}
        {live?.ota_status === 'waiting' && <span className="text-xs text-slate-500">{t('update waiting')}</span>}
        {live?.ota_status === 'failed' && <span className="text-xs text-red-400">{t('update failed')}</span>}
      </div>
    );
  };

  const deviceActions = (d) => (
    <div className="flex justify-end gap-1">
      <button
        className="icon-btn"
        title={fwInfo ? t('Install uploaded firmware') : t('Upload firmware under Settings first')}
        onClick={() => setOtaTarget(d)}
        disabled={!fwInfo || !isOnline(d)}
      >
        <Download className="w-4 h-4" />
      </button>
      <button
        className="icon-btn"
        title={t('Remote control (mirror the display)')}
        onClick={() => setRemoteTarget(d)}
        disabled={!isOnline(d)}
      >
        <MonitorSmartphone className={`w-4 h-4 ${isOnline(d) ? '' : 'opacity-30'}`} />
      </button>
      <button className="icon-btn" title={t('Device settings')} onClick={() => openSettings(d)}>
        <Palette className="w-4 h-4" />
      </button>
      <button className="icon-btn" title={t('Edit label')} onClick={() => openEdit(d)}>
        <Pencil className="w-4 h-4" />
      </button>
      <button className="icon-btn-danger" title={t('Delete')} onClick={() => setDeleteTarget(d)}>
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('Devices')}</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{t('Devices register automatically on first time log submission')}</p>
        </div>
      </div>

      {otaFlash && (
        <p className="card px-4 py-3 mb-4 text-sm text-slate-300" role="status">{otaFlash}</p>
      )}

      {/* Desktop: table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/60">
              <th className="th">{t('Status')}</th>
              <th className="th">{t('Hardware ID')}</th>
              <th className="th">{t('Label')}</th>
              <th className="th">{t('Firmware')}</th>
              <th className="th">{t('Last Seen')}</th>
              <th className="th text-right">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="td text-center text-slate-500 py-10">{t('Loading…')}</td></tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={6} className="td text-center text-slate-500 py-10">
                  {t('No devices yet. Devices appear here after the ESP32 sends its first time log.')}
                </td>
              </tr>
            ) : devices.map(d => {
              const online = isOnline(d);
              return (
                <tr key={d.id} className="tr">
                  <td className="td">
                    {online
                      ? <Wifi className="w-4 h-4 text-green-400" title={t('Online (seen < 5 min ago)')} />
                      : <WifiOff className="w-4 h-4 text-slate-600" title={t('Offline')} />}
                  </td>
                  <td className="td font-mono text-sm text-amber-400">{d.hardware_id}</td>
                  <td className="td text-sm text-slate-300">{d.label || <span className="text-slate-600 italic">{t('no label')}</span>}</td>
                  <td className="td">{firmwareCell(d)}</td>
                  <td className="td text-sm text-slate-500">
                    {d.last_seen ? new Date(d.last_seen).toLocaleString(locale()) : '–'}
                  </td>
                  <td className="td">{deviceActions(d)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-slate-500 py-10">{t('Loading…')}</p>
        ) : devices.length === 0 ? (
          <p className="text-center text-slate-500 py-10">{t('No devices yet.')}</p>
        ) : devices.map(d => {
          const online = isOnline(d);
          return (
            <div key={d.id} className="card p-3 sm:p-4">
              <div className="flex items-center gap-3 mb-2">
                {online
                  ? <Wifi className="w-5 h-5 text-green-400 flex-shrink-0" title={t('Online')} />
                  : <WifiOff className="w-5 h-5 text-slate-600 flex-shrink-0" title={t('Offline')} />}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-amber-400 truncate">{d.hardware_id}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {d.label || <span className="text-slate-600 italic">{t('no label')}</span>}
                  </p>
                </div>
              </div>
              <div className="mb-2">{firmwareCell(d)}</div>
              <p className="text-xs text-slate-500 mb-2">
                {t('Last seen: {t}', { t: d.last_seen ? new Date(d.last_seen).toLocaleString(locale()) : '–' })}
              </p>
              <div className="border-t border-slate-700/60 pt-2 -mb-1">
                {deviceActions(d)}
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title={t('Edit Device Label')} size="sm">
        <form onSubmit={handleSaveLabel} className="space-y-4">
          <p className="text-xs text-slate-500 font-mono">{editTarget?.hardware_id}</p>
          <div>
            <label className="label">{t('Label')}</label>
            <input
              className="input"
              type="text"
              placeholder={t('e.g. Room 3 – Station A')}
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setEditTarget(null)}>{t('Cancel')}</button>
            <button type="submit" className="btn-primary">{t('Save Label')}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('Delete Device')}
        message={t('Remove device "{id}"? Time logs from this device are kept.', { id: deleteTarget?.hardware_id })}
      />

      <Modal isOpen={!!settingsTarget} onClose={() => setSettingsTarget(null)} title={t('Device settings')} size="sm">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-mono">
            {settingsTarget?.hardware_id}
          </p>

          <div>
            <p className="label mb-2">{t('Clock colour')}</p>
            <ColorPicker value={settingsColor} onChange={setSettingsColor} />
          </div>

          <div>
            <label className="flex items-center justify-between gap-3 cursor-pointer select-none py-1">
              <span className="text-sm text-slate-300">
                {t('Use same colour for the blinking dots')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settingsLinked}
                onClick={() => setSettingsLinked(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  settingsLinked ? 'bg-amber-500' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settingsLinked ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
            {!settingsLinked && (
              <div className="mt-3 pl-1">
                <p className="label mb-2">{t('Colon dot colour')}</p>
                <ColorPicker value={settingsColon} onChange={setSettingsColon} />
              </div>
            )}
          </div>

          <div>
            <p className="label mb-2">{t('LED matrix brightness')}</p>
            <div className="grid grid-cols-4 gap-2">
              {BRIGHTNESS_LEVELS.map((b, i) => {
                const active = findBrightnessIdx(settingsBright) === i;
                return (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => setSettingsBright(b.value)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      active
                        ? 'bg-amber-500 text-onaccent border-amber-400'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {t(b.label)}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">{t('Current: {v} / 255', { v: settingsBright })}</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="label mb-0">{t('Touch display brightness')}</p>
              <span className="text-xs text-slate-500">
                {settingsDispBri === 0 ? t('display off') : `${settingsDispBri} %`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={settingsDispBri}
              onChange={e => setSettingsDispBri(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500"
              aria-label={t('Touch display brightness percent')}
            />
          </div>

          <div className="space-y-2">
            <p className="label mb-0">{t('Auto-sleep')}</p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                max={3600}
                step={5}
                value={settingsSleepSec}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  setSettingsSleepSec(Number.isFinite(v) && v >= 0 ? v : 0);
                }}
                className="input w-24"
              />
              <span className="text-xs text-slate-400">
                {t('seconds idle before the screen shows just an icon')}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {t('0 disables auto-sleep. While running: stopwatch icon. While paused: coffee cup.')}
            </p>
            <label className="flex items-center justify-between gap-3 cursor-pointer select-none py-1">
              <span className="text-sm text-slate-300">
                {t('Also sleep from the idle / home screen (shows the coffee cup)')}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={settingsSleepIdle}
                onClick={() => setSettingsSleepIdle(v => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
                  settingsSleepIdle ? 'bg-amber-500' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settingsSleepIdle ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </label>
          </div>

          <div className="space-y-2 border-t border-slate-700 pt-4">
            <Toggle
              label={t('Pomodoro timer')}
              checked={extra.pomodoro_min > 0}
              onChange={on => setX('pomodoro_min', on ? 25 : 0)}
            />
            {extra.pomodoro_min > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <NumberField value={extra.pomodoro_min} min={1} max={120} label={t('Focus minutes')}
                  onChange={v => setX('pomodoro_min', v)} />
                <span>{t('min focus, then')}</span>
                <NumberField value={extra.break_min} min={1} max={60} label={t('Break minutes')}
                  onChange={v => setX('break_min', v)} />
                <span>{t('min break')}</span>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              {t('The LEDs count down each focus block. The session pauses for the break, and the digits blink when the break is over.')}
            </p>
          </div>

          <div className="space-y-2">
            <Toggle
              label={t('Remind me to start the timer')}
              checked={extra.reminder_min > 0}
              onChange={on => setX('reminder_min', on ? 30 : 0)}
            />
            {extra.reminder_min > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                <span>{t('after')}</span>
                <NumberField value={extra.reminder_min} min={1} max={480} label={t('Reminder minutes')}
                  onChange={v => setX('reminder_min', v)} />
                <span>{t('minutes on the home screen without a touch')}</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Toggle
              label={t('Dim the LEDs at night')}
              checked={extra.night_start !== extra.night_end}
              onChange={on => setExtra(e => ({ ...e, night_start: on ? 22 : 0, night_end: on ? 7 : 0 }))}
            />
            {extra.night_start !== extra.night_end && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
                  <span>{t('From')}</span>
                  <HourSelect value={extra.night_start} label={t('Night starts')} onChange={v => setX('night_start', v)} />
                  <span>{t('to')}</span>
                  <HourSelect value={extra.night_end} label={t('Night ends')} onChange={v => setX('night_end', v)} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {NIGHT_LEVELS.map(l => (
                    <button key={l.value} type="button" onClick={() => setX('night_brightness', l.value)}
                      className={`seg ${Number(extra.night_brightness) === l.value ? 'seg-on' : ''}`}>
                      {t(l.label)}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="text-[11px] text-slate-500">
              {t('Full brightness returns while a session is running.')}
            </p>
          </div>

          <div className="border-t border-slate-700 pt-4">
            <p className="label mb-2">{t('Touch display language')}</p>
            <div className="grid grid-cols-2 gap-2">
              {DISPLAY_LANGUAGES.map(l => {
                const active = settingsLang === l.code;
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => setSettingsLang(l.code)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                      active
                        ? 'bg-amber-500 text-onaccent border-amber-400'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {t('Applies to the on-device Nextion screen only. The dashboard language is set under Settings.')}
            </p>
          </div>

          {settingsFlash && (
            <p className="text-xs text-emerald-400">{settingsFlash}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setSettingsTarget(null)}>{t('Cancel')}</button>
            <button
              type="button"
              className="btn-primary"
              disabled={settingsBusy}
              onClick={handleSaveSettings}
            >
              {settingsBusy ? t('Saving…') : t('Apply')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!otaTarget}
        onClose={() => setOtaTarget(null)}
        onConfirm={installFirmware}
        title={t('Install firmware')}
        confirmLabel={t('Install')}
        message={t('Install "{file}" on {name}? The device waits until no session is running, then restarts with the new firmware.', {
          file: fwInfo?.name || 'firmware.bin',
          name: otaTarget?.label || otaTarget?.hardware_id,
        })}
      />

      {/* Remote Control — virtual screen mirror + touch injection */}
      <Modal
        isOpen={!!remoteTarget}
        onClose={() => setRemoteTarget(null)}
        title={t('Remote — {name}', { name: remoteTarget?.label || remoteTarget?.hardware_id || '' })}
        size="xl"
      >
        {remoteTarget && (
          <RemoteDisplay
            device={remoteTarget}
            online={isOnline(remoteTarget)}
            state={liveStates[remoteTarget.hardware_id]}
          />
        )}
      </Modal>
    </div>
  );
}
