import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  googleConfigured: boolean;
  authError: string | null;
  clearAuthError: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
export const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

const authErrorMessages: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  invalid_request: "The sign-in request expired or could not be verified. Please try again.",
  sign_in_failed: "Google sign-in could not be completed. Please try again.",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorCode = params.get("auth_error");
    if (errorCode) {
      setAuthError(authErrorMessages[errorCode] ?? authErrorMessages.sign_in_failed);
      params.delete("auth_error");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    }

    Promise.all([
      fetch(`${API_BASE}/api/auth/me`, { credentials: "include" }).then((response) => response.json()),
      fetch(`${API_BASE}/api/auth/google/config`).then((response) => response.json()),
    ]).then(([session, config]) => {
      setUser(session.user ?? null);
      setGoogleConfigured(config.configured === true);
    }).catch(() => {
      setUser(null);
      setGoogleConfigured(false);
    }).finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    const response = await fetch(`${API_BASE}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) throw new Error("Could not log out. Please try again.");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, googleConfigured, authError, clearAuthError: () => setAuthError(null), logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
