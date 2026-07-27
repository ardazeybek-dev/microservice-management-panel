"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import Panel from "@/components/Panel";

/**
 * The role → permission grid, backed by role_permissions.
 *
 * Saving a role the current user belongs to calls refresh(), because the
 * server resolves permissions per request: the moment the row is written, the
 * caller's own next request is judged by the new set. Without the refresh the
 * panel would keep rendering a set the backend has already stopped honouring.
 */
export default function PermissionMatrix() {
    const { user, refresh, can } = useAuth();
    const allowed = can("permissions:manage");

    const [roles, setRoles] = useState([]);
    const [available, setAvailable] = useState([]);
    const [draft, setDraft] = useState({}); // roleId -> Set of codes
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [savingRoleId, setSavingRoleId] = useState(null);
    const [notice, setNotice] = useState(null);

    const load = useCallback(async () => {
        // Without this guard every non-Supervisor would fire a request that can
        // only ever come back 403, purely to fill a card they cannot see.
        if (!allowed) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const data = await apiFetch("/admin/permissions");
            setRoles(data.roles);
            setAvailable(data.availablePermissions);
            setDraft(
                Object.fromEntries(data.roles.map((role) => [role.role_id, new Set(role.permissions)]))
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [allowed]);

    useEffect(() => {
        load();
    }, [load]);

    const saved = useMemo(
        () => Object.fromEntries(roles.map((role) => [role.role_id, new Set(role.permissions)])),
        [roles]
    );

    const isDirty = useCallback(
        (roleId) => {
            const current = draft[roleId];
            const original = saved[roleId];
            if (!current || !original) return false;
            if (current.size !== original.size) return true;
            for (const code of current) if (!original.has(code)) return true;
            return false;
        },
        [draft, saved]
    );

    const toggle = (roleId, code) => {
        setNotice(null);
        setDraft((previous) => {
            const next = new Set(previous[roleId]);
            if (next.has(code)) next.delete(code);
            else next.add(code);
            return { ...previous, [roleId]: next };
        });
    };

    const save = async (role) => {
        setSavingRoleId(role.role_id);
        setError(null);
        setNotice(null);

        try {
            await apiFetch(`/admin/permissions/${role.role_id}`, {
                method: "PUT",
                body: { permissions: Array.from(draft[role.role_id]) },
            });

            await load();

            if (user?.role === role.role_name) {
                await refresh();
                setNotice(`Saved. Those are your own role's permissions — this page now reflects the new set.`);
            } else {
                setNotice(`Saved ${role.role_name}. It applies to their next request, no re-login needed.`);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setSavingRoleId(null);
        }
    };

    const reset = (roleId) => {
        setNotice(null);
        setDraft((previous) => ({ ...previous, [roleId]: new Set(saved[roleId]) }));
    };

    return (
        <Panel
            title="Permission matrix"
            permission="permissions:manage"
            description="Permissions are rows in the database, not constants in the code. Edits take effect on the next request."
            probe={() => apiFetch("/admin/permissions")}
        >
            {loading ? (
                <p className="text-sm text-gray-400">Loading the matrix…</p>
            ) : (
                <div className="space-y-4">
                    {error && (
                        <p role="alert" className="rounded border border-red-500/40 bg-red-900/30 px-4 py-2 text-sm text-red-300">
                            {error}
                        </p>
                    )}

                    {notice && (
                        <p className="rounded border border-blue-500/40 bg-blue-900/20 px-4 py-2 text-sm text-blue-200">
                            {notice}
                        </p>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-gray-700">
                                    <th className="p-2 text-left font-semibold text-gray-300">Role</th>
                                    {available.map((permission) => (
                                        <th
                                            key={permission.code}
                                            title={permission.description}
                                            className="p-2 text-center font-mono text-xs font-normal text-gray-400"
                                        >
                                            {permission.code}
                                        </th>
                                    ))}
                                    <th className="p-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((role) => (
                                    <tr key={role.role_id} className="border-b border-gray-800 last:border-0">
                                        <td className="p-2 font-semibold text-gray-200">
                                            {role.role_name}
                                            {user?.role === role.role_name && (
                                                <span className="ml-2 rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
                                                    you
                                                </span>
                                            )}
                                        </td>

                                        {available.map((permission) => (
                                            <td key={permission.code} className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={draft[role.role_id]?.has(permission.code) ?? false}
                                                    onChange={() => toggle(role.role_id, permission.code)}
                                                    aria-label={`${role.role_name} — ${permission.code}`}
                                                    className="h-4 w-4 accent-blue-500"
                                                />
                                            </td>
                                        ))}

                                        <td className="p-2 text-right whitespace-nowrap">
                                            <button
                                                type="button"
                                                onClick={() => reset(role.role_id)}
                                                disabled={!isDirty(role.role_id) || savingRoleId === role.role_id}
                                                className="mr-2 rounded border border-gray-600 px-3 py-1 text-xs transition-colors hover:bg-gray-700 disabled:opacity-30"
                                            >
                                                Reset
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => save(role)}
                                                disabled={!isDirty(role.role_id) || savingRoleId === role.role_id}
                                                className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-600"
                                            >
                                                {savingRoleId === role.role_id ? "Saving…" : "Save"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <p className="text-xs text-gray-500">
                        Supervisor cannot drop <code className="font-mono">permissions:manage</code> — the server
                        rejects that edit so nobody can lock everyone out of this screen.
                    </p>
                </div>
            )}
        </Panel>
    );
}
