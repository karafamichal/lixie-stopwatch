import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import * as api from '../api';
import { t, fmtMoney, locale } from '../i18n';

function fmtHours(sec) {
  return (sec / 3600).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(locale(), { dateStyle: 'medium' }) : '–';
}

// Billing statement for one project — opened in its own tab from the
// billing dialog, laid out for A4 so "Print → Save as PDF" gives a clean file.
export default function Statement() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.projects.billing(id).then(setData).catch(() => setError(true));
  }, [id]);

  useEffect(() => {
    if (data) document.title = `${data.project_name} — ${t('Billing statement')}`;
  }, [data]);

  if (error) return <p className="p-8 text-red-400">{t('Failed to load billing data.')}</p>;
  if (!data) return <p className="p-8 text-slate-500">{t('Loading…')}</p>;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 print:p-0 print:max-w-none">
      <div className="flex justify-end mb-8 print:hidden">
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> {t('Print or save as PDF')}
        </button>
      </div>

      <header className="flex justify-between items-start gap-6 pb-6 border-b border-slate-600">
        <div>
          <p className="text-sm text-slate-400">{t('Billing statement')}</p>
          <h1 className="text-2xl font-semibold text-slate-100 mt-1">{data.project_name}</h1>
          <p className="text-slate-300">{data.client_name}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-digits text-xl font-semibold lixie-lit">Lixie StopWatch</p>
          <p className="text-slate-400 mt-1">{t('Issued {d}', { d: fmtDate(new Date().toISOString()) })}</p>
          <p className="text-slate-400">
            {t('Work period {a} – {b}', { a: fmtDate(data.first_log), b: fmtDate(data.last_log) })}
          </p>
        </div>
      </header>

      {data.breakdown.length === 0 ? (
        <p className="py-10 text-slate-500">{t('No time logs recorded for this project yet.')}</p>
      ) : (
        <table className="w-full text-sm mt-6">
          <thead>
            <tr className="border-b border-slate-600">
              <th className="text-left font-medium text-slate-400 py-2">{t('Application')}</th>
              <th className="text-right font-medium text-slate-400 py-2">{t('Hours')}</th>
              <th className="text-right font-medium text-slate-400 py-2">{t('Rate')}</th>
              <th className="text-right font-medium text-slate-400 py-2">{t('Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {data.breakdown.map((row, i) => (
              <tr key={i} className="border-b border-slate-700">
                <td className="py-2.5 text-slate-200">{row.app_name}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-300">{fmtHours(row.seconds)}</td>
                <td className="py-2.5 text-right tabular-nums text-slate-300">
                  {row.hourly_rate != null ? `${fmtMoney(row.hourly_rate)}/h` : '–'}
                </td>
                <td className="py-2.5 text-right tabular-nums text-slate-100">
                  {row.earnings > 0 ? fmtMoney(row.earnings) : '–'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-4 font-medium text-slate-100">{t('Total')}</td>
              <td className="pt-4 text-right tabular-nums font-medium text-slate-100">{fmtHours(data.total_seconds)}</td>
              <td />
              <td className="pt-4 text-right tabular-nums text-lg font-semibold text-slate-100">
                {fmtMoney(data.total_earnings)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      <p className="text-xs text-slate-500 mt-10">
        {t('Hours are tracked with the Lixie StopWatch and rounded to two decimals. Rows without an hourly rate are not charged.')}
      </p>
    </main>
  );
}
