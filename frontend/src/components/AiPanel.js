"use client";

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import Panel from "@/components/Panel";

// Mirrors the multer limits in src/routes/ai.routes.js. Checking here too
// turns a 500-ish upload failure into an instant, explainable message.
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export default function AiPanel() {
    const inputRef = useRef(null);
    const [file, setFile] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);

    const handleFileChange = (event) => {
        const selected = event.target.files?.[0] ?? null;
        setError(null);
        setResult(null);

        if (selected && selected.size > MAX_FILE_BYTES) {
            setError("That file is larger than the 2 MB limit.");
            setFile(null);
            event.target.value = "";
            return;
        }

        setFile(selected);
    };

    const handleAnalyze = async () => {
        if (!file) {
            setError("Choose a .txt file first.");
            return;
        }

        setAnalyzing(true);
        setError(null);
        setResult(null);

        const formData = new FormData();
        formData.append("document", file);

        try {
            const data = await apiFetch("/ai-analyze", { method: "POST", formData });
            setResult(data);
            setFile(null);
            if (inputRef.current) inputRef.current.value = "";
        } catch (err) {
            setError(
                err.status === 503
                    ? "The server has no GEMINI_API_KEY configured, so analysis is unavailable."
                    : err.message
            );
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <Panel
            title="Document analysis"
            permission="ai:analyze"
            description="Uploads a .txt file and summarizes it with Gemini. The upload is deleted server-side once it has been read."
            probe={() => {
                const probeData = new FormData();
                probeData.append("document", new File(["probe"], "probe.txt", { type: "text/plain" }));
                return apiFetch("/ai-analyze", { method: "POST", formData: probeData });
            }}
        >
            <div className="space-y-4">
                <input
                    ref={inputRef}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleFileChange}
                    aria-label="Text file to analyze"
                    className="block w-full text-sm text-gray-400 file:mr-4 file:rounded file:border-0 file:bg-purple-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-purple-500"
                />

                <p className="text-xs text-gray-500">Only .txt is accepted, up to 2 MB.</p>

                <button
                    type="button"
                    onClick={handleAnalyze}
                    disabled={analyzing || !file}
                    className="rounded-lg bg-purple-600 px-5 py-2 font-semibold text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                >
                    {analyzing ? "Analyzing…" : "Send to Gemini"}
                </button>

                {error && (
                    <p role="alert" className="rounded border border-red-500/40 bg-red-900/30 px-4 py-2 text-sm text-red-300">
                        {error}
                    </p>
                )}

                {result && (
                    <div className="rounded-lg bg-gray-900 p-4">
                        <p className="mb-2 text-xs text-gray-500">
                            model: {result.model} · {result.characters} characters read
                        </p>
                        <p className="whitespace-pre-wrap font-mono text-sm text-purple-300">
                            {result.aiAnalysis}
                        </p>
                    </div>
                )}
            </div>
        </Panel>
    );
}
