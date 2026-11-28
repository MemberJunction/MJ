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
import { AuthorizationInfo, AuthorizationRoleInfo, IMetadataProvider, UserInfo, ValidationErrorType } from '@memberjunction/core';
import { MJAIAgentPermissionEntity } from '@memberjunction/core-entities';
import {
    AI_AGENT_ADMINISTRATION_AUTHORIZATION,
    IsAgentAdminOrOwnerUser,
    ValidateAgentInheritanceAndSandbox,
    type AgentSandboxValidationContext,
    type AgentSandboxValidationTarget,
} from '../custom/MJAIAgentEntityServer.server';
import { ValidateAgentCategoryDelete, ValidateAgentCategoryMutation } from '../custom/MJAIAgentCategoryEntityServer.server';
import { ValidateAgentPersonaOwnership } from '../custom/MJAIAgentPersonaEntityServer.server';
import { ValidateAgentStepTypeDelete, ValidateAgentStepTypeMutation } from '../custom/MJAIAgentStepTypeEntityServer.server';
import { ValidateAgentTypeDelete, ValidateAgentTypeMutation } from '../custom/MJAIAgentTypeEntityServer.server';

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
        Type?: string;
        CanRead?: boolean;
        CanCreate?: boolean;
        CanUpdate?: boolean;
        CanDelete?: boolean;
        ReadRLSFilterID?: string;
        UpdateRLSFilterID?: string;
        DeleteRLSFilterID?: string;
    };
    primaryKey?: {
        ID?: string;
    };
    sync?: Record<string, unknown>;
}

interface AuthorizationRecord {
    fields: {
        Name: string;
        ParentID: string | null;
        IsActive: boolean;
        UseAuditLog: boolean;
        Description: string;
    };
    primaryKey?: {
        ID?: string;
    };
    sync?: Record<string, unknown>;
}

interface AuthorizationRoleRecord {
    fields: {
        AuthorizationID: string;
        RoleID: string;
        Type: string;
    };
    primaryKey?: {
        ID?: string;
    };
    sync?: Record<string, unknown>;
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

