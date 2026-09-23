import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Overview from './pages/Overview';
import Clients from './pages/Clients';
import Projects from './pages/Projects';
import Apps from './pages/Apps';
import TimeLogs from './pages/TimeLogs';
import Devices from './pages/Devices';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Statement from './pages/Statement';
import * as api from './api';
import { usePrefs, setPref } from './i18n';

export default function App() {
  const { lang, startPage, resolvedTheme, currency } = usePrefs();
  const [auth, setAuth] = useState(null);   // null while loading

  useEffect(() => {
    const off = api.onUnauthorized(() => setAuth({ enabled: true, authenticated: false }));
    api.auth.status().then(setAuth).catch(() => setAuth({ enabled: false, authenticated: true }));
    return off;
  }, []);

  useEffect(() => {
    if (!auth?.authenticated) return;
    api.serverSettings.get().then(s => setPref('currency', s.currency)).catch(() => {});
  }, [auth?.authenticated]);

  if (!auth) return null;
  if (!auth.authenticated) return <Login onLogin={setAuth} />;

  const logout = () => api.auth.logout().then(setAuth);

  return (
    // Remount on language / theme / currency change so every t() call,
    // chart colour and money format re-runs.
    <BrowserRouter key={`${lang}-${resolvedTheme}-${currency}`}>
      <Routes>
        <Route path="/statement/:id" element={<Statement />} />
        <Route path="/" element={<Layout auth={auth} onLogout={logout} />}>
          <Route index element={<Navigate to={startPage} replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="clients" element={<Clients />} />
          <Route path="projects" element={<Projects />} />
          <Route path="apps" element={<Apps />} />
          <Route path="timelogs" element={<TimeLogs />} />
          <Route path="devices" element={<Devices />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings auth={auth} onAuthChange={setAuth} />} />
          <Route path="*" element={<Navigate to={startPage} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
