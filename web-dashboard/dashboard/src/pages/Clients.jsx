import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronRight, ChevronDown, CheckCircle, ArrowRight } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ColorPicker from '../components/ColorPicker';
import ImageUpload from '../components/ImageUpload';
import { t } from '../i18n';

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
    } catch (err) { setError(err.response?.data?.error || t('Something went wrong')); }
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

  const renderProjectList = (c) => {
    const data = clientData[c.id];
    if (data?.loading) {
      return <p className="text-slate-500 text-sm px-4 sm:px-10 py-4">{t('Loading projects…')}</p>;
    }
    if (!data || data.projects.length === 0) {
      return <p className="text-slate-600 text-sm px-4 sm:px-10 py-4">{t('No projects for this client.')}</p>;
    }
    return (
      <div className="px-3 sm:px-6 py-3 space-y-1">
        {data.projects.map(p => {
          const b = data.billingMap[p.id];
          return (
            <div
              key={p.id}
              className="flex items-center gap-3 px-2 sm:px-3 py-2 rounded-lg hover:bg-slate-700/40 cursor-pointer group transition-colors"
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
                  <CheckCircle className="w-3 h-3" /> {t('Done')}
                </span>
              ) : (
                <span className={`flex-shrink-0 ${p.active ? 'badge-active' : 'badge-inactive'}`}>
                  {p.active ? t('Active') : t('Inactive')}
                </span>
              )}
              <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
            </div>
          );
        })}
        <div className="pt-1 pb-0.5">
          <button
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors px-2 sm:px-3"
            onClick={() => navigate(`/projects?client_id=${c.id}`)}
          >
            {t('View all projects →')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('Clients')}</h1>
        <button className="btn-primary w-full sm:w-auto" onClick={openCreate}>
          <Plus className="w-4 h-4" /> {t('Add Client')}
        </button>
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/60">
              <th className="p-0 w-[5px]" />
              <th className="th w-8" />
              <th className="th">{t('Name')}</th>
              <th className="th">{t('Status')}</th>
              <th className="th">{t('Created')}</th>
              <th className="th text-right">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="td text-center text-slate-500 py-10">{t('Loading…')}</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={6} className="td text-center text-slate-500 py-10">{t('No clients yet. Add one to get started.')}</td></tr>
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
                      {c.active ? t('Active') : t('Inactive')}
                    </span>
                  </td>
                  <td className="td text-sm text-slate-500">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="icon-btn" title={c.active ? t('Deactivate') : t('Activate')} onClick={() => toggleActive(c)}>
                        {c.active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button className="icon-btn" title={t('Edit')} onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></button>
                      <button className="icon-btn-danger" title={t('Delete')} onClick={() => setDeleteTarget(c)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>

                {expandedId === c.id && (
                  <tr key={`${c.id}-exp`}>
                    <td colSpan={6} className="p-0 bg-slate-900/60 border-t border-slate-700/50">
                      {renderProjectList(c)}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-slate-500 py-10">{t('Loading…')}</p>
        ) : clients.length === 0 ? (
          <p className="text-center text-slate-500 py-10">{t('No clients yet. Add one to get started.')}</p>
        ) : clients.map(c => (
          <div key={c.id} className="card overflow-hidden" style={{ borderLeftColor: c.color || '#FF8000', borderLeftWidth: 4 }}>
            <div className="p-3 sm:p-4 flex items-center gap-3" onClick={() => toggleExpand(c)}>
              <Avatar client={c} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-100 truncate">{c.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  <span className={c.active ? 'badge-active' : 'badge-inactive'}>
                    {c.active ? t('Active') : t('Inactive')}
                  </span>
                  <span className="ml-2">{new Date(c.created_at).toLocaleDateString()}</span>
                </p>
              </div>
              {expandedId === c.id
                ? <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                : <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />}
            </div>
            <div className="px-2 sm:px-3 pb-2 flex items-center justify-end gap-1 border-t border-slate-700/60 pt-2">
              <button className="icon-btn" title={c.active ? t('Deactivate') : t('Activate')} onClick={() => toggleActive(c)}>
                {c.active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
              </button>
              <button className="icon-btn" title={t('Edit')} onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></button>
              <button className="icon-btn-danger" title={t('Delete')} onClick={() => setDeleteTarget(c)}><Trash2 className="w-4 h-4" /></button>
            </div>
            {expandedId === c.id && (
              <div className="bg-slate-900/60 border-t border-slate-700/50">
                {renderProjectList(c)}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? t('Edit Client') : t('Add Client')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('Name')}</label>
            <input className="input" type="text" required placeholder={t('e.g. Acme Corp')}
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <label className="label">{t('Colour')}</label>
            <ColorPicker value={form.color} onChange={c => setForm(p => ({ ...p, color: c }))} />
          </div>
          <ImageUpload value={form.logo} onChange={v => setForm(p => ({ ...p, logo: v }))} />
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-amber-500" checked={form.active}
              onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
            <span className="text-sm text-slate-300">{t('Active')}</span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>{t('Cancel')}</button>
            <button type="submit" className="btn-primary">{editTarget ? t('Save Changes') : t('Add Client')}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={t('Delete Client')}
        message={t('Delete "{name}"? All associated projects and time logs will also be deleted.', { name: deleteTarget?.name })}
      />
    </div>
  );
}
