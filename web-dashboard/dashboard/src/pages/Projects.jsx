import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, CheckCircle, Receipt } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ColorPicker from '../components/ColorPicker';
import ImageUpload from '../components/ImageUpload';
import { t } from '../i18n';

const empty = { name: '', client_id: '', active: true, color: '#FF8000', logo: null };

function fmtDuration(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function Avatar({ project }) {
  if (project.logo) return <img src={project.logo} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />;
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ backgroundColor: project.color + '33', color: project.color }}>
      {project.name[0]?.toUpperCase()}
    </div>
  );
}

export default function Projects() {
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [filterClient, setFilterClient] = useState(searchParams.get('client_id') || '');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(empty);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  // billing / complete
  const [billingOpen, setBillingOpen] = useState(false);
  const [billingTarget, setBillingTarget] = useState(null);
  const [billingData, setBillingData] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => { api.clients.list().then(setClients).catch(() => {}); }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.projects.list(filterClient || undefined).then(setProjects).finally(() => setLoading(false));
  }, [filterClient]);

  useEffect(load, [load]);

  const openCreate = () => {
    setForm({ ...empty, client_id: filterClient || '' });
    setEditTarget(null); setError(''); setModalOpen(true);
  };
  const openEdit = (p) => {
    setForm({ name: p.name, client_id: String(p.client_id), active: p.active, color: p.color || '#FF8000', logo: p.logo || null });
    setEditTarget(p); setError(''); setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      if (editTarget) { await api.projects.update(editTarget.id, form); }
      else            { await api.projects.create(form); }
      setModalOpen(false); load();
    } catch (err) { setError(err.response?.data?.error || t('Something went wrong')); }
  };

  const handleDelete = async () => { await api.projects.remove(deleteTarget.id); setDeleteTarget(null); load(); };
  const toggleActive = async (p) => { await api.projects.update(p.id, { active: !p.active }); load(); };

  const openBilling = async (p) => {
    setBillingTarget(p);
    setBillingData(null);
    setBillingOpen(true);
    setBillingLoading(true);
    try {
      const data = await api.projects.billing(p.id);
      setBillingData(data);
    } catch {
      setBillingData({ error: true });
    } finally {
      setBillingLoading(false);
    }
  };

  const handleComplete = async () => {
    await api.projects.update(billingTarget.id, { completed: true });
    setBillingOpen(false);
    load();
  };

  const handleReopen = async (p) => {
    await api.projects.update(p.id, { completed: false, active: true });
    load();
  };

  const renderActions = (p) => (
    <div className="flex justify-end gap-1">
      {p.completed ? (
        <>
          <button className="icon-btn" title={t('View billing')} onClick={() => openBilling(p)}>
            <Receipt className="w-4 h-4 text-amber-400" />
          </button>
          <button
            className="icon-btn text-xs px-2 py-1 h-auto"
            title={t('Reopen project')}
            onClick={() => handleReopen(p)}
          >
            {t('Reopen')}
          </button>
        </>
      ) : (
        <>
          <button className="icon-btn" title={p.active ? t('Deactivate') : t('Activate')} onClick={() => toggleActive(p)}>
            {p.active ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5" />}
          </button>
          <button className="icon-btn" title={t('Mark as completed')} onClick={() => openBilling(p)}>
            <CheckCircle className="w-4 h-4" />
          </button>
        </>
      )}
      <button className="icon-btn" title={t('Edit')} onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></button>
      <button className="icon-btn-danger" title={t('Delete')} onClick={() => setDeleteTarget(p)}><Trash2 className="w-4 h-4" /></button>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('Projects')}</h1>
        <button className="btn-primary w-full sm:w-auto" onClick={openCreate}>
          <Plus className="w-4 h-4" /> {t('Add Project')}
        </button>
      </div>

      <div className="mb-4">
        <select className="input sm:w-52" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">{t('All Clients')}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-800/60">
              <th className="p-0 w-[5px]" />
              <th className="th">{t('Project')}</th>
              <th className="th">{t('Client')}</th>
              <th className="th">{t('Status')}</th>
              <th className="th">{t('Created')}</th>
              <th className="th text-right">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="td text-center text-slate-500 py-10">{t('Loading…')}</td></tr>
            ) : projects.length === 0 ? (
              <tr><td colSpan={7} className="td text-center text-slate-500 py-10">{t('No projects found.')}</td></tr>
            ) : projects.map(p => (
              <tr key={p.id} className={`tr ${p.completed ? 'opacity-60' : ''}`}>
                <td className="p-0" style={{ width: 5, backgroundColor: p.color || '#FF8000' }} />
                <td className="td">
                  <div className="flex items-center gap-3">
                    <Avatar project={p} />
                    <span className="font-medium text-slate-100">{p.name}</span>
                  </div>
                </td>
                <td className="td">
                  <div className="flex items-center gap-2">
                    {p.client_logo
                      ? <img src={p.client_logo} alt="" className="w-5 h-5 rounded object-cover" />
                      : <div className="w-5 h-5 rounded flex-shrink-0" style={{ backgroundColor: p.client_color || '#FF8000' }} />
                    }
                    <span className="text-sm text-slate-400">{p.client_name}</span>
                  </div>
                </td>
                <td className="td">
                  {p.completed ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/60 text-emerald-400 border border-emerald-700/40">
                      <CheckCircle className="w-3 h-3" /> {t('Completed')}
                    </span>
                  ) : (
                    <span className={p.active ? 'badge-active' : 'badge-inactive'}>
                      {p.active ? t('Active') : t('Inactive')}
                    </span>
                  )}
                </td>
                <td className="td text-sm text-slate-500">
                  {p.completed && p.completed_at
                    ? new Date(p.completed_at).toLocaleDateString()
                    : new Date(p.created_at).toLocaleDateString()}
                </td>
                <td className="td">{renderActions(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <p className="text-center text-slate-500 py-10">{t('Loading…')}</p>
        ) : projects.length === 0 ? (
          <p className="text-center text-slate-500 py-10">{t('No projects found.')}</p>
        ) : projects.map(p => (
          <div
            key={p.id}
            className={`card overflow-hidden ${p.completed ? 'opacity-60' : ''}`}
            style={{ borderLeftColor: p.color || '#FF8000', borderLeftWidth: 4 }}
          >
            <div className="p-3 sm:p-4 flex items-center gap-3">
              <Avatar project={p} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-100 truncate">{p.name}</p>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5 truncate">
                  {p.client_logo
                    ? <img src={p.client_logo} alt="" className="w-4 h-4 rounded object-cover flex-shrink-0" />
                    : <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: p.client_color || '#FF8000' }} />}
                  <span className="truncate">{p.client_name}</span>
                </div>
              </div>
              <div className="flex-shrink-0">
                {p.completed ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/60 text-emerald-400 border border-emerald-700/40">
                    <CheckCircle className="w-3 h-3" /> {t('Done')}
                  </span>
                ) : (
                  <span className={p.active ? 'badge-active' : 'badge-inactive'}>
                    {p.active ? t('Active') : t('Inactive')}
                  </span>
                )}
              </div>
            </div>
            <div className="px-2 sm:px-3 pb-2 border-t border-slate-700/60 pt-2">
              {renderActions(p)}
            </div>
          </div>
        ))}
      </div>

      {/* Edit / Create modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? t('Edit Project') : t('Add Project')} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">{t('Client')}</label>
            <select className="input" required value={form.client_id}
              onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}>
              <option value="">{t('Select a client…')}</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('Project Name')}</label>
            <input className="input" type="text" required placeholder={t('e.g. Website Redesign')}
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
            <span className="text-sm text-slate-300">{t('Active (visible on device)')}</span>
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>{t('Cancel')}</button>
            <button type="submit" className="btn-primary">{editTarget ? t('Save Changes') : t('Add Project')}</button>
          </div>
        </form>
      </Modal>

      {/* Billing summary modal */}
      <Modal
        isOpen={billingOpen}
        onClose={() => setBillingOpen(false)}
        title={billingTarget?.completed ? t('Billing — {name}', { name: billingTarget?.name }) : t('Complete Project — {name}', { name: billingTarget?.name })}
        size="lg"
      >
        {billingLoading ? (
          <p className="text-slate-400 text-sm py-6 text-center">{t('Calculating…')}</p>
        ) : billingData?.error ? (
          <p className="text-red-400 text-sm py-4">{t('Failed to load billing data.')}</p>
        ) : billingData ? (
          <div className="space-y-4">
            {billingData.breakdown.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">{t('No time logs recorded for this project yet.')}</p>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">{t('App')}</th>
                      <th className="text-right py-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">{t('Hours')}</th>
                      <th className="text-right py-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">{t('Rate')}</th>
                      <th className="text-right py-2 text-xs text-slate-400 font-semibold uppercase tracking-wider">{t('Earned')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingData.breakdown.map((row, i) => (
                      <tr key={i} className="border-b border-slate-700/50">
                        <td className="py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base leading-none">{row.app_icon}</span>
                            <span className="text-slate-200 truncate">{row.app_name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-400 whitespace-nowrap pl-2">
                          {fmtDuration(row.seconds)}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-500 whitespace-nowrap pl-2">
                          {row.hourly_rate != null ? `€${row.hourly_rate}/h` : '–'}
                        </td>
                        <td className="py-2.5 text-right font-mono text-amber-400 font-semibold whitespace-nowrap pl-2">
                          {row.earnings > 0 ? `€${row.earnings.toFixed(2)}` : '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-600 gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{t('Total time tracked')}</p>
                <p className="text-base sm:text-lg font-bold text-slate-200 font-mono">{fmtDuration(billingData.total_seconds)}</p>
              </div>
              <div className="text-right min-w-0">
                <p className="text-xs text-slate-500">{t('Total earnings')}</p>
                <p className="text-xl sm:text-2xl font-bold text-amber-400">€{billingData.total_earnings.toFixed(2)}</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setBillingOpen(false)}>
                {billingTarget?.completed ? t('Close') : t('Cancel')}
              </button>
              {!billingTarget?.completed && (
                <button type="button" className="btn-primary" onClick={handleComplete}>
                  <CheckCircle className="w-4 h-4" /> {t('Mark as Completed')}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={t('Delete Project')}
        message={t('Delete "{name}"? All associated time logs will also be deleted.', { name: deleteTarget?.name })}
      />
    </div>
  );
}
