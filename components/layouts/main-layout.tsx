'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Workflow,
  Play,
  FileText,
  Users,
  Code,
  Settings,
  KeyRound,
  Webhook,
  Bot,
  Radio,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SIDEBAR_STORAGE_KEY = 'main-layout-sidebar-collapsed';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Workflows', href: '/workflows', icon: Workflow },
  { name: 'Agents', href: '/agents', icon: Bot },
  { name: 'Agent Bus', href: '/agents/bus', icon: Radio },
  { name: 'Executions', href: '/executions', icon: Play },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'Secrets', href: '/secrets', icon: KeyRound },
  { name: 'Team', href: '/team', icon: Users },
  { name: 'API', href: '/api-keys', icon: Code },
  { name: 'Webhooks', href: '/webhooks', icon: Webhook },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function MainLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // Ignore localStorage access errors.
    }
  }, [collapsed]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div
        className={cn(
          'hidden md:flex md:flex-col transition-all duration-300',
          collapsed ? 'md:w-14' : 'md:w-[240px]'
        )}
      >
        <div className="flex flex-grow flex-col overflow-y-auto border-r border-border bg-card px-2 pt-5 pb-4">
          {/* Logo */}
          <div
            className={cn(
              'mb-5 flex flex-shrink-0 items-center',
              collapsed ? 'justify-center px-0' : 'px-2'
            )}
          >
            <div className="flex items-center">
              <img src="/pandaflow-logo.png" alt="PandaFlow" className="h-8 w-8 rounded-lg object-cover" />
              {!collapsed && <span className="ml-3 text-xl font-bold">PandaFlow</span>}
            </div>
          </div>

          {/* Navigation */}
          <nav className="mt-5 flex-1 space-y-1">
            {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    title={collapsed ? item.name : undefined}
                    className={cn(
                      'group flex items-center rounded-md py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      collapsed ? 'justify-center px-0' : 'px-2'
                    )}
                  >
                    <item.icon
                      className={cn('h-5 w-5 flex-shrink-0', !collapsed && 'mr-3')}
                      aria-hidden="true"
                    />
                    {!collapsed && item.name}
                  </Link>
                );
              })}
          </nav>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'flex w-full items-center rounded-md border border-border bg-background py-2 text-sm font-medium text-muted-foreground shadow-sm transition-all duration-300 hover:bg-accent hover:text-accent-foreground',
                collapsed ? 'justify-center px-0' : 'justify-between px-3'
              )}
            >
              {!collapsed && <span>Collapse sidebar</span>}
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="relative z-10 flex h-16 flex-shrink-0 border-b border-border bg-card shadow-sm">
          <div className="flex flex-1 items-center justify-between px-4">
            <div className="flex flex-1">
              {/* Search or breadcrumbs can go here */}
            </div>
            <div className="ml-4 flex items-center space-x-4 md:ml-6">
              {/* User menu, notifications, etc. */}
              <div className="flex items-center space-x-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                  U
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="relative flex-1 overflow-y-auto focus:outline-none">{children}</main>
      </div>
    </div>
  );
}
