"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch, clearToken, getToken, setToken } from "@/lib/api";

const AuthContext = createContext(null);

/**
 * Holds the session.
 *
 * Permissions are never derived from the token on this side — they come from
 * GET /auth/me, which reads them out of the database. That is what lets a
 * Supervisor's edit show up here without anyone logging back in; calling
 * refresh() re-reads them.
 *
 * None of this is a security boundary. Every gate rendered from `can()` is
 * also enforced by requirePermission() on the server; hiding a button only
 * saves the user a pointless 403.
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [status, setStatus] = useState("loading"); // loading | anonymous | authenticated
    const [error, setError] = useState(null);

    const refresh = useCallback(async () => {
        if (!getToken()) {
            setUser(null);
            setStatus("anonymous");
            return null;
        }

        try {
            const me = await apiFetch("/auth/me");
            setUser(me);
            setStatus("authenticated");
            setError(null);
            return me;
        } catch (err) {
            // An expired or forged token is worth discarding. A backend that is
            // simply down is not — dropping the token there would log the user
            // out every time the server restarts.
            if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
                clearToken();
                setUser(null);
                setStatus("anonymous");
                return null;
            }
            setError(err.message);
            setStatus("anonymous");
            return null;
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const login = useCallback(async (email, password) => {
        const result = await apiFetch("/auth/login", {
            method: "POST",
            body: { email, password },
            auth: false,
        });

        setToken(result.token);

        const me = await apiFetch("/auth/me");
        setUser(me);
        setStatus("authenticated");
        setError(null);
        return me;
    }, []);

    const logout = useCallback(() => {
        clearToken();
        setUser(null);
        setStatus("anonymous");
        setError(null);
    }, []);

    const can = useCallback(
        (code) => Boolean(user?.permissions?.includes(code)),
        [user]
    );

    const value = useMemo(
        () => ({ user, status, error, login, logout, refresh, can }),
        [user, status, error, login, logout, refresh, can]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used inside an AuthProvider.");
    return context;
}
