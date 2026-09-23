import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';
import { t } from '../i18n';

export default function ConfirmDialog({ isOpen, onClose, onConfirm, title, message }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="flex gap-3 mb-5">
        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-300">{message}</p>
      </div>
      <div className="flex justify-end gap-3">
        <button className="btn-ghost" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn-danger" onClick={onConfirm}>{t('Delete')}</button>
      </div>
    </Modal>
  );
}
