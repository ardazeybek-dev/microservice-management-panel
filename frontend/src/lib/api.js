const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3006";

const TOKEN_KEY = "mmp.token";

/**
 * Every non-2xx response and every transport failure surfaces as one of these,
 * so callers can branch on `status` instead of guessing at fetch's mix of
 * thrown TypeErrors and resolved-but-failed responses.
 *
 * status === 0 means the request never reached the server.
 */
export class ApiError extends Error {
    constructor(message, status, body) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.body = body;
    }
}

export function getToken() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOKEN_KEY);
}

/**
 * Calls the backend with the stored bearer token attached.
 *
 * Pass `formData` for multipart uploads — Content-Type is deliberately left
 * unset there so the browser can add the multipart boundary itself.
 */
export async function apiFetch(path, options = {}) {
    const { method = "GET", body, formData, auth = true, signal } = options;

    const headers = {};

    if (auth) {
        const token = getToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    }

    let payload;
    if (formData) {
        payload = formData;
    } else if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(`${API_URL}${path}`, { method, headers, body: payload, signal });
    } catch (err) {
        if (err.name === "AbortError") throw err;
        throw new ApiError("Could not reach the backend. Is the server running?", 0, null);
    }

    // 204s and error pages alike can have empty or non-JSON bodies.
    const text = await response.text();
    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { error: text };
        }
    }

    if (!response.ok) {
        throw new ApiError(
            data?.error || `Request failed with status ${response.status}.`,
            response.status,
            data
        );
    }

    return data;
}

export { API_URL };
