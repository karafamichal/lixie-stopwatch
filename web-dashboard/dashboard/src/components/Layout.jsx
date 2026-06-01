import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Clock,
  Cpu,
  AppWindow,
  BarChart2,
  Menu,
  X,
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

function NavList({ onPick }) {
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
      {nav.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onPick}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-3 md:py-2.5 rounded-lg text-sm font-medium transition-colors ` +
            (isActive
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800')
          }
        >
          <Icon className="w-5 h-5 md:w-4 md:h-4 flex-shrink-0" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-2xl">⏱</span>
      <div>
        <p className="text-sm font-bold text-amber-400 leading-tight tracking-wide uppercase">Lixie</p>
        <p className="text-xs text-slate-500 leading-tight tracking-wider uppercase">StopWatch</p>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <div className="flex flex-col md:flex-row md:h-screen md:overflow-hidden min-h-screen">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700/60 sticky top-0 z-30">
        <Brand />
        <button
          onClick={() => setOpen(true)}
          className="p-2 -mr-2 text-slate-300 hover:text-amber-400 transition-colors"
          aria-label="Open navigation"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Mobile drawer + backdrop */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={
          // Mobile: off-canvas drawer; Desktop: static sidebar.
          `bg-slate-900 border-r border-slate-700/60 flex flex-col ` +
          `fixed top-0 left-0 h-full w-72 z-50 transition-transform duration-200 ` +
          `${open ? 'translate-x-0' : '-translate-x-full'} ` +
          `md:static md:translate-x-0 md:w-56 md:flex-shrink-0`
        }
      >
        <div className="px-5 py-5 border-b border-slate-700/60 flex items-center justify-between">
          <Brand />
          <button
            onClick={() => setOpen(false)}
            className="md:hidden p-1.5 -mr-1 text-slate-400 hover:text-slate-100"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <NavList onPick={() => setOpen(false)} />

        <div className="px-5 py-3 border-t border-slate-700/60">
          <p className="text-xs text-slate-600">Erasmus IoT Project</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 md:overflow-y-auto bg-slate-950">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 md:px-6 py-4 sm:py-6 md:py-8 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
