import React, { useMemo } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Loading = () => (
  <div className="min-h-screen flex items-center justify-center text-text-secondary font-mono text-xs">
    <span className="opacity-70">Loading…</span>
  </div>
);

export default function ProtectedRoute({ children, requireOnboarded = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const fromState = useMemo(() => ({ from: location }), [location]);

  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" state={fromState} replace />;
  if (requireOnboarded && !user.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}
