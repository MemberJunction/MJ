import { describe, it, expect, beforeEach } from 'vitest';
import { GetGlobalObjectStore } from '@memberjunction/global';
import { DashboardEngine } from '../engines/dashboards';

/**
 * `GetDashboardPermissions` answers a security question from an in-memory cache. When that cache
 * was never loaded it previously returned "no permissions", making an UNCONFIGURED engine
 * indistinguishable from a genuine denial.
 *
 * That is not a theoretical concern: `mj sync push` runs `StartupManager` in `'task'` mode, which
 * skips engine pre-warm, so every dashboard push was denied with "You do not have permission to
 * edit this dashboard" — a message that sent people looking for a permissions problem that did
 * not exist.
 *
 * Reporting the state distinctly is DIAGNOSTIC, not permissive. Grants stay false, so callers that
 * gate on `CanEdit`/`CanDelete` still fail closed; the source merely lets them say WHY. The gates
 * in `MJDashboardEntityExtended` load the engine before consulting it and then honour the real
 * answer — see MJDashboardEntityExtended.gates.test.ts — so the CLI passes on genuine ownership
 * rather than on an exemption, and an unloaded engine inside MJAPI denies rather than waves through.
 */
function resetEngine(): void {
    const g = GetGlobalObjectStore();
    const key = '___SINGLETON__DashboardEngine';
    if (g && g[key]) {
        delete g[key];
    }
}

describe('DashboardEngine.GetDashboardPermissions — unconfigured engine', () => {
    beforeEach(() => {
        resetEngine();
    });

    it('reports that it could not evaluate, rather than silently denying', () => {
        const engine = DashboardEngine.Instance;
        expect(engine.Loaded).toBe(false);

        const perms = engine.GetDashboardPermissions(
            'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            'ffffffff-1111-2222-3333-444444444444'
        );

        // The caller must be able to tell "I don't know" from "no".
        expect(perms.PermissionSource).toBe('unevaluated');
    });

    it('still grants nothing when it cannot evaluate — unevaluated is not an escalation', () => {
        const perms = DashboardEngine.Instance.GetDashboardPermissions(
            'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            'ffffffff-1111-2222-3333-444444444444'
        );
        expect(perms.CanEdit).toBe(false);
        expect(perms.CanDelete).toBe(false);
        expect(perms.CanShare).toBe(false);
        expect(perms.IsOwner).toBe(false);
    });
});
