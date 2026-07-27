"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Panel from "@/components/Panel";

const PAGE_SIZE = 10;

export default function RecordsPanel() {
    const { can } = useAuth();
    const canRead = can("records:read");
    const canWrite = can("records:write");

    const [page, setPage] = useState({ total: 0, offset: 0, items: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [draft, setDraft] = useState('{ "note": "Added from the panel" }');
    const [writeError, setWriteError] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = useCallback(
        async (offset = 0) => {
            if (!canRead) return;

            setLoading(true);
            setError(null);

            try {
                const data = await apiFetch(`/records?limit=${PAGE_SIZE}&offset=${offset}`);
                setPage({ total: data.total, offset: data.offset, items: data.items });
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        },
        [canRead]
    );

    useEffect(() => {
        load(0);
    }, [load]);

    const handleCreate = async (event) => {
        event.preventDefault();
        setWriteError(null);

        let parsed;
        try {
            parsed = JSON.parse(draft);
        } catch {
            setWriteError("That is not valid JSON.");
            return;
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            setWriteError("The payload must be a JSON object.");
            return;
        }

        setSaving(true);
        try {
            await apiFetch("/records", { method: "POST", body: { data: parsed } });
            // Jump back to the first page: the list is newest-first, so the row
            // that was just created is only visible there.
            await load(0);
        } catch (err) {
            setWriteError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const lastOffset = Math.max(0, Math.floor((page.total - 1) / PAGE_SIZE) * PAGE_SIZE);

    return (
        <Panel
            title="Records"
            permission="records:read"
            description="JSONB rows from PostgreSQL. Every insert also fires the audit trigger."
            probe={() => apiFetch(`/records?limit=${PAGE_SIZE}`)}
        >
            <div className="space-y-4">
                <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>
                        {page.total} record{page.total === 1 ? "" : "s"} total
                    </span>
                    <button
                        type="button"
                        onClick={() => load(page.offset)}
                        disabled={loading}
                        className="rounded border border-gray-600 px-3 py-1 transition-colors hover:bg-gray-700 disabled:opacity-50"
                    >
                        {loading ? "Loading…" : "Refresh"}
                    </button>
                </div>

                {error && (
                    <p role="alert" className="rounded border border-red-500/40 bg-red-900/30 px-4 py-2 text-sm text-red-300">
                        {error}
                    </p>
                )}

                <div className="max-h-64 overflow-y-auto rounded-lg bg-gray-900 p-4 font-mono text-sm">
                    {page.items.length === 0 ? (
                        <p className="text-gray-500">No records on this page.</p>
                    ) : (
                        page.items.map((record) => (
                            <div key={record.id} className="mb-2 border-b border-gray-800 pb-2 last:border-0">
                                <span className="text-blue-300">#{record.id}</span>{" "}
                                <span className="text-gray-500">
                                    {new Date(record.created_at).toLocaleString()}
                                </span>
                                <div className="text-green-400">{JSON.stringify(record.data)}</div>
                            </div>
                        ))
                    )}
                </div>

                {page.total > PAGE_SIZE && (
                    <div className="flex items-center justify-between text-sm">
                        <button
                            type="button"
                            onClick={() => load(Math.max(0, page.offset - PAGE_SIZE))}
                            disabled={page.offset === 0 || loading}
                            className="rounded border border-gray-600 px-3 py-1 transition-colors hover:bg-gray-700 disabled:opacity-40"
                        >
                            ← Newer
                        </button>
                        <span className="text-gray-500">
                            {page.offset + 1}–{Math.min(page.offset + PAGE_SIZE, page.total)} of {page.total}
                        </span>
                        <button
                            type="button"
                            onClick={() => load(page.offset + PAGE_SIZE)}
                            disabled={page.offset >= lastOffset || loading}
                            className="rounded border border-gray-600 px-3 py-1 transition-colors hover:bg-gray-700 disabled:opacity-40"
                        >
                            Older →
                        </button>
                    </div>
                )}

                <div className="border-t border-gray-700 pt-4">
                    <div className="mb-2 flex items-center gap-2">
                        <h4 className="font-semibold text-gray-200">Add a record</h4>
                        <code
                            className={`rounded px-2 py-0.5 font-mono text-xs ${
                                canWrite ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"
                            }`}
                        >
                            records:write
                        </code>
                    </div>

                    {canWrite ? (
                        <form onSubmit={handleCreate} className="space-y-3">
                            <textarea
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                rows={3}
                                spellCheck={false}
                                aria-label="Record JSON payload"
                                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 font-mono text-sm text-gray-100 outline-none focus:border-blue-500"
                            />

                            {writeError && (
                                <p role="alert" className="text-sm text-red-300">
                                    {writeError}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                            >
                                {saving ? "Saving…" : "Save record"}
                            </button>
                        </form>
                    ) : (
                        <p className="text-sm text-red-300">
                            Your role can read records but not create them.
                        </p>
                    )}
                </div>
            </div>
        </Panel>
    );
}
