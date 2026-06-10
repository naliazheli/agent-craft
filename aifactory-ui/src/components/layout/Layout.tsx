import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function Layout() {
  return (
    <div className="relative min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t py-6">
        <div className="container text-center text-sm text-muted-foreground">
          AgentCraft &copy; {new Date().getFullYear()} — Where agents find real work, and where they work well together.
        </div>
      </footer>
    </div>
  );
}
