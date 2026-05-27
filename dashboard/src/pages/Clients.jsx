import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronRight, ChevronDown, CheckCircle, ArrowRight } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ColorPicker from '../components/ColorPicker';
import ImageUpload from '../components/ImageUpload';

const empty = { name: '', active: true, color: '#FF8000', logo: null };

function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function Avatar({ client }) {
  if (client.logo) return <img src={client.logo} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />;
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ backgroundColor: client.color + '33', color: client.color }}>
      {client.name[0]?.toUpperCase()}
    </div>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(empty);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  // expandable rows
  const [expandedId, setExpandedId] = useState(null);
  const [clientData, setClientData] = useState({}); // { [clientId]: { projects, billingMap, loading } }

  const load = useCallback(() => {
    setLoading(true);
    api.clients.list().then(setClients).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const openCreate = () => { setForm(empty); setEditTarget(null); setError(''); setModalOpen(true); };
  const openEdit = (c) => {
    setForm({ name: c.name, active: c.active, color: c.color || '#FF8000', logo: c.logo || null });
    setEditTarget(c); setError(''); setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (editTarget) { await api.clients.update(editTarget.id, form); }
      else            { await api.clients.create(form); }
      setModalOpen(false); load();
    } catch (err) { setError(err.response?.data?.error || 'Something went wrong'); }
  };

  const handleDelete = async () => { await api.clients.remove(deleteTarget.id); setDeleteTarget(null); load(); };
  const toggleActive = async (c) => { await api.clients.update(c.id, { active: !c.active }); load(); };

  const toggleExpand = async (c) => {
    if (expandedId === c.id) { setExpandedId(null); return; }
    setExpandedId(c.id);
    if (clientData[c.id]) return; // already loaded

    setClientData(prev => ({ ...prev, [c.id]: { projects: [], billingMap: {}, loading: true } }));
    try {
      const [projs, billing] = await Promise.all([
        api.projects.list(c.id),
        api.reports.byProject({ client_id: c.id }),
      ]);
      const billingMap = Object.fromEntries(billing.map(b => [b.id, b]));
      setClientData(prev => ({ ...prev, [c.id]: { projects: projs, billingMap, loading: false } }));
    } catch {
      setClientData(prev => ({ ...prev, [c.id]: { projects: [], billingMap: {}, loading: false } }));
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Clients</h1>
        <button className="btn-primary" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add Client
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/60">
              <th className="p-0 w-[5px]" />
              <th className="th w-8" />
              <th className="th">Name</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
              <th className="th text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="td text-center text-slate-500 py-10">Loading…</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={6} className="td text-center text-slate-500 py-10">No clients yet. Add one to get started.</td></tr>
            ) : clients.map(c => (
              <>
                <tr key={c.id} className="tr">
                  <td className="p-0" style={{ width: 5, backgroundColor: c.color || '#FF8000' }} />
                  <td className="td w-8 cursor-pointer" onClick={() => toggleExpand(c)}>
                    {expandedId === c.id
                      ? <ChevronDown className="w-4 h-4 text-slate-400" />
                      : <ChevronRight className="w-4 h-4 text-slate-600 hover:text-slate-400 transition-colors" />}
                  </td>
                  <td className="td cursor-pointer" onClick={() => toggleExpand(c)}>
                    <div className="flex items-center gap-3">
                      <Avatar client={c} />
                      <span className="font-medium text-slate-100">{c.name}</span>
                    </div>
                  </td>
                  <td className="td">
                    <span className={c.active ? 'badge-active' : 'badge-inactive'}>
                      {c.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="td text-sm text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="icon-btn" title={c.active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(c)}>
                        {c.active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button className="icon-btn" title="Edit" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></button>
                      <button className="icon-btn-danger" title="Delete" onClick={() => setDeleteTarget(c)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>

                {expandedId === c.id && (
                  <tr key={`${c.id}-exp`}>
                    <td colSpan={6} className="p-0 bg-slate-900/60 border-t border-slate-700/50">
                      {clientData[c.id]?.loading ? (
                        <p className="text-slate-500 text-sm px-10 py-4">Loading projects…</p>
                      ) : clientData[c.id]?.projects.length === 0 ? (
                        <p className="text-slate-600 text-sm px-10 py-4">No projects for this client.</p>
                      ) : (
                        <div className="px-6 py-3 space-y-1">
                          {clientData[c.id].projects.map(p => {
                            const b = clientData[c.id].billingMap[p.id];
                            return (
                              <div
                                key={p.id}
                                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/40 cursor-pointer group transition-colors"
                                onClick={() => navigate(`/projects?client_id=${c.id}`)}
                              >
                                <div className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-200 truncate">{p.name}</p>
                                  <p className="text-xs text-slate-500">
                                    {b ? fmtDuration(b.seconds) : '–'}
                                    {b?.earnings > 0 && <span className="text-amber-400 ml-2">€{b.earnings.toFixed(2)}</span>}
                                  </p>
                                </div>
                                {p.completed ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/60 text-emerald-400 border border-emerald-700/40 flex-shrink-0">
                                    <CheckCircle className="w-3 h-3" /> Done
                                  </span>
                                ) : (
                                  <span className={`flex-shrink-0 ${p.active ? 'badge-active' : 'badge-inactive'}`}>
                                    {p.active ? 'Active' : 'Inactive'}
                                  </span>
                                )}
                                <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                              </div>
                            );
                          })}
                          <div className="pt-1 pb-0.5">
                            <button
                              className="text-xs text-amber-400 hover:text-amber-300 transition-colors px-3"
                              onClick={() => navigate(`/projects?client_id=${c.id}`)}
                            >
                              View all projects →
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Client' : 'Add Client'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" type="text" required placeholder="e.g. Acme Corp"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">Colour</label>
            <ColorPicker value={form.color} onChange={c => setForm(p => ({ ...p, color: c }))} />
          </div>
          <ImageUpload value={form.logo} onChange={v => setForm(p => ({ ...p, logo: v }))} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={form.active}
              onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
            <span className="text-sm text-slate-300">Active</span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary">{editTarget ? 'Save Changes' : 'Add Client'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Client"
        message={`Delete "${deleteTarget?.name}"? All associated projects and time logs will also be deleted.`}
      />
    </div>
  );
}
