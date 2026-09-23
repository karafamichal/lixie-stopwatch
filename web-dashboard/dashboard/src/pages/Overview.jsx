import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, FolderKanban, Clock, Cpu, AppWindow, BarChart2,
  Plus,
} from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ColorPicker from '../components/ColorPicker';
import ImageUpload from '../components/ImageUpload';
import LiveSessions from '../components/LiveSessions';
import LixieDigits, { clockText } from '../components/LixieDigits';
import BudgetMeter, { budgetShare } from '../components/BudgetMeter';
import { t, usePrefs, locale } from '../i18n';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtSecs(s) {
  if (!s) return '0h';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtDateTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' });
}

function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

// ── last 7 days ───────────────────────────────────────────────────────────────

// The last seven calendar days (UTC, matching the server's grouping), oldest first.
function lastSevenDays() {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10));
}

// One bar per day; today's bar is lit like a Lixie digit, the rest stay unlit.
function WeekBars({ daily }) {
  const byDate = Object.fromEntries(daily.map(r => [r.date, r.seconds]));
  const days = lastSevenDays().map(date => ({ date, seconds: byDate[date] || 0 }));
  const max = Math.max(3600, ...days.map(d => d.seconds));
  const today = days[6].date;
  const total = days.reduce((sum, d) => sum + d.seconds, 0);
  return (
    <section className="card p-4 sm:p-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="section-title">{t('Last 7 days')}</h2>
        <span className="text-xs text-slate-500 tabular-nums">{fmtSecs(total)}</span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-2 sm:gap-4 flex-1 min-h-[13rem]">
        {days.map(d => {
          const isToday = d.date === today;
          const label = new Date(`${d.date}T12:00:00Z`).toLocaleDateString(locale(), { weekday: 'short' });
          return (
            <div key={d.date} className="flex flex-col items-center gap-2 min-w-0"
                 title={`${new Date(`${d.date}T12:00:00Z`).toLocaleDateString(locale(), { dateStyle: 'full' })}: ${fmtSecs(d.seconds)}`}>
              <span className={`text-xs tabular-nums ${isToday ? 'text-amber-400' : 'text-slate-400'}`}>
                {d.seconds ? fmtSecs(d.seconds) : '–'}
              </span>
              <div className="flex-1 w-full flex items-end">
                <div
                  className={`w-full rounded-sm ${isToday
                    ? 'bg-amber-500 shadow-[0_0_14px_rgb(var(--glow)/0.45)]'
                    : 'bg-slate-600'}`}
                  style={{ height: `${d.seconds ? Math.max((d.seconds / max) * 100, 3) : 1}%` }}
                />
              </div>
              <span className={`text-xs ${isToday ? 'text-slate-100 font-medium' : 'text-slate-500'}`}>{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── shortcut card ─────────────────────────────────────────────────────────────

function ShortcutCard({ to, icon: Icon, label, count }) {
  return (
    <Link
      to={to}
      className="px-4 py-3.5 flex items-center gap-3 hover:bg-slate-700/40 transition-colors"
    >
      <Icon className="w-4 h-4 text-slate-500 flex-shrink-0" />
      <span className="flex-1 text-sm text-slate-300">{label}</span>
      {count != null && <span className="font-digits text-xl text-slate-100 tabular-nums">{count}</span>}
    </Link>
  );
}

// ── empty-client + empty-project forms on the hero ────────────────────────────

const emptyClient  = { name: '', color: '#FF8000', logo: null, active: true };
const emptyProject = { name: '', color: '#FF8000', logo: null, active: true, client_id: '', new_client_name: '', new_client_color: '#FF8000' };

export default function Homepage() {
  const { showLive } = usePrefs();
  const [st, setSt] = useState(null);
  const [logs, setLogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [daily, setDaily] = useState([]);

  // quick-create modals
  const [clientModal, setClientModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [clientMode, setClientMode] = useState('existing'); // 'existing' | 'new'
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.stats.get().then(setSt).catch(() => {});
    api.timelogs.list({}).then(d => setLogs(d.slice(0, 10))).catch(() => {});
    api.clients.list().then(setClients).catch(() => {});
    api.projects.list().then(setProjects).catch(() => {});
    const days = lastSevenDays();
    api.reports.daily({ from: days[0], to: days[6] }).then(setDaily).catch(() => {});
  }, []);

  // Open projects that have used 80 % or more of their hour budget.
  const tightBudgets = projects
    .filter(p => !p.completed && budgetShare(p) >= 0.8)
    .sort((a, b) => budgetShare(b) - budgetShare(a));

  useEffect(load, [load]);

  // ── quick create client ───────────────────────────────────────────────────

  const openClientModal = () => { setClientForm(emptyClient); setError(''); setClientModal(true); };

  const submitClient = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.clients.create(clientForm);
      setClientModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || t('Something went wrong'));
    }
  };

  // ── quick create project ──────────────────────────────────────────────────

  const openProjectModal = () => {
    setProjectForm(emptyProject);
    setClientMode('existing');
    setError('');
    setProjectModal(true);
  };

  const submitProject = async (e) => {
    e.preventDefault();
    setError('');
    try {
      let client_id = projectForm.client_id;
      if (clientMode === 'new') {
        if (!projectForm.new_client_name.trim()) { setError(t('Client name is required')); return; }
        const c = await api.clients.create({ name: projectForm.new_client_name.trim(), color: projectForm.new_client_color });
        client_id = c.id;
      }
      if (!client_id) { setError(t('Select or create a client')); return; }
      await api.projects.create({ name: projectForm.name, client_id, color: projectForm.color, logo: projectForm.logo, active: projectForm.active });
      setProjectModal(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || t('Something went wrong'));
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* ── hero: this week's time in lit Lixie digits ─────────────────── */}
      <section className="card p-5 sm:p-7 mb-5 md:mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <p className="text-sm text-slate-400">{t('Tracked this week')}</p>
            <LixieDigits
              value={clockText(st?.week_seconds)}
              className="text-7xl sm:text-8xl md:text-[7.5rem] mt-3"
            />
            <p className="text-sm text-slate-400 mt-4">
              {t('{d} this month', { d: fmtSecs(st?.month_seconds) })}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={openClientModal} className="btn-secondary">
              <Plus className="w-4 h-4" /> {t('New Client')}
            </button>
            <button onClick={openProjectModal} className="btn-primary">
              <Plus className="w-4 h-4" /> {t('New Project')}
            </button>
          </div>
        </div>
      </section>

      {/* ── live sessions (only renders when something is happening) ──────── */}
      {showLive && <LiveSessions />}

      <div className="grid lg:grid-cols-[1fr_18rem] gap-5 md:gap-6 mb-5 md:mb-6">
        <WeekBars daily={daily} />

        {/* ── shortcuts ───────────────────────────────────────────────────── */}
        <nav className="card divide-y divide-slate-700 overflow-hidden" aria-label={t('Sections')}>
          <ShortcutCard to="/clients"  icon={Users}        label={t('Clients')}   count={st?.clients} />
          <ShortcutCard to="/projects" icon={FolderKanban} label={t('Projects')}  count={st?.projects} />
          <ShortcutCard to="/apps"     icon={AppWindow}    label={t('Pricing')}   count={st?.apps} />
          <ShortcutCard to="/timelogs" icon={Clock}        label={t('Time Logs')} count={st?.timelogs} />
          <ShortcutCard to="/devices"  icon={Cpu}          label={t('Devices')}   count={st?.devices} />
          <ShortcutCard to="/reports"  icon={BarChart2}    label={t('Reports')} />
        </nav>
      </div>

      {/* ── budgets running out ─────────────────────────────────────────── */}
      {tightBudgets.length > 0 && (
        <section className="card mb-5 md:mb-6">
          <h2 className="section-title px-4 sm:px-5 pt-4">{t('Budgets running out')}</h2>
          <ul className="divide-y divide-slate-700">
            {tightBudgets.slice(0, 5).map(p => (
              <li key={p.id} className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 truncate">{p.client_name}</p>
                </div>
                <div className="sm:w-56"><BudgetMeter project={p} /></div>
              </li>
            ))}
          </ul>
          <Link to="/projects" className="block px-4 sm:px-5 py-3 text-xs text-amber-400 hover:text-amber-300 border-t border-slate-700">
            {t('All projects')}
          </Link>
        </section>
      )}

      {/* ── recent logs ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-300">{t('Recent Time Logs')}</h2>
          <Link to="/timelogs" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">{t('View all')}</Link>
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-800/60">
                <th className="th">{t('Device')}</th>
                <th className="th">{t('Client')}</th>
                <th className="th">{t('Project')}</th>
                <th className="th">{t('App')}</th>
                <th className="th">{t('Duration')}</th>
                <th className="th">{t('Started')}</th>
                <th className="th">{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} className="td text-center text-slate-500 py-10">{t('No time logs yet')}</td></tr>
              ) : logs.map(l => (
                <tr key={l.id} className="tr">
                  <td className="td text-sm text-slate-400">{l.device_label || l.hardware_id || '–'}</td>
                  <td className="td text-sm text-slate-200">{l.client_name}</td>
                  <td className="td text-sm text-slate-400">{l.project_name}</td>
                  <td className="td text-sm text-slate-400">
                    {l.app_icon && <span className="mr-1">{l.app_icon}</span>}
                    {l.app_name || <span className="text-slate-600">–</span>}
                  </td>
                  <td className="td text-sm tabular-nums text-amber-400">{fmtDuration(l.duration_seconds)}</td>
                  <td className="td text-sm text-slate-500">{fmtDateTime(l.start_timestamp)}</td>
                  <td className="td">
                    <span className={l.status === 'completed' ? 'badge-completed' : 'badge-pending'}>{t(l.status)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: stacked cards */}
        <div className="md:hidden divide-y divide-slate-700">
          {logs.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{t('No time logs yet')}</p>
          ) : logs.map(l => (
            <div key={l.id} className="px-4 py-3 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-200 truncate">{l.client_name}</span>
                <span className="text-sm tabular-nums text-amber-400 flex-shrink-0">{fmtDuration(l.duration_seconds)}</span>
              </div>
              <div className="text-xs text-slate-400 truncate">{l.project_name}</div>
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="truncate">
                  {l.app_icon && <span className="mr-1">{l.app_icon}</span>}
                  {l.app_name || '—'} · {fmtDateTime(l.start_timestamp)}
                </span>
                <span className={l.status === 'completed' ? 'badge-completed' : 'badge-pending'}>{t(l.status)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── quick create client modal ─────────────────────────────────────── */}
      <Modal isOpen={clientModal} onClose={() => setClientModal(false)} title={t('New Client')} size="lg">
        <form onSubmit={submitClient} className="space-y-4">
          <div>
            <label className="label">{t('Name')}</label>
            <input className="input" type="text" required placeholder={t('e.g. Acme Corp')}
              value={clientForm.name} onChange={e => setClientForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('Colour')}</label>
            <ColorPicker value={clientForm.color} onChange={c => setClientForm(p => ({ ...p, color: c }))} />
          </div>
          <ImageUpload value={clientForm.logo} onChange={v => setClientForm(p => ({ ...p, logo: v }))} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setClientModal(false)}>{t('Cancel')}</button>
            <button type="submit" className="btn-primary">{t('Add Client')}</button>
          </div>
        </form>
      </Modal>

      {/* ── quick create project modal ────────────────────────────────────── */}
      <Modal isOpen={projectModal} onClose={() => setProjectModal(false)} title={t('New Project')} size="xl">
        <form onSubmit={submitProject} className="space-y-4">
          {/* client selection */}
          <div>
            <div className="flex items-center gap-3 mb-2">
              <label className="label mb-0">{t('Client')}</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-600 text-xs">
                {['existing', 'new'].map(m => (
                  <button key={m} type="button"
                    onClick={() => setClientMode(m)}
                    className={`px-3 py-1 font-medium transition-colors ${clientMode === m ? 'bg-amber-500 text-onaccent' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {m === 'existing' ? t('Select existing') : t('+ Create new')}
                  </button>
                ))}
              </div>
            </div>
            {clientMode === 'existing' ? (
              <select className="input" value={projectForm.client_id}
                onChange={e => setProjectForm(p => ({ ...p, client_id: e.target.value }))}>
                <option value="">{t('Select a client…')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            ) : (
              <div className="space-y-3 p-3 bg-slate-700/40 rounded-lg border border-slate-700">
                <input className="input" type="text" placeholder={t('New client name')}
                  value={projectForm.new_client_name}
                  onChange={e => setProjectForm(p => ({ ...p, new_client_name: e.target.value }))} />
                <div>
                  <label className="label text-xs">{t('Client colour')}</label>
                  <ColorPicker value={projectForm.new_client_color}
                    onChange={c => setProjectForm(p => ({ ...p, new_client_color: c }))} />
                </div>
              </div>
            )}
          </div>

          {/* project fields */}
          <div>
            <label className="label">{t('Project Name')}</label>
            <input className="input" type="text" required placeholder={t('e.g. Website Redesign')}
              value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('Colour')}</label>
            <ColorPicker value={projectForm.color} onChange={c => setProjectForm(p => ({ ...p, color: c }))} />
          </div>
          <ImageUpload value={projectForm.logo} onChange={v => setProjectForm(p => ({ ...p, logo: v }))} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={projectForm.active}
              onChange={e => setProjectForm(p => ({ ...p, active: e.target.checked }))} />
            <span className="text-sm text-slate-300">{t('Active (visible on device)')}</span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setProjectModal(false)}>{t('Cancel')}</button>
            <button type="submit" className="btn-primary">{t('Create Project')}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
