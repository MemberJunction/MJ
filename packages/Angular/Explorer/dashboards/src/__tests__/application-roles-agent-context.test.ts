/**
 * Tests for the Application Roles dashboard's pure agent helpers:
 * - buildApplicationRolesAgentContext: matrix-surface state snapshot → agent context object
 * - resolveApplicationByIdOrName: tolerant id→name→contains application resolver
 * - buildApplicationRolesCsv: read-only matrix → CSV serializer
 *
 * 🔒 SAFETY: every helper is READ-ONLY — it shapes display state, resolves a reference,
 * or serializes the visible matrix. None mutates a permission. The final block asserts no
 * CanAccess/CanAdmin permission flag is ever streamed into the agent context.
 */
import { describe, it, expect } from 'vitest';
import {
    buildApplicationNotFoundError,
    buildApplicationRolesAgentContext,
    buildApplicationRolesCsv,
    resolveApplicationByIdOrName,
    ApplicationRolesAgentContextInput,
    AGENT_CONTEXT_ID_LIST_CAP,
    AGENT_CONTEXT_NAME_LIST_CAP,
} from '../ApplicationRoles/application-roles-agent-context';

function makeInput(overrides: Partial<ApplicationRolesAgentContextInput> = {}): ApplicationRolesAgentContextInput {
    return {
        ApplicationGroupCount: 3,
        TotalRoleAssignmentCount: 7,
        HasUnsavedChanges: false,
        IsLoading: false,
        ExpandedApplicationIds: [],
        ApplicationSummaries: [],
        SelectedApplicationId: null,
        SelectedApplicationName: null,
        SelectedApplicationRoleNames: [],
        AvailableRoleCount: 12,
        ...overrides,
    };
}

describe('buildApplicationRolesAgentContext', () => {
    it('passes through the salient matrix-surface fields', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({
            ApplicationGroupCount: 5,
            TotalRoleAssignmentCount: 12,
            HasUnsavedChanges: true,
            IsLoading: false,
            ExpandedApplicationIds: ['APP-1', 'APP-2'],
            AvailableRoleCount: 9,
        }));
        expect(ctx['ApplicationGroupCount']).toBe(5);
        expect(ctx['TotalRoleAssignmentCount']).toBe(12);
        expect(ctx['HasUnsavedChanges']).toBe(true);
        expect(ctx['IsLoading']).toBe(false);
        expect(ctx['ExpandedApplicationIds']).toEqual(['APP-1', 'APP-2']);
        expect(ctx['AvailableRoleCount']).toBe(9);
    });

    it('publishes a bounded Applications summary and selected-app roles', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({
            ApplicationSummaries: [
                { ApplicationID: 'APP-1', ApplicationName: 'Admin', RoleCount: 2, Expanded: true },
                { ApplicationID: 'APP-2', ApplicationName: 'AI', RoleCount: 0, Expanded: false },
            ],
            SelectedApplicationId: 'APP-1',
            SelectedApplicationName: 'Admin',
            SelectedApplicationRoleNames: ['Administrator', 'Developer'],
        }));
        expect((ctx['Applications'] as unknown[]).length).toBe(2);
        expect(ctx['SelectedApplicationName']).toBe('Admin');
        expect(ctx['SelectedApplicationRoles']).toEqual(['Administrator', 'Developer']);
    });

    it('omits the truncation-count field when the expanded list is within the cap', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({
            ExpandedApplicationIds: ['APP-1', 'APP-2', 'APP-3'],
        }));
        expect(ctx['ExpandedApplicationCount']).toBeUndefined();
        expect((ctx['ExpandedApplicationIds'] as string[]).length).toBe(3);
    });

    it('caps the expanded-id list and reports the true total when over the cap', () => {
        const ids = Array.from({ length: AGENT_CONTEXT_ID_LIST_CAP + 10 }, (_, i) => `APP-${i}`);
        const ctx = buildApplicationRolesAgentContext(makeInput({ ExpandedApplicationIds: ids }));
        expect((ctx['ExpandedApplicationIds'] as string[]).length).toBe(AGENT_CONTEXT_ID_LIST_CAP);
        expect(ctx['ExpandedApplicationCount']).toBe(AGENT_CONTEXT_ID_LIST_CAP + 10);
    });

    it('caps the Applications summary list and flags truncation', () => {
        const apps = Array.from({ length: AGENT_CONTEXT_NAME_LIST_CAP + 3 }, (_, i) => ({
            ApplicationID: `APP-${i}`, ApplicationName: `App ${i}`, RoleCount: i, Expanded: false,
        }));
        const ctx = buildApplicationRolesAgentContext(makeInput({ ApplicationSummaries: apps }));
        expect((ctx['Applications'] as unknown[]).length).toBe(AGENT_CONTEXT_NAME_LIST_CAP);
        expect(ctx['ApplicationListTruncated']).toBe(true);
    });

    it('reflects the loading flag', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({ IsLoading: true }));
        expect(ctx['IsLoading']).toBe(true);
    });
});

