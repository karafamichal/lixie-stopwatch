import { useState } from 'react';
import * as api from '../api';
import { t } from '../i18n';
import LixieDigits from '../components/LixieDigits';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await api.auth.login(password));
    } catch {
      setError(t('Wrong password. Try again.'));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LixieDigits value="00:00" dim className="text-6xl" />
          <h1 className="mt-4 text-lg font-semibold text-slate-100">Lixie StopWatch</h1>
          <p className="text-sm text-slate-400">{t('Enter the dashboard password to continue.')}</p>
        </div>
        <label className="label" htmlFor="pw">{t('Password')}</label>
        <input
          id="pw"
          type="password"
          className="input"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-400 mt-2" role="alert">{error}</p>}
        <button type="submit" className="btn-primary w-full mt-4" disabled={busy || !password}>
          {t('Log in')}
        </button>
      </form>
    </main>
  );
}
