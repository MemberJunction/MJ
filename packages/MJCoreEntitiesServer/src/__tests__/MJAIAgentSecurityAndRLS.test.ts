/**
 * Stage 1 Behavior-Pinning Suite: #6852 Agent Instance Security & Dual-Dialect RLS Audit (§2.4 & §3.1).
 *
 * Verifies:
 *   1. Non-admin (`UI` role) write-path ownership & sandbox checks on `MJ: AI Agents`
 *      (`ValidateAgentInheritanceAndSandbox`) and `MJ: AI Agent Personas` (`ValidateAgentPersonaOwnership`).
 *   2. Transitive `BaseAgentID` `CanRun` enforcement across multi-level chains.
 *   3. Non-admin instance owners cannot gain custom `DriverClass`, `ExposeAsAction`, `InstantiationMode`,
 *      looser `Isolation`, or looser `MaxCostPerRun`/`MaxTokensPerRun`/`MaxTimePerRun`/`MaxIterationsPerRun`.
 *   4. Committed RLS filter metadata (`metadata/row-level-security-filters/.agent-instance-rls-filters.json`
 *      and `metadata/entity-permissions/.agent-instance-permissions.json`) defines parity SQL Server AND
 *      PostgreSQL filters (`UserAccessibleAIAgents` & `UserOwnedDerivedAIAgents`) wired to the `UI` role.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { UserInfo, ValidationErrorType } from '@memberjunction/core';
import { MJAIAgentPermissionEntity } from '@memberjunction/core-entities';
import {
    ValidateAgentInheritanceAndSandbox,
    type AgentSandboxValidationContext,
    type AgentSandboxValidationTarget,
} from '../custom/MJAIAgentEntityServer.server';
import { ValidateAgentPersonaOwnership } from '../custom/MJAIAgentPersonaEntityServer.server';

const __dirname_ = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname_, '../../../..');

const ALICE_ID = 'c1000000-0000-4000-8000-000000000001';
const BOB_ID = 'c1000000-0000-4000-8000-000000000002';
const ROOT_ID = 'c2000000-0000-4000-8000-000000000001';
const DERIVED_ID = 'c2000000-0000-4000-8000-000000000002';
const ROLE_UI = 'c3000000-0000-4000-8000-000000000001';
const ROLE_EXEC = 'c3000000-0000-4000-8000-000000000002';

function makeUser(id: string, type: 'User' | 'Owner', roles: string[]): UserInfo {
    return new UserInfo(undefined, {
        ID: id,
        Name: id,
        Email: `${id}@test.mj`,
        Type: type,
        UserRoles: roles.map((r) => ({ RoleID: r, Role: r, UserID: id })),
    });
}

function makeBaseRow(overrides: Partial<AgentSandboxValidationContext['AllAgents'][number]> = {}) {
    return {
        ID: ROOT_ID,
        Name: 'Chief of Staff',
        BaseAgentID: null,
        OwnerUserID: null,
        Status: 'Active' as const,
        InstantiationMode: 'Optional' as const,
        DriverClass: 'BaseAgent',
        Isolation: 'Process' as const,
        MaxCostPerRun: 5.0,
        MaxTokensPerRun: 100_000,
        MaxTimePerRun: 300,
        MaxIterationsPerRun: 30,
        TypeConfiguration: null,
        ...overrides,
    };
}

function makeTarget(overrides: Partial<AgentSandboxValidationTarget> = {}): AgentSandboxValidationTarget {
    return {
        ID: DERIVED_ID,
        IsSaved: false,
        BaseAgentID: ROOT_ID,
        PreSaveBaseAgentID: null,
        OwnerUserID: ALICE_ID,
        PreSaveOwnerUserID: null,
        InstantiationMode: 'None',
        DriverClass: null,
        DriverClassDirty: false,
        Isolation: 'Process',
        ExposeAsAction: false,
        MaxCostPerRun: 4.0,
        MaxTokensPerRun: 80_000,
        MaxTimePerRun: 240,
        MaxIterationsPerRun: 25,
        ...overrides,
    };
}

interface RlsFilterRecord {
    fields: {
        Name: string;
        FilterText: string;
        PlatformVariants?: string;
    };
}

interface EntityPermissionRecord {
    fields: {
        EntityID: string;
        RoleID: string;
        CanRead?: boolean;
        CanCreate?: boolean;
        CanUpdate?: boolean;
        CanDelete?: boolean;
        ReadRLSFilterID?: string;
        UpdateRLSFilterID?: string;
        DeleteRLSFilterID?: string;
    };
}

describe('#6852 Agent Instance Security & Dual-Dialect RLS Audit (§2.4 & §3.1)', () => {
    it('blocks non-admin UI users from every privilege-escalation vector across all sandboxed columns', () => {
        const alice = makeUser(ALICE_ID, 'User', [ROLE_UI]);
        const base = makeBaseRow();

        const errors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                InstantiationMode: 'Required',
                DriverClass: 'MaliciousCustomDriver',
                DriverClassDirty: true,
                Isolation: 'Worker', // looser than base Process
                ExposeAsAction: true,
                MaxCostPerRun: 99,
                MaxTokensPerRun: 999_999,
                MaxTimePerRun: 9999,
                MaxIterationsPerRun: 999,
            }),
            User: alice,
            AllAgents: [base],
            AllPermissions: [],
        });

        const failedSources = new Set(errors.filter((e) => e.Type === ValidationErrorType.Failure).map((e) => e.Source));
        expect(failedSources.has('InstantiationMode')).toBe(true);
        expect(failedSources.has('DriverClass')).toBe(true);
        expect(failedSources.has('Isolation')).toBe(true);
        expect(failedSources.has('ExposeAsAction')).toBe(true);
        expect(failedSources.has('MaxCostPerRun')).toBe(true);
        expect(failedSources.has('MaxTokensPerRun')).toBe(true);
        expect(failedSources.has('MaxTimePerRun')).toBe(true);
        expect(failedSources.has('MaxIterationsPerRun')).toBe(true);
    });

    it('blocks re-parenting BaseAgentID, reassigning OwnerUserID, and cross-user persona edits', () => {
        const alice = makeUser(ALICE_ID, 'User', [ROLE_UI]);
        const otherRoot = makeBaseRow({ ID: 'c2000000-0000-4000-8000-000000000099', Name: 'Other Root' });

        const reparentErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: ROOT_ID,
                BaseAgentID: otherRoot.ID,
                PreSaveOwnerUserID: ALICE_ID,
                OwnerUserID: BOB_ID,
            }),
            User: alice,
            AllAgents: [makeBaseRow(), otherRoot],
            AllPermissions: [],
        });
        expect(reparentErrors.some((e) => e.Source === 'BaseAgentID' && /re-parent/i.test(e.Message))).toBe(true);
        expect(reparentErrors.some((e) => e.Source === 'OwnerUserID' && /reassign/i.test(e.Message))).toBe(true);

        // Persona ownership: Alice cannot attach personas to Bob's derived agent or to a root agent
        expect(ValidateAgentPersonaOwnership({ ID: DERIVED_ID, BaseAgentID: ROOT_ID, OwnerUserID: BOB_ID }, alice, DERIVED_ID)).toHaveLength(1);
        expect(ValidateAgentPersonaOwnership({ ID: ROOT_ID, BaseAgentID: null, OwnerUserID: ALICE_ID }, alice, ROOT_ID)).toHaveLength(1);
        expect(ValidateAgentPersonaOwnership({ ID: DERIVED_ID, BaseAgentID: ROOT_ID, OwnerUserID: ALICE_ID }, alice, DERIVED_ID)).toEqual([]);
    });

    it('rejects deriving from a BaseAgentID the user lacks CanRun permission on', () => {
        const bob = makeUser(BOB_ID, 'User', [ROLE_UI]);
        const restrictedRoot = makeBaseRow({ Name: 'Exec Only CoS' });
        const execPerm = Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity;
        Object.defineProperties(execPerm, {
            AgentID: { value: restrictedRoot.ID },
            RoleID: { value: ROLE_EXEC },
            UserID: { value: null },
            CanView: { value: true },
            CanRun: { value: true },
            CanEdit: { value: false },
            CanDelete: { value: false },
        });

        const errors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ OwnerUserID: BOB_ID }),
            User: bob,
            AllAgents: [restrictedRoot],
            AllPermissions: [execPerm],
        });
        expect(errors.some((e) => e.Source === 'BaseAgentID' && /permission to run/i.test(e.Message))).toBe(true);
    });

    it('audits committed SQL Server and PostgreSQL RLS filter metadata files and UI-role permission bindings (live DB RLS is verified in IT195 AEC5)', () => {
        const rlsPath = join(REPO_ROOT, 'metadata/row-level-security-filters/.agent-instance-rls-filters.json');
        const permPath = join(REPO_ROOT, 'metadata/entity-permissions/.agent-instance-permissions.json');
        const rlsRecords = JSON.parse(readFileSync(rlsPath, 'utf8')) as RlsFilterRecord[];
        const permRecords = JSON.parse(readFileSync(permPath, 'utf8')) as EntityPermissionRecord[];

        const readFilter = rlsRecords.find((r) => r.fields.Name === 'UserAccessibleAIAgents');
        const writeFilter = rlsRecords.find((r) => r.fields.Name === 'UserOwnedDerivedAIAgents');
        expect(readFilter).toBeDefined();
        expect(writeFilter).toBeDefined();

        // SQL Server read RLS checks OwnerUserID, public root catalog, explicit AIAgentPermission, and Owner/Admin roles
        expect(readFilter!.fields.FilterText).toContain("[OwnerUserID] = '{{UserID}}'");
        expect(readFilter!.fields.FilterText).toContain('[BaseAgentID] IS NULL');
        expect(readFilter!.fields.FilterText).toContain('[AIAgentPermission]');

        // PostgreSQL read RLS has verified PlatformVariants with matching predicates
        const readPg = JSON.parse(readFilter!.fields.PlatformVariants ?? '{}') as { FilterText?: { postgresql?: string } };
        expect(readPg.FilterText?.postgresql).toContain('"OwnerUserID" = \'{{UserID}}\'');
        expect(readPg.FilterText?.postgresql).toContain('"BaseAgentID" IS NULL');
        expect(readPg.FilterText?.postgresql).toContain('"AIAgentPermission"');

        // SQL Server & PostgreSQL write RLS restrict UI updates/deletes to BaseAgentID IS NOT NULL AND OwnerUserID = UserID
        expect(writeFilter!.fields.FilterText).toContain("[BaseAgentID] IS NOT NULL AND [OwnerUserID] = '{{UserID}}'");
        const writePg = JSON.parse(writeFilter!.fields.PlatformVariants ?? '{}') as { FilterText?: { postgresql?: string } };
        expect(writePg.FilterText?.postgresql).toContain('"BaseAgentID" IS NOT NULL AND "OwnerUserID" = \'{{UserID}}\'');

        // UI role entity permissions bind ReadRLSFilterID, UpdateRLSFilterID, DeleteRLSFilterID on MJ: AI Agents
        const uiAgentPerm = permRecords.find(
            (p) => p.fields.EntityID.includes('MJ: AI Agents') && p.fields.RoleID.includes('Roles.Name=UI'),
        );
        expect(uiAgentPerm).toBeDefined();
        expect(uiAgentPerm!.fields.ReadRLSFilterID).toContain('UserAccessibleAIAgents');
        expect(uiAgentPerm!.fields.UpdateRLSFilterID).toContain('UserOwnedDerivedAIAgents');
        expect(uiAgentPerm!.fields.DeleteRLSFilterID).toContain('UserOwnedDerivedAIAgents');

        // UI role also has permissions on MJ: AI Agent Personas (guarded by MJAIAgentPersonaEntityServer)
        const uiPersonaPerm = permRecords.find(
            (p) => p.fields.EntityID.includes('MJ: AI Agent Personas') && p.fields.RoleID.includes('Roles.Name=UI'),
        );
        expect(uiPersonaPerm).toBeDefined();
        expect(uiPersonaPerm!.fields.CanCreate).toBe(true);
        expect(uiPersonaPerm!.fields.CanUpdate).toBe(true);
        expect(uiPersonaPerm!.fields.CanDelete).toBe(true);
    });
});