describe('resolveApplicationByIdOrName', () => {
    const candidates = [
        { ApplicationID: 'APP-1', ApplicationName: 'Admin' },
        { ApplicationID: 'APP-2', ApplicationName: 'AI Dashboard' },
    ];
    it('matches by exact ID (case-insensitive)', () => {
        expect(resolveApplicationByIdOrName('app-1', candidates)?.ApplicationName).toBe('Admin');
    });
    it('matches by exact name then partial contains', () => {
        expect(resolveApplicationByIdOrName('  ai dashboard ', candidates)?.ApplicationID).toBe('APP-2');
        expect(resolveApplicationByIdOrName('ai', candidates)?.ApplicationID).toBe('APP-2');
    });
    it('returns null on a miss / empty', () => {
        expect(resolveApplicationByIdOrName('nope', candidates)).toBeNull();
        expect(resolveApplicationByIdOrName('  ', candidates)).toBeNull();
    });
    it('builds a tolerant not-found error echoing names', () => {
        expect(buildApplicationNotFoundError('zz', candidates)).toContain('Admin');
    });
});

describe('buildApplicationRolesCsv', () => {
    it('emits a header and one row per assignment with Yes/No flags', () => {
        const csv = buildApplicationRolesCsv([
            { ApplicationName: 'Admin', RoleName: 'Administrator', CanAccess: true, CanAdmin: true },
            { ApplicationName: 'AI', RoleName: '(open access)', CanAccess: true, CanAdmin: false },
        ]);
        const lines = csv.split('\n');
        expect(lines[0]).toBe('"Application","Role","CanAccess","CanAdmin"');
        expect(lines[1]).toBe('"Admin","Administrator","Yes","Yes"');
        expect(lines[2]).toBe('"AI","(open access)","Yes","No"');
    });
    it('escapes embedded quotes', () => {
        const csv = buildApplicationRolesCsv([{ ApplicationName: 'A "B"', RoleName: 'R', CanAccess: false, CanAdmin: false }]);
        expect(csv).toContain('"A ""B"""');
    });
});

describe('Application Roles context safety — no permission flags leak', () => {
    it('does not stream CanAccess/CanAdmin or any grant/revoke field into context', () => {
        const ctx = buildApplicationRolesAgentContext(makeInput({
            ApplicationSummaries: [{ ApplicationID: 'APP-1', ApplicationName: 'Admin', RoleCount: 2, Expanded: true }],
            SelectedApplicationId: 'APP-1',
            SelectedApplicationName: 'Admin',
            SelectedApplicationRoleNames: ['Administrator'],
        }));
        const blob = JSON.stringify(ctx);
        expect(blob).not.toMatch(/CanAccess|CanAdmin|grant|revoke|password|secret|token/i);
    });
});
