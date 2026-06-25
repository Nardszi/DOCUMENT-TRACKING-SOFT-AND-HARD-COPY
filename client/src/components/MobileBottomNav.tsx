import { NavLink } from 'react-router-dom'
import { useNotifications } from '../contexts/NotificationContext'

const TABS = [
  { to: '/', label: 'Home', icon: (active: boolean) => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.2 : 1.75} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  )},
  { to: '/documents', label: 'Docs', icon: (active: boolean) => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.2 : 1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  )},
  { to: '/approvals', label: 'Approvals', icon: (active: boolean) => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.2 : 1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )},
  { to: '/notifications', label: 'Alerts', icon: (active: boolean) => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.2 : 1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
  )},
]

export default function MobileBottomNav() {
  const { unreadCount } = useNotifications()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 safe-area-inset" aria-label="Bottom navigation">
      <div className="flex items-center justify-around h-14">
        {TABS.map(tab => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'}>
            {({ isActive }) => (
              <div className="flex flex-col items-center gap-0.5 px-3 py-1 min-w-[56px] relative">
                <span className={isActive ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}>
                  {tab.icon(isActive)}
                </span>
                <span className={`text-[10px] font-medium ${isActive ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}`}>
                  {tab.label}
                </span>
                {tab.label === 'Alerts' && unreadCount > 0 && (
                  <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
