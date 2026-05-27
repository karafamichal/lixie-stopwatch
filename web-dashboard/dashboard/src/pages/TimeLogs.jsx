import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

function fmtDateTime(iso) {
  if (!iso) return '–';
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function secsToHMS(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(sec)}`;
}

function hmsToSecs(str) {
  if (!str) return null;
  const parts = str.trim().split(':').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [h, m, s] = parts;
  if (m > 59 || s > 59) return null;
  return h * 3600 + m * 60 + s;
}

function toLocalIso(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = {
  client_id: '', project_id: '', app_id: '',
  start_timestamp: '', end_timestamp: '',
  duration_hms: '',
  time_mode: 'end',
  notes: '', status: 'completed',
};

export default function TimeLogs() {
  const [logs, setLogs] = useState([]);
  const [clients, setClients] = useState([]);
  const [allApps, setAllApps] = useState([]);
  const [filterProjects, setFilterProjects] = useState([]);
  const [formProjects, setFormProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ client_id: '', project_id: '', app_id: '', from: '', to: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.clients.list().then(setClients).catch(() => {});
    api.apps.list().then(setAllApps).catch(() => {});
  }, []);

  useEffect(() => {
    api.projects.list(filters.client_id || undefined).then(setFilterProjects).catch(() => {});
  }, [filters.client_id]);

  useEffect(() => {
    if (!form.client_id) { setFormProjects([]); return; }
    api.projects.list(form.client_id).then(setFormProjects).catch(() => {});
  }, [form.client_id]);

  const load = useCallback(() => {
    setLoading(true);
    const params = {};
    if (filters.client_id) params.client_id = filters.client_id;
    if (filters.project_id) params.project_id = filters.project_id;
    if (filters.app_id) params.app_id = filters.app_id;
    if (filters.from) params.from = filters.from;
    if (filters.to) params.to = filters.to;
    api.timelogs.list(params).then(setLogs).finally(() => setLoading(false));
  }, [filters]);

  useEffect(load, [load]);

  const openCreate = () => {
    const now = toLocalIso(new Date().toISOString());
    setForm({ ...emptyForm, start_timestamp: now });
    setEditTarget(null);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (l) => {
    const startIso = toLocalIso(l.start_timestamp);
    const endDate = new Date(new Date(l.start_timestamp).getTime() + l.duration_seconds * 1000);
    setForm({
      client_id: String(l.client_id),
      project_id: String(l.project_id),
      app_id: l.app_id ? String(l.app_id) : '',
      start_timestamp: startIso,
      end_timestamp: toLocalIso(endDate.toISOString()),
      duration_hms: secsToHMS(l.duration_seconds),
      time_mode: 'end',
      notes: l.notes || '',
      status: l.status,
    });
    setEditTarget(l);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    let duration_seconds;
    if (form.time_mode === 'end') {
      if (!form.end_timestamp) { setError('End time is required'); return; }
      const start = new Date(form.start_timestamp);
      const end = new Date(form.end_timestamp);
      if (end <= start) { setError('End time must be after start time'); return; }
      duration_seconds = Math.round((end - start) / 1000);
    } else {
      const secs = hmsToSecs(form.duration_hms);
      if (!secs) { setError('Duration must be in HH:MM:SS format (e.g. 01:30:00)'); return; }
      if (secs <= 0) { setError('Duration must be greater than zero'); return; }
      duration_seconds = secs;
    }

    const payload = {
      client_id: parseInt(form.client_id),
      project_id: parseInt(form.project_id),
      app_id: form.app_id ? parseInt(form.app_id) : null,
      start_timestamp: new Date(form.start_timestamp).toISOString(),
      duration_seconds,
      notes: form.notes || null,
      status: form.status,
    };
    try {
      if (editTarget) {
        await api.timelogs.update(editTarget.id, payload);
      } else {
        await api.timelogs.create(payload);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
  };

  const handleDelete = async () => {
    await api.timelogs.remove(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const setFilter = (key, value) => {
    setFilters(f => {
      const next = { ...f, [key]: value };
      if (key === 'client_id') next.project_id = '';
      return next;
    });
  };

  // Computed duration hint for 'end' mode
  const computedDuration = (() => {
    if (form.time_mode !== 'end' || !form.start_timestamp || !form.end_timestamp) return null;
    const diff = Math.round((new Date(form.end_timestamp) - new Date(form.start_timestamp)) / 1000);
    return diff > 0 ? diff : null;
  })();

  // Computed end hint for 'duration' mode
  const computedEnd = (() => {
    if (form.time_mode !== 'duration' || !form.start_timestamp || !form.duration_hms) return null;
    const secs = hmsToSecs(form.duration_hms);
    if (!secs || secs <= 0) return null;
    const d = new Date(new Date(form.start_timestamp).getTime() + secs * 1000);
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  })();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Time Logs</h1>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add Entry
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select className="input w-40" value={filters.client_id} onChange={e => setFilter('client_id', e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-44" value={filters.project_id} onChange={e => setFilter('project_id', e.target.value)} disabled={!filters.client_id}>
          <option value="">All Projects</option>
          {filterProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input w-44" value={filters.app_id} onChange={e => setFilter('app_id', e.target.value)}>
          <option value="">All Apps</option>
          {allApps.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
        </select>
        <input type="date" className="input w-36" value={filters.from} onChange={e => setFilter('from', e.target.value)} title="From date" />
        <input type="date" className="input w-36" value={filters.to} onChange={e => setFilter('to', e.target.value)} title="To date" />
        <button className="btn-ghost text-xs" onClick={() => setFilters({ client_id: '', project_id: '', app_id: '', from: '', to: '' })}>
          Clear
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/60">
              <th className="th">Device</th>
              <th className="th">Client</th>
              <th className="th">Project</th>
              <th className="th">App</th>
              <th className="th">Started</th>
              <th className="th">Duration</th>
              <th className="th">Notes</th>
              <th className="th">Status</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="td text-center text-slate-500 py-10">Loading…</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={9} className="td text-center text-slate-500 py-10">No time logs found.</td></tr>
            ) : logs.map(l => (
              <tr key={l.id} className="tr">
                <td className="td text-sm text-slate-400">{l.device_label || l.hardware_id || '–'}</td>
                <td className="td text-sm text-slate-200">{l.client_name}</td>
                <td className="td text-sm text-slate-400">{l.project_name}</td>
                <td className="td text-sm text-slate-400">
                  {l.app_icon
                    ? <span title={l.app_name}>{l.app_icon} {l.app_name}</span>
                    : <span className="text-slate-600">–</span>}
                </td>
                <td className="td text-sm text-slate-400">{fmtDateTime(l.start_timestamp)}</td>
                <td className="td text-sm font-mono text-amber-400">{fmtDuration(l.duration_seconds)}</td>
                <td className="td text-sm text-slate-500 max-w-[160px] truncate" title={l.notes}>{l.notes || ''}</td>
                <td className="td">
                  <span className={l.status === 'completed' ? 'badge-completed' : 'badge-pending'}>
                    {l.status}
                  </span>
                </td>
                <td className="td">
                  <div className="flex justify-end gap-1">
                    <button className="icon-btn" title="Edit" onClick={() => openEdit(l)}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button className="icon-btn-danger" title="Delete" onClick={() => setDeleteTarget(l)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Time Log' : 'Add Time Log'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client</label>
              <select
                className="input" required value={form.client_id}
                onChange={e => setForm(p => ({ ...p, client_id: e.target.value, project_id: '' }))}
              >
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Project</label>
              <select
                className="input" required value={form.project_id}
                disabled={!form.client_id}
                onChange={e => setForm(p => ({ ...p, project_id: e.target.value }))}
              >
                <option value="">Select project…</option>
                {formProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Application <span className="text-slate-500 font-normal">(optional)</span></label>
            <select
              className="input"
              value={form.app_id}
              onChange={e => setForm(p => ({ ...p, app_id: e.target.value }))}
            >
              <option value="">— none —</option>
              {allApps.map(a => <option key={a.id} value={a.id}>{a.icon} {a.name} ({a.category})</option>)}
            </select>
          </div>

          {/* Time entry — toggle between end-time and duration */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <label className="label mb-0">Time</label>
              <div className="flex rounded-lg overflow-hidden border border-slate-600 text-xs">
                {[
                  { key: 'end',      label: 'Start + End time' },
                  { key: 'duration', label: 'Start + Duration' },
                ].map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, time_mode: m.key }))}
                    className={`px-3 py-1.5 font-medium transition-colors ${
                      form.time_mode === m.key
                        ? 'bg-amber-500 text-slate-900'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Start time</label>
                <input
                  className="input" type="datetime-local" required
                  value={form.start_timestamp}
                  onChange={e => setForm(p => ({ ...p, start_timestamp: e.target.value }))}
                />
              </div>

              {form.time_mode === 'end' ? (
                <div>
                  <label className="label">End time</label>
                  <input
                    className="input" type="datetime-local" required
                    value={form.end_timestamp}
                    min={form.start_timestamp || undefined}
                    onChange={e => setForm(p => ({ ...p, end_timestamp: e.target.value }))}
                  />
                  {computedDuration && (
                    <p className="text-xs text-amber-400/80 mt-1">→ {fmtDuration(computedDuration)}</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="label">Duration <span className="text-slate-500 font-normal">(HH:MM:SS)</span></label>
                  <input
                    className="input font-mono tracking-widest" type="text"
                    placeholder="01:30:00"
                    maxLength={8}
                    value={form.duration_hms}
                    onChange={e => setForm(p => ({ ...p, duration_hms: e.target.value }))}
                  />
                  {computedEnd && (
                    <p className="text-xs text-amber-400/80 mt-1">→ ends {computedEnd}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="label">Notes <span className="text-slate-500 font-normal">(optional)</span></label>
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="What was worked on…"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
              <option value="completed">completed</option>
              <option value="pending">pending</option>
              <option value="synced">synced</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">{editTarget ? 'Save Changes' : 'Add Entry'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Time Log"
        message="Delete this time log entry? This cannot be undone."
      />
    </div>
  );
}
