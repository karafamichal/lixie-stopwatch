import { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import * as api from '../api';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmtHours(s) {
  const h = s / 3600;
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`;
}

function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

const PRESETS = [
  { label: 'Today',      days: 0 },
  { label: 'This week',  days: 6 },
  { label: 'Last 30d',   days: 29 },
  { label: 'Last 90d',   days: 89 },
];

// ── custom tooltips ────────────────────────────────────────────────────────────

function HoursTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color || '#f59e0b' }}>
          {fmtDuration(p.value)}
        </p>
      ))}
    </div>
  );
}

function EurosTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="text-amber-400 font-semibold">€{Number(p.value).toFixed(2)}</p>
      ))}
    </div>
  );
}

// ── section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function Reports() {
  const today = isoDate(new Date());
  const [from, setFrom] = useState(isoDate(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(today);
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState([]);

  const [daily, setDaily] = useState([]);
  const [byClient, setByClient] = useState([]);
  const [byProject, setByProject] = useState([]);
  const [byApp, setByApp] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.clients.list().then(setClients).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = { from, to };
    if (clientId) params.client_id = clientId;
    Promise.all([
      api.reports.daily(params),
      api.reports.byClient({ from, to }),
      api.reports.byProject(params),
      api.reports.byApp(params),
    ]).then(([d, c, p, a]) => {
      setDaily(d);
      setByClient(c);
      setByProject(p);
      setByApp(a);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [from, to, clientId]);

  useEffect(load, [load]);

  const applyPreset = (days) => {
    setTo(today);
    setFrom(isoDate(new Date(Date.now() - days * 86400000)));
  };

  const totalSeconds = daily.reduce((s, r) => s + r.seconds, 0);
  const totalEarnings = byProject.reduce((s, r) => s + (r.earnings || 0), 0);

  // fill gaps in daily data so the chart has a point for every day
  const filledDaily = (() => {
    const map = Object.fromEntries(daily.map(r => [r.date, r.seconds]));
    const out = [];
    const start = new Date(from);
    const end = new Date(to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = isoDate(d);
      out.push({ date: key.slice(5), seconds: map[key] || 0 });
    }
    return out;
  })();

  // projects with earnings > 0 for the earnings chart
  const earningProjects = byProject.filter(r => r.earnings > 0).slice(0, 15);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-100 mb-6">Reports</h1>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end mb-6">
        <div className="flex gap-1">
          {PRESETS.map(p => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-500/50 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="input w-36" value={from} max={to} onChange={e => setFrom(e.target.value)} />
          <span className="text-slate-600 text-sm">→</span>
          <input type="date" className="input w-36" value={to} min={from} max={today} onChange={e => setTo(e.target.value)} />
        </div>
        <select className="input w-44" value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {loading ? (
            <span className="text-slate-500">Loading…</span>
          ) : (
            <>
              <span className="text-slate-500">
                <span className="text-amber-400 font-semibold">{fmtDuration(totalSeconds)}</span> tracked
              </span>
              {totalEarnings > 0 && (
                <span className="text-slate-500">
                  <span className="text-green-400 font-semibold">€{totalEarnings.toFixed(2)}</span> earned
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Daily trend */}
        <Section title="Daily trend">
          {filledDaily.length === 0 ? (
            <p className="text-slate-500 text-sm py-10 text-center">No data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={filledDaily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={v => fmtHours(v)} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<HoursTooltip />} />
                <Area type="monotone" dataKey="seconds" stroke="#f59e0b" strokeWidth={2} fill="url(#grad)" dot={false} activeDot={{ r: 4, fill: '#f59e0b' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* By client — time */}
          <Section title="By client — time">
            {byClient.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(byClient.length * 42, 120)}>
                <BarChart data={byClient} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtHours(v)} tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#cbd5e1', fontSize: 12 }} tickLine={false} axisLine={false} width={90} />
                  <Tooltip content={<HoursTooltip />} cursor={{ fill: '#1e293b' }} />
                  <Bar dataKey="seconds" radius={[0, 4, 4, 0]} maxBarSize={24}>
                    {byClient.map((r, i) => (
                      <Cell key={i} fill={r.color || '#f59e0b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Section>

          {/* By app */}
          <Section title="By application">
            {byApp.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">No data.</p>
            ) : (
              <div className="flex gap-4 items-center">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie
                      data={byApp}
                      dataKey="seconds"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                    >
                      {byApp.map((r, i) => (
                        <Cell key={i} fill={r.color || '#f59e0b'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, n) => [fmtDuration(v), n]}
                      contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ display: 'none' }}
                      itemStyle={{ color: '#f1f5f9' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-1 text-sm overflow-y-auto max-h-44">
                  {byApp.slice(0, 10).map((r, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-base leading-none">{r.icon}</span>
                      <span className="text-slate-300 flex-1 truncate">{r.name}</span>
                      <span className="text-amber-400 font-mono text-xs">{fmtDuration(r.seconds)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        </div>

        {/* Earnings by project */}
        {earningProjects.length > 0 && (
          <Section title="Earnings by project (€)">
            <ResponsiveContainer width="100%" height={Math.max(earningProjects.length * 42, 120)}>
              <BarChart data={earningProjects} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={v => `€${v % 1 === 0 ? v : v.toFixed(0)}`}
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: '#cbd5e1', fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip content={<EurosTooltip />} cursor={{ fill: '#1e293b' }} />
                <Bar dataKey="earnings" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {earningProjects.map((r, i) => (
                    <Cell key={i} fill={r.completed ? '#34d399' : (r.color || '#f59e0b')} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-slate-600 mt-2">Green bars = completed projects. Only projects with at least one app hourly rate set are shown.</p>
          </Section>
        )}

        {/* By project table */}
        <Section title="By project">
          {byProject.length === 0 ? (
            <p className="text-slate-500 text-sm py-6 text-center">No data.</p>
          ) : (() => {
            const max = byProject[0]?.seconds || 1;
            return (
              <div className="space-y-2">
                {byProject.map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.color || '#f59e0b' }} />
                    <div className="w-28 text-xs text-slate-400 truncate flex-shrink-0">{r.client_name}</div>
                    <div className="flex-1 text-sm text-slate-200 truncate flex items-center gap-1.5">
                      {r.name}
                      {r.completed && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-xs bg-emerald-900/60 text-emerald-400 border border-emerald-700/40 flex-shrink-0">✓</span>
                      )}
                    </div>
                    <div className="w-32 bg-slate-800 rounded-full h-1.5 flex-shrink-0">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${(r.seconds / max) * 100}%`, backgroundColor: r.color || '#f59e0b' }}
                      />
                    </div>
                    <div className="w-14 text-right text-xs font-mono text-amber-400 flex-shrink-0">
                      {fmtDuration(r.seconds)}
                    </div>
                    {r.earnings > 0 ? (
                      <div className="w-20 text-right text-xs font-mono text-green-400 flex-shrink-0">
                        €{r.earnings.toFixed(2)}
                      </div>
                    ) : (
                      <div className="w-20 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </Section>
      </div>
    </div>
  );
}
