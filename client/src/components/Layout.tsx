import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { useTheme } from '../contexts/ThemeContext'
import QuickSearch from './QuickSearch'

interface NavItem {
  to: string
  label: string
  adminOnly?: boolean
  icon: React.ReactNode
}

// SVG icon components (inline, no external dep)
const Icons = {
  dashboard: (
    <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  documents: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  notifications: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  reports: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  profile: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  admin: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  auditLog: (
    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  sun: (
    <svg className="w-[16px] h-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  ),
  moon: (
    <svg className="w-[16px] h-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
  logout: (
    <svg className="w-[16px] h-[16px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: Icons.dashboard },
  { to: '/documents', label: 'Documents', icon: Icons.documents },
  { to: '/notifications', label: 'Notifications', icon: Icons.notifications },
  { to: '/reports', label: 'Reports', icon: Icons.reports },
  { to: '/profile', label: 'Profile', icon: Icons.profile },
  { to: '/admin', label: 'Admin', adminOnly: true, icon: Icons.admin },
  { to: '/audit-log', label: 'Audit Log', adminOnly: true, icon: Icons.auditLog },
]

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold leading-none">
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NONECOLogo({ size = 64 }: { size?: number }) {
  return (
    <img
      src="/noneco-logo.png"
      alt="NONECO Logo"
      width={size}
      height={size}
      className="flex-shrink-0 drop-shadow-sm"
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

// Role display helper
function roleLabel(role?: string) {
  if (!role) return ''
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth()
  const { unreadCount } = useNotifications()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false)
  const [loggingOut, setLoggingOut] = React.useState(false)

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || user?.role === 'admin')

  function handleLogoutClick() {
    setShowLogoutConfirm(true)
  }

  function handleLogoutConfirm() {
    setShowLogoutConfirm(false)
    setLoggingOut(true)
    // Brief pause so the notification is visible, then log out
    setTimeout(() => {
      logout()
      navigate('/login?reason=logout')
    }, 1800)
  }

  function handleLogoutCancel() {
    setShowLogoutConfirm(false)
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1 focus:ring-offset-stone-900 ${
      isActive
        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
        : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100 border border-transparent'
    }`

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-stone-50 dark:bg-stone-950">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 bg-stone-900 dark:bg-[#0f0e0d] min-h-screen border-r border-stone-800/60 dark:border-stone-900 sticky top-0 h-screen overflow-y-auto">
        {/* Logo / brand header */}
        <div className="px-5 py-5 border-b border-stone-800/60 dark:border-stone-900 flex items-center gap-3">
          <NONECOLogo size={44} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-400 leading-tight tracking-wide">NONECO</p>
            <p className="text-[11px] text-stone-500 leading-tight mt-0.5">Document Tracking</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5" aria-label="Main navigation">
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className={linkClass}>
              <span className="flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.label === 'Notifications' && <UnreadBadge count={unreadCount} />}
            </NavLink>
          ))}
        </nav>

        {/* Quick search */}
        <div className="px-3 pb-2">
          <QuickSearch />
        </div>

        {/* Footer: theme + user + logout */}
        <div className="px-3 py-3 border-t border-stone-800/60 dark:border-stone-900 space-y-2">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-stone-500 hover:bg-stone-800 hover:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all duration-150 border border-transparent hover:border-stone-700"
            aria-label="Toggle dark mode"
          >
            <span className="text-stone-400">
              {theme === 'dark' ? Icons.sun : Icons.moon}
            </span>
            <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {/* User info + logout */}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-stone-800/50 border border-stone-700/40">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-amber-400 leading-none">
                {user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-stone-200 truncate leading-tight">{user?.fullName}</p>
              <p className="text-[10px] text-stone-500 leading-tight mt-0.5">{roleLabel(user?.role)}</p>
            </div>
            <button
              onClick={handleLogoutClick}
              className="flex-shrink-0 p-1.5 rounded-md text-stone-500 hover:text-red-400 hover:bg-red-500/10 focus:outline-none focus:ring-2 focus:ring-red-400 transition-all duration-150"
              aria-label="Sign out"
              title="Sign out"
            >
              {Icons.logout}
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-0 min-w-0 pt-14 lg:pt-0">
        {children}
      </main>

      {/* ── Mobile top header bar ── */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-30 bg-stone-900/95 dark:bg-[#0f0e0d]/95 backdrop-blur-sm border-b border-stone-800">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Logo + name */}
          <div className="flex items-center gap-2.5">
            <img src="/noneco-logo.png" alt="NONECO" className="w-7 h-7 object-contain" />
            <span className="text-sm font-bold text-amber-400 tracking-wide">NONECO</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <NavLink
              to="/notifications"
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
              className="relative p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>

            {/* Hamburger */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="p-2 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer menu ── */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 z-20 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="lg:hidden fixed top-14 left-0 right-0 z-20 bg-stone-900 dark:bg-[#0f0e0d] border-b border-stone-800 shadow-2xl animate-slide-up">
            <nav className="px-3 py-3 space-y-0.5" aria-label="Mobile navigation">
              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                        : 'text-stone-400 hover:bg-stone-800 hover:text-stone-100 border border-transparent'
                    }`
                  }
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.label === 'Notifications' && <UnreadBadge count={unreadCount} />}
                </NavLink>
              ))}
            </nav>

            {/* User + actions */}
            <div className="px-3 py-3 border-t border-stone-800 space-y-2">
              <button
                onClick={toggleTheme}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 transition-colors"
              >
                <span>{theme === 'dark' ? Icons.sun : Icons.moon}</span>
                <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
              </button>

              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-stone-800/50 border border-stone-700/40">
                <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-amber-400">{user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-stone-200 truncate">{user?.fullName}</p>
                  <p className="text-[10px] text-stone-500">{roleLabel(user?.role)}</p>
                </div>
                <button
                  onClick={() => { setMobileMenuOpen(false); handleLogoutClick() }}
                  className="p-1.5 rounded-md text-stone-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  aria-label="Sign out"
                >
                  {Icons.logout}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Logout confirmation dialog ── */}
      {showLogoutConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={handleLogoutCancel}
            aria-hidden="true"
          />
          {/* Card */}
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-stone-800 border border-stone-100 dark:border-stone-700 shadow-2xl p-6 animate-slide-up">
            {/* Icon */}
            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <h2 id="logout-dialog-title" className="text-base font-semibold text-stone-900 dark:text-stone-100 mb-1">
              Sign out?
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400 mb-6 leading-relaxed">
              You'll be returned to the login page. Any unsaved changes will be lost.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleLogoutCancel}
                className="flex-1 min-h-[40px] px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-sm font-medium text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-600 focus:outline-none focus:ring-2 focus:ring-stone-300 transition-all"
              >
                Stay
              </button>
              <button
                type="button"
                onClick={handleLogoutConfirm}
                className="flex-1 min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-stone-800 transition-all shadow-sm"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Logging-out overlay notification ── */}
      {loggingOut && (
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            {/* Animated checkmark circle */}
            <div className="w-16 h-16 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center shadow-2xl">
              <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-white">Signing out…</p>
              <p className="text-sm text-stone-400 mt-0.5">See you next time, {user?.fullName?.split(' ')[0]}.</p>
            </div>
            {/* Progress bar */}
            <div className="w-40 h-1 rounded-full bg-stone-700 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full animate-[logout-progress_1.8s_ease-in-out_forwards]" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
