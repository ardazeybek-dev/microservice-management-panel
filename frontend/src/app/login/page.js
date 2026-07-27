"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
    const router = useRouter();
    const { login, status } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // A live session should not sit on the login screen.
    useEffect(() => {
        if (status === "authenticated") router.replace("/");
    }, [status, router]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            await login(email, password);
            router.replace("/");
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <div className="w-full max-w-md">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-blue-400">Management Panel</h1>
                    <p className="mt-2 text-sm text-gray-400">
                        Sign in to continue. What you can do is decided by your role.
                    </p>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="rounded-xl border border-gray-700 bg-gray-800 p-8 shadow-lg"
                >
                    <label className="mb-4 block">
                        <span className="mb-2 block text-sm font-medium text-gray-300">Email</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            required
                            autoComplete="email"
                            autoFocus
                            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-gray-100 outline-none focus:border-blue-500"
                            placeholder="you@example.com"
                        />
                    </label>

                    <label className="mb-6 block">
                        <span className="mb-2 block text-sm font-medium text-gray-300">Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            required
                            autoComplete="current-password"
                            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-gray-100 outline-none focus:border-blue-500"
                            placeholder="••••••••"
                        />
                    </label>

                    {error && (
                        <p
                            role="alert"
                            className="mb-4 rounded-lg border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-300"
                        >
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                    >
                        {submitting ? "Signing in…" : "Sign in"}
                    </button>
                </form>

                <p className="mt-6 text-center text-xs text-gray-500">
                    The first Supervisor account is created by{" "}
                    <code className="rounded bg-gray-800 px-1.5 py-0.5 text-gray-400">npm run setup-db</code>{" "}
                    from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.
                </p>
            </div>
        </main>
    );
}
