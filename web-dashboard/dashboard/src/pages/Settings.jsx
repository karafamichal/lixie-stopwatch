import { LANGUAGES, setPref, usePrefs, t } from '../i18n';
import { nav } from '../components/Layout';

function Choice({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
            value === o.value
              ? 'bg-amber-500 text-slate-900 border-amber-400'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function Settings() {
  const prefs = usePrefs();

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('Settings')}</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{t('Dashboard preferences are stored in this browser.')}</p>
        </div>
      </div>

      <div className="card p-4 sm:p-5 space-y-6 max-w-xl">
        <div>
          <p className="label mb-2">{t('Dashboard language')}</p>
          <Choice
            options={LANGUAGES.map(l => ({ value: l.code, label: l.label }))}
            value={prefs.lang}
            onChange={v => setPref('lang', v)}
          />
          <p className="text-xs text-slate-500 mt-2">
            {t('The touch-display language of each device is set per device under Devices → Matrix settings.')}
          </p>
        </div>

        <div>
          <p className="label mb-2">{t('Start page')}</p>
          <select className="input sm:w-56" value={prefs.startPage} onChange={e => setPref('startPage', e.target.value)}>
            {nav.map(n => <option key={n.to} value={n.to}>{t(n.label)}</option>)}
          </select>
          <p className="text-xs text-slate-500 mt-2">{t('Page shown when the dashboard is opened.')}</p>
        </div>

        <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
          <span className="text-sm text-slate-300">{t('Show live sessions on the homepage')}</span>
          <input
            type="checkbox"
            className="w-4 h-4 accent-amber-500"
            checked={prefs.showLive}
            onChange={e => setPref('showLive', e.target.checked)}
          />
        </label>
      </div>
    </div>
  );
}
