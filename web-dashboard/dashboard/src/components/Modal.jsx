import { useEffect } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  const widths = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
  };

  return (
    <div
      // Phones: bottom sheet (items-end). sm+: centred dialog.
      className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={
          `card w-full ${widths[size]} shadow-2xl flex flex-col ` +
          // Phone: full-width sheet, rounded top corners only.
          `rounded-b-none rounded-t-2xl sm:rounded-xl ` +
          // Cap height so the inner area scrolls instead of the page.
          `max-h-[92vh] sm:max-h-[88vh]`
        }
      >
        <div className="flex justify-between items-center px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 rounded-md text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-colors"
            aria-label={t('Close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-4 sm:px-5 py-4 sm:py-5 overflow-y-auto pb-[max(env(safe-area-inset-bottom),1rem)]">
          {children}
        </div>
      </div>
    </div>
  );
}
