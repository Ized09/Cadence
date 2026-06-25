import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut } from "lucide-react";

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const item = (to, label, testid) => {
    const active = pathname.startsWith(to);
    return (
      <Link
        to={to}
        data-testid={testid}
        className={`label-mono px-3 py-1.5 rounded-md transition-colors ${active ? "text-paper bg-ink-800" : "text-text-secondary hover:text-paper"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="border-b border-ink-700 sticky top-0 z-30 backdrop-blur bg-ink-900/85">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/dashboard" data-testid="nav-home" className="flex items-baseline gap-2">
          <span className="font-serif text-2xl tracking-tight text-paper">Cadence</span>
          <span className="label-mono hidden sm:inline">v1 · solo</span>
        </Link>
        <nav className="flex items-center gap-1">
          {item("/dashboard", "Drafts", "nav-drafts")}
          {item("/settings", "Settings", "nav-settings")}
          <button
            data-testid="nav-logout"
            onClick={async () => { await logout(); navigate("/login"); }}
            className="ml-2 label-mono text-text-secondary hover:text-paper px-3 py-1.5 inline-flex items-center gap-2"
            title={user?.email}
          >
            <LogOut size={13} strokeWidth={1.5} />
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
