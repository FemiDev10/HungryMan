import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  BookText,
  FileStack,
  History,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  PlusCircle,
  ScrollText,
  Settings,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import { useOverview } from '../lib/hooks';
import { AgentStateBadge } from './StatusBadge';
import { NotificationBell } from './NotificationBell';
import { cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: 'exceptions';
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Agent',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/queue', label: 'Queue', icon: ListOrdered },
      { to: '/exceptions', label: 'Exceptions', icon: AlertTriangle, badge: 'exceptions' },
      { to: '/history', label: 'History', icon: History },
      { to: '/import', label: 'Import job', icon: PlusCircle },
    ],
  },
  {
    section: 'You',
    items: [
      { to: '/profile', label: 'Candidate profile', icon: UserRound },
      { to: '/cv-profiles', label: 'CV profiles', icon: FileStack },
      { to: '/answers', label: 'Answer library', icon: BookText },
    ],
  },
  {
    section: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/audit', label: 'Audit log', icon: ScrollText },
    ],
  },
];

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('hm-theme', dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
        <Activity className="size-4.5" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight text-fg">HungryMan</div>
        <div className="text-[11px] text-subtle">Autonomous job agent</div>
      </div>
    </div>
  );
}

function SidebarNav({ onNavigate, exceptions }: { onNavigate?: () => void; exceptions: number }) {
  return (
    <nav className="flex flex-col gap-5">
      {NAV.map((group) => (
        <div key={group.section}>
          <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-subtle">{group.section}</div>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
                      isActive ? 'bg-surface-3 font-medium text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge === 'exceptions' && exceptions > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 text-[11px] font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      {exceptions}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useTheme();
  const overview = useOverview();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const exceptionsQ = useQuery({
    queryKey: ['applications', 'exceptions-count'],
    queryFn: () => api.applications({ view: 'exceptions', page: 1, pageSize: 1 }),
    refetchInterval: 15_000,
  });
  const exceptions = exceptionsQ.data?.total ?? overview.data?.today.needsAttention ?? 0;
  const agent = overview.data?.agent;

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      qc.clear();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-full lg:grid lg:grid-cols-[15.5rem_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface px-3 py-5 lg:flex">
        <Brand />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav exceptions={exceptions} />
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <LogOut className="size-4" /> Sign out
        </button>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 border-r border-line bg-surface px-3 py-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button className="rounded-md p-1.5 text-muted hover:bg-surface-2" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarNav exceptions={exceptions} onNavigate={() => setMobileOpen(false)} />
            </div>
            <button onClick={logout} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
              <LogOut className="size-4" /> Sign out
            </button>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
          <button className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-surface-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <span className="text-sm font-semibold">HungryMan</span>
          </div>
          <div className="flex-1" />
          {agent && (
            <NavLink to="/" className="hidden items-center gap-2 text-xs text-muted sm:flex" title="Agent state">
              <AgentStateBadge state={agent.state} />
              {agent.running && agent.currentTask && <span className="max-w-[16rem] truncate">{agent.currentTask}</span>}
            </NavLink>
          )}
          <button
            type="button"
            onClick={() => setDark(!dark)}
            className="rounded-lg p-2 text-muted transition hover:bg-surface-2 hover:text-fg"
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          <NotificationBell />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
