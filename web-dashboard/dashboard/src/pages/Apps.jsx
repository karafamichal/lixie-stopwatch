import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Lock } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import ColorPicker from '../components/ColorPicker';
import ImageUpload from '../components/ImageUpload';
import { t, fmtMoney, usePrefs } from '../i18n';

const CATEGORY_ORDER = [
  'Design', '3D / Video', 'Office', 'Development',
  'Communication', 'Productivity', 'Other',
];

const emptyForm = { name: '', category: 'Other', icon: '🖥️', color: '#FF8000', hourly_rate: '', logo: null };

export default function Apps() {
  const { currency } = usePrefs();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState('All');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.apps.listAll().then(setApps).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const categories = ['All', ...CATEGORY_ORDER.filter(c =>
    apps.some(a => a.category === c)
  ), ...apps
    .map(a => a.category)
    .filter(c => !CATEGORY_ORDER.includes(c) && c)
    .filter((c, i, arr) => arr.indexOf(c) === i)
  ];

  const visible = apps.filter(a => {
    if (filterCat !== 'All' && a.category !== filterCat) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group visible apps by category preserving order
  const grouped = visible.reduce((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});
  const sortedCats = [
    ...CATEGORY_ORDER.filter(c => grouped[c]),
    ...Object.keys(grouped).filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  const openCreate = () => { setForm(emptyForm); setEditTarget(null); setError(''); setModalOpen(true); };
  const openEdit = (a) => {
    setForm({ name: a.name, category: a.category, icon: a.icon, color: a.color, hourly_rate: a.hourly_rate != null ? String(a.hourly_rate) : '', logo: a.logo || null });
    setEditTarget(a);
    setError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editTarget) {
        await api.apps.update(editTarget.id, form);
      } else {
        await api.apps.create(form);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || t('Something went wrong'));
    }
  };

  const toggleActive = async (a) => {
    await api.apps.update(a.id, { active: !a.active });
    load();
  };

  const handleDelete = async () => {
    try {
      await api.apps.remove(deleteTarget.id);
    } catch (err) {
      setError(err.response?.data?.error || t('Cannot delete'));
    }
    setDeleteTarget(null);
    load();
  };

  const customCount = apps.filter(a => !a.is_builtin).length;
  const activeCount = apps.filter(a => a.active).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('Pricing')}</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {t('{a} active · {t} total · {c} custom', { a: activeCount, t: apps.length, c: customCount })}
          </p>
        </div>
        <button className="btn-primary w-full sm:w-auto" onClick={openCreate}>
          <Plus className="w-4 h-4" /> {t('Add Custom App')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 mb-5">
        <div className="flex gap-1 flex-wrap order-2 sm:order-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterCat === cat
                  ? 'bg-amber-500 text-onaccent'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700'
              }`}
            >
              {t(cat)}
            </button>
          ))}
        </div>
        <input
          className="input sm:w-44 sm:ml-auto order-1 sm:order-2"
          placeholder={t('Search apps…')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="text-center text-slate-500 py-16">{t('Loading…')}</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-slate-500 py-16">{t('No apps match your filter.')}</div>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          {sortedCats.map(cat => (
            <div key={cat} className="card overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-700/40 border-b border-slate-700">
                <span className="text-xs font-medium text-slate-400">{t(cat)}</span>
              </div>

              {/* Desktop: table */}
              <table className="hidden md:table w-full">
                <tbody>
                  {grouped[cat].map(a => (
                    <tr key={a.id} className={`tr ${!a.active ? 'opacity-40' : ''}`}>
                      <td className="p-0" style={{ width: 5, backgroundColor: a.color }} />
                      <td className="td w-12">
                        {a.logo
                          ? <img src={a.logo} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          : <span className="text-xl leading-none">{a.icon}</span>
                        }
                      </td>
                      <td className="td font-medium text-slate-100">{a.name}</td>
                      <td className="td">
                        {a.hourly_rate != null ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            {fmtMoney(a.hourly_rate)}/h
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600 italic">{t('no rate set')}</span>
                        )}
                      </td>
                      <td className="td">
                        {a.is_builtin && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-400">
                            <Lock className="w-2.5 h-2.5" /> {t('Built-in')}
                          </span>
                        )}
                      </td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            className="icon-btn"
                            title={a.active ? t('Deactivate') : t('Activate')}
                            onClick={() => toggleActive(a)}
                          >
                            {a.active
                              ? <ToggleRight className="w-5 h-5 text-green-400" />
                              : <ToggleLeft className="w-5 h-5" />}
                          </button>
                          <button className="icon-btn" title={t('Edit')} onClick={() => openEdit(a)}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!a.is_builtin && (
                            <button className="icon-btn-danger" title={t('Delete')} onClick={() => setDeleteTarget(a)}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile: stacked rows inside the category card */}
              <div className="md:hidden divide-y divide-slate-700/60">
                {grouped[cat].map(a => (
                  <div
                    key={a.id}
                    className={`px-3 py-3 flex items-center gap-3 ${!a.active ? 'opacity-40' : ''}`}
                    style={{ borderLeftColor: a.color, borderLeftWidth: 3 }}
                  >
                    {a.logo
                      ? <img src={a.logo} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                      : <span className="text-2xl leading-none flex-shrink-0 w-9 text-center">{a.icon}</span>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{a.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {a.hourly_rate != null ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            {fmtMoney(a.hourly_rate)}/h
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-600 italic">{t('no rate')}</span>
                        )}
                        {a.is_builtin && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-700 text-slate-400">
                            <Lock className="w-2.5 h-2.5" /> {t('Built-in')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-0.5 flex-shrink-0">
                      <button className="icon-btn" title={a.active ? t('Deactivate') : t('Activate')} onClick={() => toggleActive(a)}>
                        {a.active
                          ? <ToggleRight className="w-5 h-5 text-green-400" />
                          : <ToggleLeft className="w-5 h-5" />}
                      </button>
                      <button className="icon-btn" title={t('Edit')} onClick={() => openEdit(a)}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      {!a.is_builtin && (
                        <button className="icon-btn-danger" title={t('Delete')} onClick={() => setDeleteTarget(a)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editTarget?.is_builtin ? t('Edit Rate — {name}', { name: editTarget.name }) : editTarget ? t('Edit Custom App') : t('Add Custom App')}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editTarget?.is_builtin && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('App Name')}</label>
                  <input
                    className="input"
                    type="text"
                    required
                    placeholder={t('e.g. My Tool')}
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">{t('Category')}</label>
                  <input
                    className="input"
                    type="text"
                    required
                    placeholder={t('e.g. Design')}
                    list="cats"
                    value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                  />
                  <datalist id="cats">
                    {CATEGORY_ORDER.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="label">{t('Icon')} <span className="text-slate-500 font-normal">{t('(paste a single emoji)')}</span></label>
                <input
                  className="input w-24 text-2xl"
                  type="text"
                  value={form.icon}
                  maxLength={4}
                  onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                />
              </div>
            </>
          )}
          <div>
            <label className="label">{t('Hourly Rate')} <span className="text-slate-500 font-normal">{t('(optional, for billing)')}</span></label>
            <div className="relative w-36">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">{currency}</span>
              <input
                className="input pl-12"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.hourly_rate}
                onChange={e => setForm(p => ({ ...p, hourly_rate: e.target.value }))}
              />
            </div>
          </div>
          {!editTarget?.is_builtin && (
            <div>
              <label className="label">{t('Colour')}</label>
              <ColorPicker value={form.color} onChange={c => setForm(p => ({ ...p, color: c }))} />
            </div>
          )}
          <ImageUpload value={form.logo} onChange={v => setForm(p => ({ ...p, logo: v }))} label={t('Logo / picture (overrides emoji)')} />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>{t('Cancel')}</button>
            <button type="submit" className="btn-primary">
              {editTarget ? t('Save Changes') : t('Add App')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('Delete App')}
        message={t('Delete "{name}"? Time logs that used this app will keep the reference.', { name: deleteTarget?.name })}
      />
    </div>
  );
}
