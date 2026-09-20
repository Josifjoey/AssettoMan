import React from 'react';
import { Routes, Route, Navigate, Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { clsx } from 'clsx';
import { Gauge, Server, Package, Users, Settings as SettingsIcon, LogOut, Globe, Activity, ExternalLink, Radio } from 'lucide-react';
import { ToastProvider, Button, Badge } from './components/ui';
import { useSystemHealth } from './hooks';

import SetupPage from './pages/Setup';
import LoginPage from './pages/Login';
import DashboardPage from './pages/Dashboard';
import ServerNewPage from './pages/ServerNew';
import ServerDetailPage from './pages/ServerDetail';
import AccountsPage from './pages/Accounts';
import ContentPage from './pages/Content';
import SettingsPage from './pages/Settings';
import PublicPage from './pages/Public';
import LivePage from './pages/Live';
import LiveAdminPage from './pages/LiveAdmin';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, setupRequired, loading } = useAuth();
  if (loading) return <div className="h-screen grid place-items-center text-muted">Loading…</div>;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function NavItem({ to, end, icon, label }: { to: string; end?: boolean; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to} end={end} title={label}
      className={({ isActive }) => clsx(
        'relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
        isActive ? 'bg-accent text-foreground font-medium' : 'text-muted hover:text-foreground hover:bg-accent/60'
      )}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-brand" />}
          <span className="shrink-0">{icon}</span>
          <span className="hidden lg:inline truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}

function Layout({ children, fullbleed }: { children: React.ReactNode; fullbleed?: boolean }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const health = useSystemHealth();

  return (
    <div className="min-h-screen flex">
      <aside className="w-14 lg:w-60 shrink-0 border-r border-border bg-card/60 backdrop-blur flex flex-col sticky top-0 h-screen">
        <div className="px-3 lg:px-5 h-16 flex items-center gap-2.5 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-brand grid place-items-center shrink-0 shadow-lg">
            <Gauge size={18} className="text-white" />
          </div>
          <div className="hidden lg:block min-w-0">
            <div className="font-bold font-display leading-tight">AssettoMan</div>
            <div className="eyebrow text-[9px]">Server Manager</div>
          </div>
        </div>
        <nav className="p-2 lg:p-3 space-y-1 flex-1 overflow-y-auto">
          <div className="eyebrow px-3 pt-2 pb-1 hidden lg:block">Manage</div>
          <NavItem to="/admin" end icon={<Activity size={16} />} label="Dashboard" />
          <NavItem to="/admin/live" icon={<Radio size={16} />} label="Live" />
          <NavItem to="/admin/servers/new" icon={<Server size={16} />} label="New Server" />
          <NavItem to="/admin/content" icon={<Package size={16} />} label="Content" />
          {user?.role === 'admin' && (
            <>
              <div className="eyebrow px-3 pt-3 pb-1 hidden lg:block">Admin</div>
              <NavItem to="/admin/accounts" icon={<Users size={16} />} label="Accounts" />
            </>
          )}
          <div className="eyebrow px-3 pt-3 pb-1 hidden lg:block">System</div>
          <NavItem to="/admin/settings" icon={<SettingsIcon size={16} />} label="Settings" />
          <Link to="/" target="_blank" title="Public Page"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted hover:text-foreground hover:bg-accent/60 transition-colors duration-150">
            <Globe size={16} className="shrink-0" />
            <span className="hidden lg:flex items-center gap-1 truncate">Public Page <ExternalLink size={11} /></span>
          </Link>
        </nav>
        <div className="p-2 lg:p-3 border-t border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand grid place-items-center text-white text-xs font-bold shrink-0">
              {(user?.display_name || user?.username || '?')[0].toUpperCase()}
            </div>
            <div className="hidden lg:block min-w-0 flex-1">
              <div className="text-sm truncate">{user?.display_name || user?.username}</div>
              <Badge tone={user?.role === 'admin' ? 'brand' : 'neutral'}>{user?.role}</Badge>
            </div>
            <button onClick={async () => { await logout(); nav('/login'); }} title="Sign out"
                    className="hidden lg:block text-muted hover:text-foreground transition-colors">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur flex items-center gap-3 px-6">
          <div className="flex-1" />
          {health && (
            <Badge tone={health.docker ? 'blue' : 'neutral'} dot>
              {health.docker ? 'Docker' : 'Local runtime'}
            </Badge>
          )}
          <Link to="/" target="_blank">
            <Button variant="ghost" size="sm" icon={<Globe size={13} />}>View public site</Button>
          </Link>
        </header>
        <main className={fullbleed ? 'flex-1 min-h-0 overflow-hidden relative' : 'flex-1 overflow-auto'}>
          {fullbleed
            ? <div className="absolute inset-0">{children}</div>
            : <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">{children}</div>}
        </main>
      </div>
    </div>
  );
}

function AuthedApp() {
  const { setupRequired, user, loading } = useAuth();
  return (
    <Routes>
      {/* Public site */}
      <Route path="/" element={<PublicPage />} />
      <Route path="/live" element={<LivePage />} />
      <Route path="/live/:serverId" element={<LivePage />} />

      {/* Auth */}
      <Route path="/setup" element={setupRequired ? <SetupPage /> : <Navigate to="/admin" replace />} />
      <Route path="/login" element={!setupRequired && !user && !loading ? <LoginPage /> : <Navigate to="/admin" replace />} />

      {/* Staff area */}
      <Route path="/admin" element={<Protected><Layout><DashboardPage /></Layout></Protected>} />
      <Route path="/admin/live" element={<Protected><Layout fullbleed><LiveAdminPage /></Layout></Protected>} />
      <Route path="/admin/live/:serverId" element={<Protected><Layout fullbleed><LiveAdminPage /></Layout></Protected>} />
      <Route path="/admin/servers/new" element={<Protected><Layout><ServerNewPage /></Layout></Protected>} />
      <Route path="/admin/servers/:id" element={<Protected><Layout><ServerDetailPage /></Layout></Protected>} />
      <Route path="/admin/content" element={<Protected><Layout><ContentPage /></Layout></Protected>} />
      <Route path="/admin/accounts" element={<Protected><Layout><AccountsPage /></Layout></Protected>} />
      <Route path="/admin/settings" element={<Protected><Layout><SettingsPage /></Layout></Protected>} />

      {/* Legacy redirects */}
      <Route path="/public" element={<Navigate to="/" replace />} />
      <Route path="/public/live/:serverId" element={<LegacyLiveRedirect />} />
      <Route path="/servers/new" element={<Navigate to="/admin/servers/new" replace />} />
      <Route path="/servers/:id" element={<LegacyServerRedirect />} />
      <Route path="/content" element={<Navigate to="/admin/content" replace />} />
      <Route path="/accounts" element={<Navigate to="/admin/accounts" replace />} />
      <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LegacyLiveRedirect() {
  const { serverId } = useParams();
  return <Navigate to={`/live/${serverId}`} replace />;
}
function LegacyServerRedirect() {
  const { id } = useParams();
  return <Navigate to={`/admin/servers/${id}`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AuthedApp />
      </ToastProvider>
    </AuthProvider>
  );
}
