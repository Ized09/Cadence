import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthCallback() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || "";
    const m = hash.match(/session_id=([^&]+)/);
    if (!m) {
      nav("/login", { replace: true });
      return;
    }
    const session_id = m[1];

    (async () => {
      try {
        const r = await api.post("/auth/session", { session_id });
        setUser(r.data.user);
        // clean hash
        window.history.replaceState({}, "", window.location.pathname);
        nav(r.data.user.onboarded ? "/dashboard" : "/onboarding", { replace: true });
      } catch {
        nav("/login", { replace: true });
      }
    })();
  }, [nav, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="label-mono">Signing you in…</div>
    </div>
  );
}
