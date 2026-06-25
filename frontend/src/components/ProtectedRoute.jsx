import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children, requireOnboarded = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary font-mono text-xs">
        <span className="opacity-70">Loading…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (requireOnboarded && !user.onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}
