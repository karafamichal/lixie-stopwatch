import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, FolderKanban, Clock, Cpu, AppWindow, BarChart2,
  Plus, ArrowRight,
} from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ColorPicker from '../components/ColorPicker';
import ImageUpload from '../components/ImageUpload';
import LiveSessions from '../components/LiveSessions';
import { t, usePrefs } from '../i18n';

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
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

// ── shortcut card ─────────────────────────────────────────────────────────────

function ShortcutCard({ to, icon: Icon, label, count, color }) {
  return (
    <Link
      to={to}
      className="card p-5 flex items-center gap-4 hover:border-slate-600 hover:bg-slate-700/60 transition-all group"
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '22' }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xl font-bold text-slate-100">{count ?? '–'}</p>
        <p className="text-sm text-slate-400">{label}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors flex-shrink-0" />
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
  }, []);

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
      {/* ── hero ─────────────────────────────────────────────────────────── */}
      <div className="lixie-hero rounded-2xl p-5 sm:p-6 md:p-8 mb-5 md:mb-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl md:text-4xl drop-shadow">⏱</span>
            <div>
              <p className="text-xl md:text-2xl font-bold text-white tracking-wide uppercase leading-tight drop-shadow">Lixie StopWatch</p>
              <p className="text-amber-200/70 text-xs md:text-sm tracking-widest uppercase">{t('Time Tracking Dashboard')}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-5 md:mt-6">
            <button
              onClick={openClientModal}
              className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 border border-white/20 text-white text-sm font-semibold px-4 py-2.5 rounded-lg backdrop-blur-sm transition-all"
            >
              <Plus className="w-4 h-4" /> {t('New Client')}
            </button>
            <button
              onClick={openProjectModal}
              className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-semibold px-4 py-2.5 rounded-lg transition-all"
            >
              <Plus className="w-4 h-4" /> {t('New Project')}
            </button>
          </div>
        </div>

        {/* decorative glow blobs */}
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-amber-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-4 w-36 h-36 rounded-full bg-orange-600/20 blur-2xl pointer-events-none" />
      </div>

      {/* ── live sessions (only renders when something is happening) ──────── */}
      {showLive && <LiveSessions />}

      {/* ── time summaries ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-5 md:mb-6">
        {[
          { label: t('This week'), value: fmtSecs(st?.week_seconds), sub: t('{n} hours tracked', { n: st?.week_seconds ? (st.week_seconds / 3600).toFixed(1) : 0 }) },
          { label: t('This month'), value: fmtSecs(st?.month_seconds), sub: t('{n} hours tracked', { n: st?.month_seconds ? (st.month_seconds / 3600).toFixed(1) : 0 }) },
        ].map(({ label, value, sub }) => (
          <div key={label} className="card p-4 md:p-5">
            <p className="text-xl md:text-2xl font-bold text-amber-400">{value}</p>
            <p className="text-sm text-slate-300 mt-0.5">{label}</p>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── shortcuts grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6 md:mb-8">
        <ShortcutCard to="/clients"  icon={Users}        label={t('Clients')}   count={st?.clients}   color="#f59e0b" />
        <ShortcutCard to="/projects" icon={FolderKanban} label={t('Projects')}  count={st?.projects}  color="#60a5fa" />
        <ShortcutCard to="/apps"     icon={AppWindow}    label={t('Pricing')}   count={st?.apps}      color="#a78bfa" />
        <ShortcutCard to="/timelogs" icon={Clock}        label={t('Time Logs')} count={st?.timelogs}  color="#34d399" />
        <ShortcutCard to="/devices"  icon={Cpu}          label={t('Devices')}   count={st?.devices}   color="#67e8f9" />
        <ShortcutCard to="/reports"  icon={BarChart2}    label={t('Reports')}   count="→"            color="#fb923c" />
      </div>

      {/* ── recent logs ───────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-300">{t('Recent Time Logs')}</h2>
          <Link to="/timelogs" className="text-xs text-amber-400 hover:text-amber-300 transition-colors">{t('View all →')}</Link>
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
                  <td className="td text-sm font-mono text-amber-400">{fmtDuration(l.duration_seconds)}</td>
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
                <span className="text-sm font-mono text-amber-400 flex-shrink-0">{fmtDuration(l.duration_seconds)}</span>
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
                    className={`px-3 py-1 font-medium transition-colors ${clientMode === m ? 'bg-amber-500 text-slate-900' : 'text-slate-400 hover:text-slate-200'}`}
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
