import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const user = mode === "login"
        ? await login(email, password)
        : await register(email, password, name);
      nav(user.onboarded ? "/dashboard" : "/onboarding");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Couldn't sign in.");
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/auth/callback";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen flex">
      {/* left — editorial */}
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden border-r border-ink-700">
        <div className="absolute inset-0 grain" />
        <div className="relative z-10 p-16 flex flex-col justify-between w-full">
          <div className="label-mono text-text-secondary">CADENCE · NO. 001</div>
          <div>
            <h1 className="font-serif text-5xl lg:text-6xl leading-[1.05] text-paper">
              Your blog,<br />
              written in <em className="italic text-coral">your</em> voice,<br />
              shipped on schedule.
            </h1>
            <p className="mt-8 max-w-md text-text-secondary leading-relaxed">
              Cadence learns how you actually write, helps you co-draft new posts, and nudges you until they go live —
              straight to your Sanity site.
            </p>
          </div>
          <div className="label-mono text-text-secondary">For solo experts who keep going quiet.</div>
        </div>
      </div>

      {/* right — form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="label-mono mb-3">{mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}</div>
          <h2 className="font-serif text-3xl text-paper mb-8">
            {mode === "login" ? "Welcome back." : "Start a new draft this week."}
          </h2>

          <button
            data-testid="google-signin-btn"
            onClick={googleLogin}
            className="w-full btn-ghost mb-3 flex items-center justify-center gap-3"
          >
            <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.2 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.2 29.5 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.3C29.6 35 26.9 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.5 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.7l6.5 5.3c4.6-4.3 7.4-10.5 7.4-17.5 0-1.2-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-ink-700" />
            <div className="label-mono">OR EMAIL</div>
            <div className="flex-1 h-px bg-ink-700" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <input data-testid="auth-name" className="input-ink" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            )}
            <input data-testid="auth-email" className="input-ink" type="email" required placeholder="you@yourdomain.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input data-testid="auth-password" className="input-ink" type="password" required minLength={6} placeholder="Password (6+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button data-testid="auth-submit" disabled={busy} type="submit" className="btn-primary w-full">
              {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-6 text-sm text-text-secondary">
            {mode === "login" ? (
              <>No account yet? <button data-testid="switch-to-register" className="text-coral underline-offset-4 hover:underline" onClick={() => setMode("register")}>Create one</button></>
            ) : (
              <>Already have one? <button data-testid="switch-to-login" className="text-coral underline-offset-4 hover:underline" onClick={() => setMode("login")}>Sign in</button></>
            )}
          </div>

          <div className="mt-12 label-mono">
            <Link to="/" className="hover:text-paper">← Back to landing</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
