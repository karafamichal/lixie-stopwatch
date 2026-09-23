import { useEffect, useState, useRef } from 'react';
import { Activity, Pause, Play, MousePointer2, Check } from 'lucide-react';
import { t } from '../i18n';
import LixieDigits from './LixieDigits';

const POMO_LABEL = {
  focus:      'Focus: {t} left',
  break:      'Break: {t} left',
  break_over: 'Break over, waiting to continue',
};

// HH:MM:SS — used for the big running counter on each card.
function fmtClock(s) {
  if (s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
}

const STATE_BADGE = {
  running:   { label: 'RUNNING',   bg: 'bg-emerald-500',  fg: 'text-emerald-950', Icon: Play          },
  paused:    { label: 'PAUSED',    bg: 'bg-yellow-500',   fg: 'text-yellow-950',  Icon: Pause         },
  selecting: { label: 'SELECTING', bg: 'bg-sky-500',      fg: 'text-sky-950',     Icon: MousePointer2 },
  confirm:   { label: 'CONFIRMING',bg: 'bg-orange-500',   fg: 'text-orange-950',  Icon: Check         },
};

function LiveCard({ state, now }) {
  // For RUNNING we drift the counter forward locally between server pushes
  // (the ESP32 pushes ~1×/s but we want the count to look continuous).
  let elapsed = state.elapsed_seconds || 0;
  if (state.state === 'running' && state.localReceivedAt) {
    elapsed += Math.floor((now - state.localReceivedAt) / 1000);
  }

  const badge = STATE_BADGE[state.state] || {
    label: state.state?.toUpperCase() || 'UNKNOWN',
    bg: 'bg-slate-600', fg: 'text-slate-200', Icon: Activity,
  };
  const Icon = badge.Icon;
  const accent = state.client_color || '#FF8000';

  return (
    <div
      className="border border-slate-700 rounded-md bg-slate-900 p-4 flex flex-col gap-2"
      style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-500 truncate">{state.hardware_id}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${badge.bg} ${badge.fg}`}>
          <Icon className="w-3 h-3" />
          {t(badge.label)}
        </span>
      </div>

      {state.client_name && (
        <div className="text-sm text-slate-200 truncate">
          <span className="text-slate-500 text-xs mr-1">{t('client:')}</span>
          {state.client_name}
        </div>
      )}
      {state.project_name && (
        <div className="text-sm text-slate-300 truncate">
          <span className="text-slate-500 text-xs mr-1">{t('project:')}</span>
          {state.project_name}
        </div>
      )}
      {state.app_name && (
        <div className="text-xs text-slate-400 truncate">
          <span className="text-slate-500 mr-1">{t('app:')}</span>
          {state.app_name}
        </div>
      )}

      {(state.state === 'running' || state.state === 'paused' || state.state === 'confirm') && (
        <LixieDigits value={fmtClock(elapsed)} dim={state.state !== 'running'} className="text-5xl mt-2" />
      )}
      {state.pomo_phase && POMO_LABEL[state.pomo_phase] && (
        <p className="text-xs text-slate-400">
          {t(POMO_LABEL[state.pomo_phase], { t: fmtClock(state.pomo_left || 0).slice(3) })}
        </p>
      )}
    </div>
  );
}

export default function LiveSessions() {
  const [devices, setDevices] = useState({});   // hardware_id -> last state
  const [now, setNow]         = useState(Date.now());
  const wsRef                 = useRef(null);

  // Local clock — drives the per-second drift of running counters.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // WebSocket subscription. Auto-reconnects on disconnect.
  useEffect(() => {
    let closed = false;
    let retryTimer = null;

    const open = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}/api/v1/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'device_state' && msg.hardware_id) {
            setDevices(d => ({
              ...d,
              [msg.hardware_id]: { ...msg, localReceivedAt: Date.now() },
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

    // Seed with the REST snapshot so we render immediately, before WS lands.
    fetch('/api/v1/live')
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        const seed = {};
        for (const r of rows) seed[r.hardware_id] = { ...r, localReceivedAt: Date.now() };
        setDevices(d => ({ ...seed, ...d }));
      })
      .catch(() => {});

    open();
    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Only surface interesting states. Idle / boot devices are noise here.
  const list = Object.values(devices).filter(
    d => d.state === 'running' || d.state === 'paused' ||
         d.state === 'selecting' || d.state === 'confirm'
  );

  if (list.length === 0) return null;

  // Running first, then paused, then everything else.
  const order = { running: 0, paused: 1, confirm: 2, selecting: 3 };
  list.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9));

  return (
    <div className="card p-4 sm:p-5 mb-5 md:mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="w-4 h-4 text-emerald-400" />
        <h2 className="section-title">{t('Live Sessions')}</h2>
        <span className="text-xs text-slate-500">{t('({n} active)', { n: list.length })}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {list.map(d => <LiveCard key={d.hardware_id} state={d} now={now} />)}
      </div>
    </div>
  );
}
