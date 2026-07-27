"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

/**
 * A feature card gated on a permission code.
 *
 * When the permission is missing the card renders a locked state instead of
 * its children. `probe` — if given — fires the very request the card would
 * have made and prints the server's raw answer, which is the only honest way
 * to show that the gate is enforced on the backend and not just hidden here.
 */
export default function Panel({ title, permission, description, probe, children }) {
    const { can } = useAuth();
    const allowed = can(permission);

    const [probeResult, setProbeResult] = useState(null);
    const [probing, setProbing] = useState(false);

    const runProbe = async () => {
        setProbing(true);
        setProbeResult(null);

        try {
            const data = await probe();
            setProbeResult({ status: 200, body: data });
        } catch (err) {
            setProbeResult({
                status: err instanceof ApiError ? err.status : 0,
                body: err instanceof ApiError ? err.body : { error: err.message },
            });
        } finally {
            setProbing(false);
        }
    };

    return (
        <section
            className={`rounded-xl border p-6 ${
                allowed ? "border-green-500/30 bg-gray-800" : "border-red-500/30 bg-red-900/10"
            }`}
        >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xl font-bold text-gray-100">{title}</h3>
                <code
                    className={`rounded px-2 py-1 font-mono text-xs ${
                        allowed ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"
                    }`}
                    title={allowed ? "You hold this permission" : "You do not hold this permission"}
                >
                    {permission}
                </code>
            </div>

            {description && <p className="mb-4 text-sm text-gray-400">{description}</p>}

            {allowed ? (
                children
            ) : (
                <div className="space-y-4">
                    <p className="text-sm text-red-300">
                        Your role does not hold <code className="font-mono">{permission}</code>, so this
                        feature is hidden. A Supervisor can grant it from the permission matrix.
                    </p>

                    {probe && (
                        <div>
                            <button
                                type="button"
                                onClick={runProbe}
                                disabled={probing}
                                className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {probing ? "Calling…" : "Call the endpoint anyway"}
                            </button>

                            {probeResult && (
                                <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-xs text-gray-300">
                                    {`HTTP ${probeResult.status}\n${JSON.stringify(probeResult.body, null, 2)}`}
                                </pre>
                            )}

                            <p className="mt-2 text-xs text-gray-500">
                                Hiding the button is cosmetic. The server rejects the request on its own.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
