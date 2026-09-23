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
import { usePrefs } from './i18n';

export default function App() {
  const { lang, startPage } = usePrefs();
  return (
    // key={lang}: remount on language change so every t() call re-runs.
    <BrowserRouter key={lang}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to={startPage} replace />} />
          <Route path="overview" element={<Overview />} />
          <Route path="clients" element={<Clients />} />
          <Route path="projects" element={<Projects />} />
          <Route path="apps" element={<Apps />} />
          <Route path="timelogs" element={<TimeLogs />} />
          <Route path="devices" element={<Devices />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
