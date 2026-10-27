"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { UserSession } from "@/lib/auth";

interface AuthContextType {
  user: UserSession | null;
  loading: boolean;
  isAuthModalOpen: boolean;
  authModalReason: string;
  openAuthModal: (reason?: string, onAuthenticated?: () => void) => void;
  closeAuthModal: () => void;
  login: (credentials: { email: string; password: string }) => Promise<void>;
  register: (credentials: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalReason, setAuthModalReason] = useState("");
  const pendingCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let ignore = false;

    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: UserSession | null } | null) => {
        if (!ignore) {
          setUser(data?.user ?? null);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ignore) {
          setUser(null);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { user?: UserSession | null };
        setUser(data.user ?? null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  const openAuthModal = useCallback(
    (reason?: string, onAuthenticated?: () => void) => {
      setAuthModalReason(
        reason || "Log in or sign up with your email to keep your recordings."
      );
      pendingCallbackRef.current = onAuthenticated ?? null;
      setIsAuthModalOpen(true);
    },
    []
  );

  const closeAuthModal = useCallback(() => {
    setIsAuthModalOpen(false);
    pendingCallbackRef.current = null;
  }, []);

  const login = useCallback(
    async (credentials: { email: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = (await res.json()) as { user?: UserSession; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Login failed. Please check your credentials.");
      }
      if (data.user) {
        setUser(data.user);
        setIsAuthModalOpen(false);
        const cb = pendingCallbackRef.current;
        if (cb) {
          pendingCallbackRef.current = null;
          cb();
        }
      }
    },
    []
  );

  const register = useCallback(
    async (credentials: { email: string; password: string }) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = (await res.json()) as { user?: UserSession; error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Sign up failed. Please try again.");
      }
      if (data.user) {
        setUser(data.user);
        setIsAuthModalOpen(false);
        const cb = pendingCallbackRef.current;
        if (cb) {
          pendingCallbackRef.current = null;
          cb();
        }
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      window.location.reload();
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthModalOpen,
        authModalReason,
        openAuthModal,
        closeAuthModal,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
