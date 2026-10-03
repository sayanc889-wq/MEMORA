import React, { createContext, useEffect, useState, useCallback } from "react";
import { API_BASE_URL as API_BASE } from "../config/api";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("memora_token") || null);
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("memora_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem("memora_token");
      localStorage.removeItem("memora_user");
      sessionStorage.clear();
    } catch (e) {
      console.warn("Storage clear error on logout:", e);
    }
  }, []);

  // Validate existing token on mount
  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      if (!token) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          const userData = await res.json();
          if (isMounted) {
            setUser(userData);
            localStorage.setItem("memora_user", JSON.stringify(userData));
          }
        } else {
          // Token expired or invalid
          if (isMounted) logout();
        }
      } catch (err) {
        console.warn("Could not verify session with backend:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [token, logout]);

  const saveAuth = (accessToken, userData) => {
    setToken(accessToken);
    setUser(userData);
    localStorage.setItem("memora_token", accessToken);
    localStorage.setItem("memora_user", JSON.stringify(userData));
  };

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || "Invalid email or password");
    }

    const data = await res.json();
    saveAuth(data.access_token, data.user);
    return data.user;
  };

  const register = async (email, password, fullName) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        full_name: fullName || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || "Registration failed");
    }

    const data = await res.json();
    saveAuth(data.access_token, data.user);
    return data.user;
  };

  const loginAsDemo = async () => {
    const res = await fetch(`${API_BASE}/auth/demo`, { method: "POST" });
    if (!res.ok) {
      throw new Error("Demo login unavailable");
    }
    const data = await res.json();
    saveAuth(data.access_token, data.user);
    return data.user;
  };

  // Authenticated fetch helper
  const authFetch = useCallback(
    async (url, options = {}) => {
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }

      const response = await fetch(url, { ...options, headers });
      if (response.status === 401) {
        logout();
      }
      return response;
    },
    [token, logout]
  );

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: Boolean(token && user),
        loading,
        login,
        register,
        loginAsDemo,
        logout,
        authFetch,
        apiBase: API_BASE,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
