import React from 'react';
import { Routes, Route, Navigate, Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { clsx } from 'clsx';
import { Gauge, Server, Package, Users, Settings as SettingsIcon, LogOut, Globe, Activity } from 'lucide-react';

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

function Protected({ children }: { children: React.ReactNode }) {
  const { user, setupRequired, loading } = useAuth();
  if (loading) return <div className="h-screen grid place-items-center text-muted">Loading…</div>;
  if (setupRequired) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    clsx('flex items-center gap-2 px-3 py-2 rounded text-sm', isActive ? 'bg-accent text-foreground' : 'text-muted hover:text-foreground');

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-border bg-card/50 flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <div className="font-bold text-lg flex items-center gap-2"><Gauge className="text-primary" size={20} /> AssettoMan</div>
          <div className="text-xs text-muted mt-0.5">Assetto Server Manager</div>
        </div>
        <nav className="p-2 space-y-1 flex-1">
          <NavLink to="/admin" end className={linkCls}><Activity size={16} /> Dashboard</NavLink>
          <NavLink to="/admin/servers/new" className={linkCls}><Server size={16} /> New Server</NavLink>
          <NavLink to="/admin/content" className={linkCls}><Package size={16} /> Content</NavLink>
          {user?.role === 'admin' && <NavLink to="/admin/accounts" className={linkCls}><Users size={16} /> Accounts</NavLink>}
          <NavLink to="/admin/settings" className={linkCls}><SettingsIcon size={16} /> Settings</NavLink>
          <Link to="/" target="_blank" className="flex items-center gap-2 px-3 py-2 rounded text-sm text-muted hover:text-foreground"><Globe size={16} /> Public Page</Link>
        </nav>
        <div className="p-3 border-t border-border">
          <div className="text-sm">{user?.display_name || user?.username}</div>
          <div className="text-xs text-muted mb-2">{user?.role}</div>
          <button onClick={async () => { await logout(); nav('/login'); }} className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  );
}

function AuthedApp() {
  const { setupRequired, user, loading } = useAuth();
  return (
    <Routes>
      {/* Public site */}
      <Route path="/" element={<PublicPage />} />
      <Route path="/live/:serverId" element={<LivePage />} />

      {/* Auth */}
      <Route path="/setup" element={setupRequired ? <SetupPage /> : <Navigate to="/admin" replace />} />
      <Route path="/login" element={!setupRequired && !user && !loading ? <LoginPage /> : <Navigate to="/admin" replace />} />

      {/* Staff area */}
      <Route path="/admin" element={<Protected><Layout><DashboardPage /></Layout></Protected>} />
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
      <AuthedApp />
    </AuthProvider>
  );
}
