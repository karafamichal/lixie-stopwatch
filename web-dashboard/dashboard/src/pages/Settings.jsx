import { useEffect, useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import * as api from '../api';
import { LANGUAGES, setPref, usePrefs, t, locale } from '../i18n';
import { nav } from '../components/Layout';
import ConfirmDialog from '../components/ConfirmDialog';

const THEMES = [
  { value: 'system', label: 'Match system' },
  { value: 'dark',   label: 'Dark' },
  { value: 'light',  label: 'Light' },
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'HUF', 'SEK', 'DKK', 'NOK'];

function Choice({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`seg ${value === o.value ? 'seg-on' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// One settings group: heading + short explanation on the left, controls on
// the right (stacked on phones).
function Section({ title, text, children }) {
  return (
    <section className="grid md:grid-cols-[14rem_1fr] gap-3 md:gap-8 py-6 border-t border-slate-700 first:border-t-0 first:pt-0">
      <div>
        <h2 className="section-title">{title}</h2>
        {text && <p className="text-xs text-slate-500 mt-1 max-w-[28ch]">{text}</p>}
      </div>
      <div className="space-y-5 min-w-0">{children}</div>
    </section>
  );
}

function Flash({ msg }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? 'text-green-400' : 'text-red-400'}`} role="status">{msg.text}</p>;
}

function PasswordForm({ auth, onAuthChange }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);

  const save = async (value) => {
    setMsg(null);
    if (value && value !== confirm) { setMsg({ ok: false, text: t('The new passwords do not match.') }); return; }
    try {
      const res = await api.auth.setPassword(current, value);
      onAuthChange(res);
      setCurrent(''); setNext(''); setConfirm('');
      setMsg({ ok: true, text: value ? t('Password saved.') : t('Password removed. The dashboard is open to everyone on the network.') });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('Something went wrong') });
    }
  };

  return (
    <form onSubmit={e => { e.preventDefault(); save(next); }} className="space-y-3 max-w-sm">
      {auth.enabled && (
        <div>
          <label className="label" htmlFor="pw-cur">{t('Current password')}</label>
          <input id="pw-cur" type="password" className="input" autoComplete="current-password"
            value={current} onChange={e => setCurrent(e.target.value)} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="pw-new">{t('New password')}</label>
        <input id="pw-new" type="password" className="input" autoComplete="new-password" minLength={6}
          value={next} onChange={e => setNext(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pw-conf">{t('Repeat new password')}</label>
        <input id="pw-conf" type="password" className="input" autoComplete="new-password"
          value={confirm} onChange={e => setConfirm(e.target.value)} />
      </div>
      <Flash msg={msg} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={next.length < 6}>
          {auth.enabled ? t('Change password') : t('Set password')}
        </button>
        {auth.enabled && (
          <button type="button" className="btn-ghost" disabled={!current} onClick={() => save('')}>
            {t('Remove password')}
          </button>
        )}
      </div>
    </form>
  );
}

function BackupPanel() {
  const fileRef = useRef();
  const [pending, setPending] = useState(null);
  const [msg, setMsg] = useState(null);

  const restore = async () => {
    const file = pending;
    setPending(null);
    setMsg(null);
    try {
      await api.backup.restore(file);
      setMsg({ ok: true, text: t('Backup restored. Reloading…') });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('Something went wrong') });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <a className="btn-secondary" href={api.backup.downloadUrl} download>
          <Download className="w-4 h-4" /> {t('Download backup')}
        </a>
        <button type="button" className="btn-secondary" onClick={() => fileRef.current.click()}>
          <Upload className="w-4 h-4" /> {t('Restore from file…')}
        </button>
        <input ref={fileRef} type="file" accept=".db,.sqlite,.sqlite3" className="hidden"
          onChange={e => { if (e.target.files[0]) setPending(e.target.files[0]); e.target.value = ''; }} />
      </div>
      <Flash msg={msg} />
      <ConfirmDialog
        isOpen={!!pending}
        onClose={() => setPending(null)}
        onConfirm={restore}
        title={t('Restore backup')}
        confirmLabel={t('Restore')}
        message={t('Replace all clients, projects, time logs and settings with the contents of "{name}"? Download a backup of the current data first if you might need it.', { name: pending?.name })}
      />
    </div>
  );
}

function FirmwarePanel() {
  const fileRef = useRef();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { api.firmware.info().then(setInfo).catch(() => {}); }, []);

  const upload = async (file) => {
    setBusy(true);
    setMsg(null);
    try {
      setInfo(await api.firmware.upload(file));
      setMsg({ ok: true, text: t('Firmware uploaded. Install it from the Devices page.') });
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('Something went wrong') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {info ? (
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className="text-slate-500">{t('File')}</dt>
          <dd className="text-slate-200 truncate">{info.name}</dd>
          <dt className="text-slate-500">{t('Size')}</dt>
          <dd className="text-slate-200">{(info.size / 1024).toFixed(0)} KB</dd>
          <dt className="text-slate-500">{t('Uploaded')}</dt>
          <dd className="text-slate-200">{new Date(info.uploaded_at).toLocaleString(locale())}</dd>
        </dl>
      ) : (
        <p className="text-sm text-slate-500">{t('No firmware uploaded yet.')}</p>
      )}
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current.click()}>
        <Upload className="w-4 h-4" /> {busy ? t('Uploading…') : t('Upload firmware (.bin)…')}
      </button>
      <input ref={fileRef} type="file" accept=".bin" className="hidden"
        onChange={e => { if (e.target.files[0]) upload(e.target.files[0]); e.target.value = ''; }} />
      <Flash msg={msg} />
    </div>
  );
}

function CurrencyPicker() {
  const { currency } = usePrefs();
  const [msg, setMsg] = useState(null);
  const change = async (code) => {
    try {
      const s = await api.serverSettings.set({ currency: code });
      setPref('currency', s.currency);
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.error || t('Something went wrong') });
    }
  };
  const options = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
  return (
    <div>
      <label className="label" htmlFor="currency">{t('Currency')}</label>
      <select id="currency" className="input sm:w-40" value={currency} onChange={e => change(e.target.value)}>
        {options.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <p className="hint">{t('Used for hourly rates, earnings and invoices. Amounts are not converted.')}</p>
      <Flash msg={msg} />
    </div>
  );
}

