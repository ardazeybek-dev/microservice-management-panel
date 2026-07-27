"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AiPanel from "@/components/AiPanel";
import PermissionMatrix from "@/components/PermissionMatrix";
import RecordsPanel from "@/components/RecordsPanel";
import RpcPanel from "@/components/RpcPanel";

export default function DashboardPage() {
    const router = useRouter();
    const { user, status, error, logout, refresh } = useAuth();

    useEffect(() => {
        if (status === "anonymous") router.replace("/login");
    }, [status, router]);

    if (status === "loading") {
        return (
            <main className="flex min-h-screen items-center justify-center">
                <p className="text-gray-400">Checking your session…</p>
            </main>
        );
    }

    if (status !== "authenticated" || !user) {
        return (
            <main className="flex min-h-screen items-center justify-center p-6">
                <div className="text-center">
                    <p className="text-gray-400">Redirecting to sign in…</p>
                    {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto w-full max-w-5xl p-6">
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-gray-700 bg-gray-800 p-6">
                <div>
                    <h1 className="text-2xl font-bold text-blue-400">Management Panel</h1>
                    <p className="mt-1 text-sm text-gray-400">
                        {user.email} · <span className="font-semibold text-gray-200">{user.role}</span>
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => refresh()}
                        className="rounded-lg border border-gray-600 px-4 py-2 text-sm transition-colors hover:bg-gray-700"
                        title="Re-read your permissions from the server"
                    >
                        Refresh permissions
                    </button>
                    <button
                        type="button"
                        onClick={logout}
                        className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold transition-colors hover:bg-gray-600"
                    >
                        Sign out
                    </button>
                </div>
            </header>

            <section className="mb-8 rounded-xl border border-gray-700 bg-gray-800/50 p-6">
                <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-300 uppercase">
                    Your permissions
                </h2>
                {user.permissions.length === 0 ? (
                    <p className="text-sm text-red-300">
                        Your role holds no permissions. Ask a Supervisor to grant some.
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {user.permissions.map((code) => (
                            <code
                                key={code}
                                className="rounded bg-green-500/15 px-2 py-1 font-mono text-xs text-green-300"
                            >
                                {code}
                            </code>
                        ))}
                    </div>
                )}
                <p className="mt-3 text-xs text-gray-500">
                    Read from GET /auth/me, which resolves them from the database — not from the token.
                </p>
            </section>

            <div className="space-y-6">
                <PermissionMatrix />
                <RecordsPanel />
                <RpcPanel />
                <AiPanel />
            </div>
        </main>
    );
}
