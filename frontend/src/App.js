import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Draft from "@/pages/Draft";
import Review from "@/pages/Review";
import Settings from "@/pages/Settings";

function AppRouter() {
  const location = useLocation();
  // Intercept session_id from hash anywhere
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute requireOnboarded><Dashboard /></ProtectedRoute>} />
      <Route path="/draft/:id" element={<ProtectedRoute requireOnboarded><Draft /></ProtectedRoute>} />
      <Route path="/draft/:id/review" element={<ProtectedRoute requireOnboarded><Review /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute requireOnboarded><Settings /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: "#1E2530",
                border: "1px solid #262E3A",
                color: "#F3EFE6",
                fontFamily: "Inter, sans-serif",
                fontSize: "14px",
                borderRadius: "8px",
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