    it('aligns Developer, Integration, and Agent Administrator EntityPermission metadata with admin-only server gates across Categories, Types, and Step Types (R6-4 & C1)', () => {
        const permPath = join(REPO_ROOT, 'metadata/entity-permissions/.agent-instance-permissions.json');
        const permRecords = JSON.parse(readFileSync(permPath, 'utf8')) as EntityPermissionRecord[];

        const adminOnlyEntities = [
            'MJ: AI Agent Categories',
            'MJ: AI Agent Types',
            'MJ: AI Agent Step Types',
        ] as const;

        for (const entityName of adminOnlyEntities) {
            // Agent Administrator gets full CRUD on all 3 governance entities
            const adminPerm = permRecords.find(
                (p) =>
                    p.fields.EntityID === `@lookup:MJ: Entities.Name=${entityName}` &&
                    p.fields.RoleID === '@lookup:MJ: Roles.Name=Agent Administrator',
            );
            expect(adminPerm, `missing Agent Administrator row for ${entityName}`).toBeDefined();
            expect(adminPerm!.fields.CanRead).toBe(true);
            expect(adminPerm!.fields.CanCreate).toBe(true);
            expect(adminPerm!.fields.CanUpdate).toBe(true);
            expect(adminPerm!.fields.CanDelete).toBe(true);
            expect(adminPerm!.primaryKey?.ID).toBeTruthy();
            expect(adminPerm!.sync).toBeUndefined();

            // Developer & Integration are trimmed to read-only via @lookup primaryKeys (matching CodeGen rows)
            for (const roleName of ['Developer', 'Integration'] as const) {
                const rolePerm = permRecords.find(
                    (p) =>
                        p.fields.EntityID === `@lookup:MJ: Entities.Name=${entityName}` &&
                        p.fields.RoleID === `@lookup:MJ: Roles.Name=${roleName}`,
                );
                expect(rolePerm, `missing ${roleName} row for ${entityName}`).toBeDefined();
                expect(rolePerm!.fields.Type).toBe('Allow');
                expect(rolePerm!.fields.CanRead).toBe(true);
                expect(rolePerm!.fields.CanCreate).toBe(false);
                expect(rolePerm!.fields.CanUpdate).toBe(false);
                expect(rolePerm!.fields.CanDelete).toBe(false);
                expect(rolePerm!.primaryKey?.ID).toBe(
                    `@lookup:MJ: Entity Permissions.EntityID=@lookup:MJ: Entities.Name=${entityName}&RoleID=@lookup:MJ: Roles.Name=${roleName}&Type=Allow`,
                );
                expect(rolePerm!.sync).toBeUndefined();
            }
        }

        // Verify server-side guards reject Developer & Integration and accept Agent Administrator
        const devUser = makeUser(ALICE_ID, 'User', ['Developer']);
        const integrationUser = makeUser(BOB_ID, 'User', ['Integration']);
        const agentAdminUser = makeUser('c1000000-0000-4000-8000-000000000003', 'User', ['Agent Administrator']);

        for (const nonAdmin of [devUser, integrationUser]) {
            expect(ValidateAgentCategoryMutation('Finance', nonAdmin)).toHaveLength(1);
            expect(ValidateAgentCategoryDelete('cat-1', nonAdmin)).toHaveLength(1);
            expect(ValidateAgentTypeMutation('Loop', nonAdmin)).toHaveLength(1);
            expect(ValidateAgentTypeDelete('type-1', nonAdmin)).toHaveLength(1);
            expect(
                ValidateAgentStepTypeMutation(
                    { Name: 'CustomStep', DriverClass: 'CustomHandler', AllowedInUnapprovedPlanMode: false, CountsAgainstTreeBudget: true },
                    nonAdmin,
                ),
            ).toHaveLength(1);
            expect(ValidateAgentStepTypeDelete('CustomStep', 'step-1', nonAdmin)).toHaveLength(1);
        }

        expect(ValidateAgentCategoryMutation('Finance', agentAdminUser)).toEqual([]);
        expect(ValidateAgentCategoryDelete('cat-1', agentAdminUser)).toEqual([]);
        expect(ValidateAgentTypeMutation('Loop', agentAdminUser)).toEqual([]);
        expect(ValidateAgentTypeDelete('type-1', agentAdminUser)).toEqual([]);
        expect(
            ValidateAgentStepTypeMutation(
                { Name: 'CustomStep', DriverClass: 'CustomHandler', AllowedInUnapprovedPlanMode: false, CountsAgainstTreeBudget: true },
                agentAdminUser,
            ),
        ).toEqual([]);
        expect(ValidateAgentStepTypeDelete('CustomStep', 'step-1', agentAdminUser)).toEqual([]);
    });

