import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Pickaxe,
  Plus,
  LogOut,
  Activity,
  Bot,
  Coins,
  Factory,
  Moon,
  Menu,
  Sun,
  X,
} from 'lucide-react';
import { Button } from '../ui/button';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { canAccessSystemArea } from '@/lib/system-access';

const THEME_STORAGE_KEY = 'agentcraft.theme';

type NavItem = { label: string; href: string; anchor?: boolean };
type ThemeMode = 'light' | 'dark';

function getAvatarInitial(user: { displayName?: string; email: string }) {
  const source = user.displayName?.trim() || user.email.trim();
  return source.charAt(0).toUpperCase();
}

function UserAvatar({
  user,
  sizeClassName = 'h-8 w-8',
}: {
  user: { displayName?: string; email: string; avatarUrl?: string };
  sizeClassName?: string;
}) {
  const label = user.displayName || user.email;

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={label}
        className={cn(
          sizeClassName,
          'shrink-0 rounded-full border border-border object-cover',
        )}
      />
    );
  }

  return (
    <span
      aria-label={label}
      className={cn(
        sizeClassName,
        'flex shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold text-muted-foreground',
      )}
    >
      {getAvatarInitial(user)}
    </span>
  );
}

export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof document === 'undefined') return 'light';
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });
  const isDarkTheme = theme === 'dark';

  const canAccessSystemTools = canAccessSystemArea(user);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDarkTheme);
    root.style.colorScheme = isDarkTheme ? 'dark' : 'light';
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [isDarkTheme, theme]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };
  const prefersLightPage = location.pathname === '/' || location.pathname.startsWith('/projects');
  const useLightHeader = prefersLightPage && !isDarkTheme;

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  // Public primary nav per design spec §3/§21
  const primaryNav: NavItem[] = [
    { label: 'Tasks', href: '/tasks' },
    { label: 'Projects', href: '/projects' },
    { label: 'Docs', href: '/docs' },
    { label: 'Contact', href: '/#contact', anchor: true },
  ];

  const linkBase = cn(
    'whitespace-nowrap text-sm font-medium transition-colors',
    useLightHeader
      ? 'text-slate-600 hover:text-slate-950'
      : 'text-muted-foreground hover:text-foreground',
  );

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b backdrop-blur-md',
        useLightHeader
          ? 'border-slate-200 bg-white/85 text-slate-950 supports-[backdrop-filter]:bg-white/75'
          : 'border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/60',
      )}
    >
      <div className="container flex h-14 items-center">
        <Link to="/" className="mr-4 flex shrink-0 items-center space-x-2 lg:mr-6">
          <Pickaxe className={cn('h-6 w-6', useLightHeader ? 'text-cyan-700' : 'text-primary')} />
          <span className={cn('whitespace-nowrap text-lg font-bold tracking-tight', useLightHeader ? 'text-slate-950' : 'text-foreground')}>
            {t('app.name')}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center space-x-4 xl:flex 2xl:space-x-5">
          {primaryNav.map((item) =>
            item.anchor ? (
              <a key={item.href} href={item.href} className={linkBase}>
                {item.label}
              </a>
            ) : (
              <Link key={item.href} to={item.href} className={linkBase}>
                {item.label}
              </Link>
            ),
          )}

          {user && (
            <>
              <Link to="/dashboard" className={linkBase}>
                {t('nav.dashboard')}
              </Link>
              <Link to="/tasks/create" className={linkBase}>
                <span className="flex items-center gap-1">
                  <Plus className="h-4 w-4" />
                  {t('nav.createTask')}
                </span>
              </Link>
              <Link to="/agent" className={linkBase}>
                <span className="flex items-center gap-1">
                  <Bot className="h-4 w-4" />
                  {t('nav.agent')}
                </span>
              </Link>
              {canAccessSystemTools && (
                <>
                  <Link to="/task-generator" className={linkBase}>
                    <span className="flex items-center gap-1" title="Task Generator">
                      <Factory className="h-4 w-4" />
                      <span className="hidden 2xl:inline">Task Generator</span>
                      <span className="sr-only 2xl:hidden">Task Generator</span>
                    </span>
                  </Link>
                  <Link to="/operations" className={linkBase}>
                    <span className="flex items-center gap-1" title="Operations">
                      <Activity className="h-4 w-4" />
                      <span className="hidden 2xl:inline">Operations</span>
                      <span className="sr-only 2xl:hidden">Operations</span>
                    </span>
                  </Link>
                </>
              )}
            </>
          )}
        </nav>

        {/* Spacer for mobile */}
        <div className="flex-1 xl:hidden" />

        {/* Right cluster */}
        <div className="hidden items-center space-x-2 xl:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          <LanguageSwitcher />
          {user ? (
            <>
              <Link
                to="/wallet"
                className={cn(
                  'mr-1 flex items-center gap-1 text-sm font-medium transition-colors',
                  useLightHeader ? 'text-cyan-700 hover:text-cyan-800' : 'text-primary hover:text-primary/80',
                )}
              >
                <Coins className="h-4 w-4" />
                <span>{user.balance ?? 0} Credits</span>
              </Link>
              <Link to="/profile" className="flex items-center gap-2">
                <UserAvatar user={user} />
                <Button variant="ghost" size="sm" className="max-w-40 truncate px-2">
                  {user.displayName || user.email}
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title={t('nav.logout')}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm">
                  {t('nav.login')}
                </Button>
              </Link>
              <Link to="/tasks">
                <Button
                  size="sm"
                  className={cn(
                    'font-semibold',
                    useLightHeader
                      ? 'bg-slate-950 text-slate-50 shadow-sm hover:bg-slate-800'
                      : 'bg-gradient-to-r from-cyan-400 to-sky-500 text-[hsl(222,47%,6%)] shadow-lg shadow-cyan-500/20 hover:brightness-110',
                  )}
                >
                  Explore Tasks
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className={cn(
            'inline-flex h-9 w-9 items-center justify-center rounded-md xl:hidden',
            useLightHeader ? 'text-slate-700 hover:bg-slate-100' : 'text-foreground hover:bg-accent',
          )}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          className={cn(
            'border-t backdrop-blur xl:hidden',
            useLightHeader ? 'border-slate-200 bg-white/95' : 'border-border/60 bg-background/95',
          )}
        >
          <div className="container flex flex-col gap-1 py-3">
            {primaryNav.map((item) =>
              item.anchor ? (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(linkBase, 'py-2')}
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(linkBase, 'py-2')}
                >
                  {item.label}
                </Link>
              ),
            )}
            {user ? (
              <>
                <Link
                  to="/profile"
                  className={cn(
                    'flex items-center gap-3 py-2 text-sm font-medium',
                    useLightHeader ? 'text-slate-950' : 'text-foreground',
                  )}
                >
                  <UserAvatar user={user} sizeClassName="h-9 w-9" />
                  <span className="truncate">{user.displayName || user.email}</span>
                </Link>
                <Link to="/dashboard" className={cn(linkBase, 'py-2')}>
                  {t('nav.dashboard')}
                </Link>
                <Link to="/tasks/create" className={cn(linkBase, 'py-2')}>
                  {t('nav.createTask')}
                </Link>
                <Link to="/agent" className={cn(linkBase, 'py-2')}>
                  {t('nav.agent')}
                </Link>
                {canAccessSystemTools && (
                  <>
                    <Link to="/task-generator" className={cn(linkBase, 'py-2')}>
                      Task Generator
                    </Link>
                    <Link to="/operations" className={cn(linkBase, 'py-2')}>
                      Operations
                    </Link>
                  </>
                )}
                <Link to="/wallet" className={cn(linkBase, 'py-2')}>
                  Credits · {user.balance ?? 0}
                </Link>
                <button
                  onClick={handleLogout}
                  className={cn(linkBase, 'py-2 text-left')}
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <Link to="/login" className="flex-1">
                  <Button variant="ghost" size="sm" className="w-full">
                    {t('nav.login')}
                  </Button>
                </Link>
                <Link to="/tasks" className="flex-1">
                  <Button
                    size="sm"
                    className={cn(
                      'w-full font-semibold',
                      useLightHeader
                        ? 'bg-slate-950 text-slate-50 hover:bg-slate-800'
                        : 'bg-gradient-to-r from-cyan-400 to-sky-500 text-[hsl(222,47%,6%)] hover:brightness-110',
                    )}
                  >
                    Explore Tasks
                  </Button>
                </Link>
              </div>
            )}
            <div className="pt-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  title={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
                  aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {isDarkTheme ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
                <LanguageSwitcher />
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
