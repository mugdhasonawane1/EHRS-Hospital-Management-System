import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { authApi } from '../api/auth.api';
import { readSession, writeSession, setUnauthorizedHandler } from '../api/axiosClient';

export const AuthContext = createContext(null);

/**
 * Holds the current user + tokens. Context is plenty for a project this size;
 * the server-state (appointments, records...) is fetched per page via useFetch.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readSession());
  const [loading, setLoading] = useState(true);

  const logout = useCallback(async () => {
    try {
      if (readSession()?.accessToken) await authApi.logout();
    } catch {
      /* stateless JWT — nothing to clean up server-side */
    }
    writeSession(null);
    setSession(null);
  }, []);

  // The axios interceptor calls this when a refresh attempt fails for good.
  useEffect(() => setUnauthorizedHandler(() => setSession(null)), []);

  // Revalidate the stored token on boot so a stale session doesn't render a
  // dashboard that immediately 401s.
  useEffect(() => {
    let cancelled = false;
    async function verify() {
      const stored = readSession();
      if (!stored?.accessToken) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await authApi.me();
        if (cancelled) return;
        const next = { ...stored, user: data.user };
        writeSession(next);
        setSession(next);
      } catch {
        if (!cancelled) {
          writeSession(null);
          setSession(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    verify();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await authApi.login(credentials);
    const next = { user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
    writeSession(next);
    setSession(next);
    return next.user;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await authApi.register(payload);
    const next = { user: data.user, accessToken: data.accessToken, refreshToken: data.refreshToken };
    writeSession(next);
    setSession(next);
    return next.user;
  }, []);

  const value = useMemo(
    () => ({
      user: session?.user || null,
      role: session?.user?.role || null,
      isAuthenticated: Boolean(session?.accessToken),
      loading,
      login,
      register,
      logout,
    }),
    [session, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
