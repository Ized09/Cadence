import React, { useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

function readSessionIdFromHash() {
  const m = (window.location.hash || "").match(/session_id=([^&]+)/);
  return m ? m[1] : null;
}

export default function AuthCallback() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  const exchange = useCallback(async () => {
    const session_id = readSessionIdFromHash();
    if (!session_id) {
      nav("/login", { replace: true });
      return;
    }
    try {
      const r = await api.post("/auth/session", { session_id });
      setUser(r.data.user);
      window.history.replaceState({}, "", window.location.pathname);
      nav(r.data.user.onboarded ? "/dashboard" : "/onboarding", { replace: true });
    } catch (err) {
      console.error("oauth session exchange failed", err);
      nav("/login", { replace: true });
    }
  }, [nav, setUser]);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    exchange();
  }, [exchange]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="label-mono">Signing you in…</div>
    </div>
  );
}