export default function Settings({ auth, onAuthChange }) {
  const prefs = usePrefs();

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('Settings')}</h1>
      </div>

      <div className="card p-4 sm:p-6">
        <Section title={t('Appearance')} text={t('Stored in this browser only.')}>
          <div>
            <p className="label">{t('Theme')}</p>
            <Choice
              options={THEMES.map(o => ({ ...o, label: t(o.label) }))}
              value={prefs.theme}
              onChange={v => setPref('theme', v)}
            />
          </div>
          <div>
            <p className="label">{t('Dashboard language')}</p>
            <Choice
              options={LANGUAGES.map(l => ({ value: l.code, label: l.label }))}
              value={prefs.lang}
              onChange={v => setPref('lang', v)}
            />
            <p className="hint">
              {t('The touch-display language of each device is set per device under Devices → Matrix settings.')}
            </p>
          </div>
          <div>
            <label className="label" htmlFor="start-page">{t('Start page')}</label>
            <select id="start-page" className="input sm:w-56" value={prefs.startPage} onChange={e => setPref('startPage', e.target.value)}>
              {nav.map(n => <option key={n.to} value={n.to}>{t(n.label)}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 accent-amber-500"
              checked={prefs.showLive}
              onChange={e => setPref('showLive', e.target.checked)}
            />
            <span className="text-sm text-slate-300">{t('Show live sessions on the homepage')}</span>
          </label>
        </Section>

        <Section title={t('Billing')} text={t('Shared by everyone using this server.')}>
          <CurrencyPicker />
        </Section>

        <Section
          title={t('Dashboard password')}
          text={auth.enabled
            ? t('The dashboard asks for this password. Devices keep working without it.')
            : t('Anyone on the network can open the dashboard. Set a password to lock it; devices keep working without it.')}
        >
          <PasswordForm auth={auth} onAuthChange={onAuthChange} />
        </Section>

        <Section title={t('Backup')} text={t('One file with all clients, projects, time logs and settings.')}>
          <BackupPanel />
        </Section>

        <Section title={t('Device firmware')} text={t('Upload a compiled .bin, then install it on a device from the Devices page. Devices update once no session is running.')}>
          <FirmwarePanel />
        </Section>
      </div>
    </div>
  );
}