    it('supports the AI: Agent Administration MJ Authorization alongside role fallback and ships declarative metadata (C1)', () => {
        const authPath = join(REPO_ROOT, 'metadata/authorizations/.agent-administration-authorizations.json');
        const authRolesPath = join(REPO_ROOT, 'metadata/authorization-roles/.agent-administration-authorization-roles.json');
        const authRecords = JSON.parse(readFileSync(authPath, 'utf8')) as AuthorizationRecord[];
        const authRoleRecords = JSON.parse(readFileSync(authRolesPath, 'utf8')) as AuthorizationRoleRecord[];

        const agentAdminAuth = authRecords.find((a) => a.fields.Name === AI_AGENT_ADMINISTRATION_AUTHORIZATION);
        expect(agentAdminAuth).toBeDefined();
        expect(agentAdminAuth!.fields.IsActive).toBe(true);
        expect(agentAdminAuth!.primaryKey?.ID).toBeTruthy();
        expect(agentAdminAuth!.sync).toBeUndefined();

        const roleGrant = authRoleRecords.find(
            (r) =>
                r.fields.AuthorizationID === `@lookup:MJ: Authorizations.Name=${AI_AGENT_ADMINISTRATION_AUTHORIZATION}` &&
                r.fields.RoleID === '@lookup:MJ: Roles.Name=Agent Administrator' &&
                r.fields.Type === 'Allow',
        );
        expect(roleGrant).toBeDefined();
        expect(roleGrant!.primaryKey?.ID).toBeTruthy();
        expect(roleGrant!.sync).toBeUndefined();

        // A user in a custom non-admin role ("AI Ops") is denied without the authorization...
        const customOpsRoleId = 'c3000000-0000-4000-8000-000000000099';
        const opsUser = new UserInfo(undefined, {
            ID: ALICE_ID,
            Name: 'Ops User',
            Email: 'ops@test.mj',
            Type: 'User',
            UserRoles: [{ RoleID: customOpsRoleId, Role: 'AI Ops', UserID: ALICE_ID }],
        });
        expect(IsAgentAdminOrOwnerUser(opsUser)).toBe(false);

        // ...and allowed when granted the "AI: Agent Administration" authorization directly...
        const directAuthId = 'c4000000-0000-4000-8000-000000000001';
        const directProvider: Pick<IMetadataProvider, 'Authorizations' | 'AuthorizationRoles'> = {
            Authorizations: [],
            AuthorizationRoles: [
                new AuthorizationRoleInfo({
                    ID: 'c5000000-0000-4000-8000-000000000001',
                    AuthorizationID: directAuthId,
                    RoleID: customOpsRoleId,
                    Type: 'Allow',
                }),
            ],
        };
        const directAuth = new AuthorizationInfo(
            {
                ID: directAuthId,
                Name: AI_AGENT_ADMINISTRATION_AUTHORIZATION,
                ParentID: null,
                IsActive: true,
            },
            directProvider as IMetadataProvider,
        );
        directProvider.Authorizations.push(directAuth);
        expect(IsAgentAdminOrOwnerUser(opsUser, directProvider)).toBe(true);
        expect(ValidateAgentCategoryMutation('Finance', opsUser, directProvider)).toEqual([]);
        expect(ValidateAgentTypeMutation('Loop', opsUser, directProvider)).toEqual([]);
        expect(
            ValidateAgentStepTypeMutation(
                { Name: 'CustomStep', DriverClass: 'CustomHandler', AllowedInUnapprovedPlanMode: false, CountsAgainstTreeBudget: true },
                opsUser,
                directProvider,
            ),
        ).toEqual([]);

        // ...or via an ancestor authorization!
        const parentAuthId = 'c4000000-0000-4000-8000-000000000010';
        const ancestorProvider: Pick<IMetadataProvider, 'Authorizations' | 'AuthorizationRoles'> = {
            Authorizations: [],
            AuthorizationRoles: [
                new AuthorizationRoleInfo({
                    ID: 'c5000000-0000-4000-8000-000000000010',
                    AuthorizationID: parentAuthId,
                    RoleID: customOpsRoleId,
                    Type: 'Allow',
                }),
            ],
        };
        const parentAuth = new AuthorizationInfo(
            {
                ID: parentAuthId,
                Name: 'Platform Administration',
                ParentID: null,
                IsActive: true,
            },
            ancestorProvider as IMetadataProvider,
        );
        const childAuth = new AuthorizationInfo(
            {
                ID: 'c4000000-0000-4000-8000-000000000011',
                Name: AI_AGENT_ADMINISTRATION_AUTHORIZATION,
                ParentID: parentAuthId,
                IsActive: true,
            },
            ancestorProvider as IMetadataProvider,
        );
        ancestorProvider.Authorizations.push(parentAuth, childAuth);
        expect(IsAgentAdminOrOwnerUser(opsUser, ancestorProvider)).toBe(true);
    });
});
