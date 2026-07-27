"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Panel from "@/components/Panel";

export default function DocumentsPanel() {
    const { can } = useAuth();
    const canRead = can("documents:read");
    const canWrite = can("documents:write");

    const [corpus, setCorpus] = useState({ embedding: null, documents: [] });
    const [loadError, setLoadError] = useState(null);

    const [question, setQuestion] = useState("");
    const [result, setResult] = useState(null);
    const [asking, setAsking] = useState(false);
    const [askError, setAskError] = useState(null);

    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const load = useCallback(async () => {
        if (!canRead) return;
        try {
            setCorpus(await apiFetch("/documents"));
            setLoadError(null);
        } catch (err) {
            setLoadError(err.message);
        }
    }, [canRead]);

    useEffect(() => {
        load();
    }, [load]);

    const handleAsk = async (event) => {
        event.preventDefault();
        setAsking(true);
        setAskError(null);
        setResult(null);

        try {
            setResult(await apiFetch("/documents/ask", { method: "POST", body: { question } }));
        } catch (err) {
            // 503 means retrieval worked and only generation is unavailable —
            // the passages come back in the error body and are worth showing.
            if (err.status === 503 && err.body?.sources) {
                setResult({ ...err.body, answer: null });
            } else {
                setAskError(err.message);
            }
        } finally {
            setAsking(false);
        }
    };

    const handleAdd = async (event) => {
        event.preventDefault();
        setSaving(true);
        setSaveError(null);

        try {
            await apiFetch("/documents", { method: "POST", body: { title, content } });
            setTitle("");
            setContent("");
            await load();
        } catch (err) {
            setSaveError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await apiFetch(`/documents/${id}`, { method: "DELETE" });
            await load();
        } catch (err) {
            setLoadError(err.message);
        }
    };

    return (
        <Panel
            title="Document questions"
            permission="documents:read"
            description="Documents are chunked, embedded and searched by cosine similarity. Answers are built only from the passages that search returns."
            probe={() => apiFetch("/documents")}
        >
            <div className="space-y-5">
                {corpus.embedding && (
                    <p className="text-xs text-gray-500">
                        Embedding model:{" "}
                        <code className="font-mono text-gray-400">{corpus.embedding.model}</code> ·{" "}
                        {corpus.embedding.dimensions} dimensions
                        {!corpus.embedding.semantic && (
                            <span className="ml-2 rounded bg-yellow-500/15 px-2 py-0.5 text-yellow-300">
                                offline fallback — matches shared words, not meaning. Set GEMINI_API_KEY
                                for real embeddings.
                            </span>
                        )}
                    </p>
                )}

                {loadError && (
                    <p role="alert" className="rounded border border-red-500/40 bg-red-900/30 px-4 py-2 text-sm text-red-300">
                        {loadError}
                    </p>
                )}

                <form onSubmit={handleAsk} className="space-y-3">
                    <label className="block">
                        <span className="mb-2 block text-sm font-medium text-gray-300">
                            Ask something about the documents
                        </span>
                        <input
                            type="text"
                            value={question}
                            onChange={(event) => setQuestion(event.target.value)}
                            required
                            placeholder="Who can revoke a permission?"
                            className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-3 text-gray-100 outline-none focus:border-blue-500"
                        />
                    </label>
                    <button
                        type="submit"
                        disabled={asking || corpus.documents.length === 0}
                        className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                    >
                        {asking ? "Searching…" : "Ask"}
                    </button>
                    {corpus.documents.length === 0 && (
                        <p className="text-xs text-gray-500">Nothing indexed yet — add a document first.</p>
                    )}
                </form>

                {askError && (
                    <p role="alert" className="rounded border border-red-500/40 bg-red-900/30 px-4 py-2 text-sm text-red-300">
                        {askError}
                    </p>
                )}

                {result && (
                    <div className="space-y-3 rounded-lg bg-gray-900 p-4">
                        {result.answer ? (
                            <p className="whitespace-pre-wrap text-sm text-blue-200">{result.answer}</p>
                        ) : (
                            <p className="text-sm text-yellow-300">
                                {result.note || result.error || "No answer was generated."}
                            </p>
                        )}

                        {result.sources?.length > 0 && (
                            <div>
                                <p className="mb-2 text-xs text-gray-500">
                                    Retrieved passages — an answer can only be as good as these:
                                </p>
                                <ol className="space-y-2">
                                    {result.sources.map((source, index) => (
                                        <li key={source.chunkId} className="rounded border border-gray-700 p-3">
                                            <p className="mb-1 text-xs text-gray-500">
                                                [{index + 1}] {source.documentTitle} · chunk{" "}
                                                {source.chunkIndex} · similarity{" "}
                                                {source.similarity.toFixed(3)}
                                            </p>
                                            <p className="text-sm text-gray-300">{source.content}</p>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                    </div>
                )}

                <div className="border-t border-gray-700 pt-4">
                    <div className="mb-3 flex items-center gap-2">
                        <h4 className="font-semibold text-gray-200">Corpus</h4>
                        <code
                            className={`rounded px-2 py-0.5 font-mono text-xs ${
                                canWrite ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"
                            }`}
                        >
                            documents:write
                        </code>
                    </div>

                    {corpus.documents.length === 0 ? (
                        <p className="mb-4 text-sm text-gray-500">No documents yet.</p>
                    ) : (
                        <ul className="mb-4 space-y-1">
                            {corpus.documents.map((document) => (
                                <li
                                    key={document.id}
                                    className="flex items-center justify-between rounded bg-gray-900 px-3 py-2 text-sm"
                                >
                                    <span className="text-gray-300">
                                        {document.title}{" "}
                                        <span className="text-gray-500">
                                            · {document.chunks} chunk{document.chunks === 1 ? "" : "s"} ·{" "}
                                            {document.characters} chars
                                        </span>
                                    </span>
                                    {canWrite && (
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(document.id)}
                                            className="rounded border border-gray-600 px-2 py-1 text-xs transition-colors hover:bg-gray-700"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}

                    {canWrite ? (
                        <form onSubmit={handleAdd} className="space-y-3">
                            <input
                                type="text"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                required
                                placeholder="Document title"
                                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-sm text-gray-100 outline-none focus:border-blue-500"
                            />
                            <textarea
                                value={content}
                                onChange={(event) => setContent(event.target.value)}
                                required
                                rows={4}
                                placeholder="Paste the text to index…"
                                className="w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-sm text-gray-100 outline-none focus:border-blue-500"
                            />
                            {saveError && (
                                <p role="alert" className="text-sm text-red-300">
                                    {saveError}
                                </p>
                            )}
                            <button
                                type="submit"
                                disabled={saving}
                                className="rounded-lg bg-green-600 px-5 py-2 font-semibold text-white transition-colors hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                            >
                                {saving ? "Indexing…" : "Add and index"}
                            </button>
                        </form>
                    ) : (
                        <p className="text-sm text-red-300">
                            Your role can query the corpus but not change it.
                        </p>
                    )}
                </div>
            </div>
        </Panel>
    );
}
