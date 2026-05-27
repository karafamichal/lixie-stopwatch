import { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, Wifi, WifiOff } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';

function isOnline(lastSeen) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) < 5 * 60 * 1000;
}

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState(null);
  const [label, setLabel] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.devices.list()
      .then(setDevices)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

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

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Devices</h1>
        <p className="text-sm text-slate-500">Devices register automatically on first time log submission</p>
      </div>

      <div className="card overflow-hidden">
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
              const online = isOnline(d.last_seen);
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
                  <td className="td">
                    <div className="flex justify-end gap-1">
                      <button className="icon-btn" title="Edit label" onClick={() => openEdit(d)}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button className="icon-btn-danger" title="Delete" onClick={() => setDeleteTarget(d)}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
    </div>
  );
}
