import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const r = await api.get("/auth/me");
      setUser(r.data);
    } catch (err) {
      // expected when there's no session yet
      if (err?.response?.status !== 401) {
        console.warn("auth check failed", err);
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If returning from OAuth callback, skip /me — AuthCallback handles it.
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const login = useCallback(async (email, password) => {
    const r = await api.post("/auth/login", { email, password });
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const register = useCallback(async (email, password, name) => {
    const r = await api.post("/auth/register", { email, password, name });
    setUser(r.data.user);
    return r.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.warn("logout request failed (continuing)", err);
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, login, register, logout, refresh: checkAuth }),
    [user, loading, login, register, logout, checkAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
