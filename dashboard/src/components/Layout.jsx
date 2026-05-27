import { NavLink, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Clock,
  Cpu,
  AppWindow,
  BarChart2,
} from 'lucide-react';

const nav = [
  { to: '/overview', icon: LayoutDashboard, label: 'Homepage' },
  { to: '/clients',  icon: Users,           label: 'Clients' },
  { to: '/projects', icon: FolderKanban,    label: 'Projects' },
  { to: '/apps',     icon: AppWindow,       label: 'Pricing' },
  { to: '/timelogs', icon: Clock,           label: 'Time Logs' },
  { to: '/devices',  icon: Cpu,             label: 'Devices' },
  { to: '/reports',  icon: BarChart2,       label: 'Reports' },
];

export default function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-slate-900 border-r border-slate-700/60 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">⏱</span>
            <div>
              <p className="text-sm font-bold text-amber-400 leading-tight tracking-wide uppercase">Lixie</p>
              <p className="text-xs text-slate-500 leading-tight tracking-wider uppercase">Stopky</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ` +
                (isActive
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800')
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-3 border-t border-slate-700/60">
          <p className="text-xs text-slate-600">Erasmus IoT Project</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
