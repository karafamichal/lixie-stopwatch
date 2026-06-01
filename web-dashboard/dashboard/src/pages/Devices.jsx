import { useState, useEffect, useCallback, useRef } from 'react';
import { Pencil, Trash2, Wifi, WifiOff, Palette, MonitorSmartphone } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ColorPicker from '../components/ColorPicker';
import RemoteDisplay from '../components/RemoteDisplay';

const BRIGHTNESS_LEVELS = [
  { label: 'Low',  value: 30  },
  { label: 'Med',  value: 80  },
  { label: 'High', value: 150 },
  { label: 'Max',  value: 250 },
];

// A device is "live" if we've received a WS state push from it in the last
// 15 s. The ESP32 pushes idle state every 5 s, so 15 s is conservative.
const LIVE_WINDOW_MS = 15000;

// REST fallback: a `last_seen` newer than this counts as online even without
// a WS message yet (covers page load before the first WS state arrives).
const RECENT_LAST_SEEN_MS = 60000;

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
  const [settingsTarget, setSettingsTarget] = useState(null);
  const [settingsColor,  setSettingsColor]  = useState('#FF8000');
  const [settingsColon,  setSettingsColon]  = useState('#FF8000');
  const [settingsLinked, setSettingsLinked] = useState(true);
  const [settingsBright, setSettingsBright] = useState(150);
  const [settingsBusy,   setSettingsBusy]   = useState(false);
  const [settingsFlash,  setSettingsFlash]  = useState('');

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
      setSettingsColor (c);
      setSettingsColon (s.colon_color || c);
      setSettingsLinked(s.colon_linked !== false);   // default true
      setSettingsBright(s.brightness != null ? s.brightness : 150);
    } catch {
      setSettingsColor('#FF8000');
      setSettingsColon('#FF8000');
      setSettingsLinked(true);
      setSettingsBright(150);
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    setSettingsBusy(true);
    setSettingsFlash('');
    try {
      const payload = {
        color:        settingsColor,
        brightness:   settingsBright,
        colon_linked: settingsLinked,
      };
      // When unlinked, send the user's colon choice; when linked, the server
      // mirrors `color` so we don't need to send colon_color at all.
      if (!settingsLinked) payload.colon_color = settingsColon;
      const res = await api.devices.setSettings(settingsTarget.id, payload);
      setSettingsFlash(res.delivered
        ? 'Sent to device.'
        : 'Saved — device is offline, will apply on next connect.');
      setTimeout(() => setSettingsTarget(null), 1100);
    } catch (e) {
      setSettingsFlash(e.response?.data?.error || 'Failed to save');
    } finally {
      setSettingsBusy(false);
    }
  };

  const deviceActions = (d) => (
    <div className="flex justify-end gap-1">
      <button
        className="icon-btn"
        title="Remote control (mirror the display)"
        onClick={() => setRemoteTarget(d)}
        disabled={!isOnline(d)}
      >
        <MonitorSmartphone className={`w-4 h-4 ${isOnline(d) ? '' : 'opacity-30'}`} />
      </button>
      <button className="icon-btn" title="Matrix colour & brightness" onClick={() => openSettings(d)}>
        <Palette className="w-4 h-4" />
      </button>
      <button className="icon-btn" title="Edit label" onClick={() => openEdit(d)}>
        <Pencil className="w-4 h-4" />
      </button>
      <button className="icon-btn-danger" title="Delete" onClick={() => setDeleteTarget(d)}>
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Devices</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Devices register automatically on first time log submission</p>
        </div>
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/60">
              <th className="th">Status</th>
              <th className="th">Hardware ID</th>
              <th className="th">Label</th>
              <th className="th">Last Seen</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="td text-center text-slate-500 py-10">Loading…</td></tr>
            ) : devices.length === 0 ? (
              <tr>
                <td colSpan={5} className="td text-center text-slate-500 py-10">
                  No devices yet. Devices appear here after the ESP32 sends its first time log.
                </td>
              </tr>
            ) : devices.map(d => {
              const online = isOnline(d);
              return (
                <tr key={d.id} className="tr">
                  <td className="td">
                    {online
                      ? <Wifi className="w-4 h-4 text-green-400" title="Online (seen < 5 min ago)" />
                      : <WifiOff className="w-4 h-4 text-slate-600" title="Offline" />}
                  </td>
                  <td className="td font-mono text-sm text-amber-400">{d.hardware_id}</td>
                  <td className="td text-sm text-slate-300">{d.label || <span className="text-slate-600 italic">no label</span>}</td>
                  <td className="td text-sm text-slate-500">
                    {d.last_seen ? new Date(d.last_seen).toLocaleString() : '–'}
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
          <p className="text-center text-slate-500 py-10">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-center text-slate-500 py-10">No devices yet.</p>
        ) : devices.map(d => {
          const online = isOnline(d);
          return (
            <div key={d.id} className="card p-3 sm:p-4">
              <div className="flex items-center gap-3 mb-2">
                {online
                  ? <Wifi className="w-5 h-5 text-green-400 flex-shrink-0" title="Online" />
                  : <WifiOff className="w-5 h-5 text-slate-600 flex-shrink-0" title="Offline" />}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-amber-400 truncate">{d.hardware_id}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {d.label || <span className="text-slate-600 italic">no label</span>}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-2">
                Last seen: {d.last_seen ? new Date(d.last_seen).toLocaleString() : '–'}
              </p>
              <div className="border-t border-slate-700/60 pt-2 -mb-1">
                {deviceActions(d)}
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit Device Label" size="sm">
        <form onSubmit={handleSaveLabel} className="space-y-4">
          <p className="text-xs text-slate-500 font-mono">{editTarget?.hardware_id}</p>
          <div>
            <label className="label">Label</label>
            <input
              className="input"
              type="text"
              placeholder="e.g. Room 3 – Station A"
              value={label}
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setEditTarget(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Save Label</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Device"
        message={`Remove device "${deleteTarget?.hardware_id}"? Time logs from this device are kept.`}
      />

      <Modal isOpen={!!settingsTarget} onClose={() => setSettingsTarget(null)} title="Matrix Settings" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 font-mono">
            {settingsTarget?.hardware_id}
          </p>

          <div>
            <p className="label mb-2">Clock colour</p>
            <ColorPicker value={settingsColor} onChange={setSettingsColor} />
          </div>

          <div>
            <label className="flex items-center justify-between gap-3 cursor-pointer select-none py-1">
              <span className="text-sm text-slate-300">
                Use same colour for the blinking dots
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
                <p className="label mb-2">Colon dot colour</p>
                <ColorPicker value={settingsColon} onChange={setSettingsColon} />
              </div>
            )}
          </div>

          <div>
            <p className="label mb-2">Brightness</p>
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
                        ? 'bg-amber-500 text-slate-900 border-amber-400'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                    }`}
                  >
                    {b.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1">Current: {settingsBright} / 255</p>
          </div>

          {settingsFlash && (
            <p className="text-xs text-emerald-400">{settingsFlash}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setSettingsTarget(null)}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              disabled={settingsBusy}
              onClick={handleSaveSettings}
            >
              {settingsBusy ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Remote Control — virtual screen mirror + touch injection */}
      <Modal
        isOpen={!!remoteTarget}
        onClose={() => setRemoteTarget(null)}
        title={`Remote — ${remoteTarget?.label || remoteTarget?.hardware_id || ''}`}
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
