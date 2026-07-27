"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import Panel from "@/components/Panel";

export default function RpcPanel() {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [running, setRunning] = useState(false);

    const handleRun = async () => {
        setRunning(true);
        setError(null);
        setResult(null);

        try {
            const data = await apiFetch("/rpc-test");
            setResult(data);
        } catch (err) {
            // 503 and 504 mean the broker rather than the permission gate, and
            // they are the two failures worth naming: the request was allowed.
            if (err.status === 503) {
                setError("The message broker is not reachable. Is RabbitMQ running?");
            } else if (err.status === 504) {
                setError("Nothing consumed the task within 10 seconds — is a worker listening on task_queue?");
            } else {
                setError(err.message);
            }
        } finally {
            setRunning(false);
        }
    };

    return (
        <Panel
            title="RabbitMQ round trip"
            permission="rpc:execute"
            description="Publishes to task_queue with a correlation id and waits for the reply, timing out after 10 seconds."
            probe={() => apiFetch("/rpc-test")}
        >
            <div className="space-y-4">
                <button
                    type="button"
                    onClick={handleRun}
                    disabled={running}
                    className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                >
                    {running ? "Waiting for the worker…" : "Send task"}
                </button>

                {error && (
                    <p role="alert" className="rounded border border-red-500/40 bg-red-900/30 px-4 py-2 text-sm text-red-300">
                        {error}
                    </p>
                )}

                {result && (
                    <pre className="overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-xs text-green-300">
                        {JSON.stringify(result, null, 2)}
                    </pre>
                )}
            </div>
        </Panel>
    );
}
