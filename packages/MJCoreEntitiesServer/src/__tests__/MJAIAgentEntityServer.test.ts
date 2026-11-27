/**
 * Unit tests for the PURE validation core behind `MJAIAgentEntityServer.ValidateAsync` —
 * the `TypeConfiguration ⊨ ConfigSchema` invariant. Follows the package's exported-pure-function
 * test style (entity instantiation needs live metadata, so the DB-coupled wrapper is thin and
 * the matrix lives here).
 */
import { describe, it, expect } from 'vitest';
import { UserInfo, ValidationErrorType } from '@memberjunction/core';
import { MJAIAgentPermissionEntity } from '@memberjunction/core-entities';
import {
    BuildTypeConfigurationValidationErrors,
    ValidateAgentInheritanceAndSandbox,
    type AgentSandboxValidationContext,
    type AgentSandboxValidationTarget,
} from '../custom/MJAIAgentEntityServer.server';
import { ValidateAgentPersonaOwnership } from '../custom/MJAIAgentPersonaEntityServer.server';

const SCHEMA = JSON.stringify({
    type: 'object',
    required: ['realtime'],
    properties: {
        realtime: {
            type: 'object',
            properties: {
                modelPreference: { type: 'string' },
                allowUserModelOverride: { type: 'boolean' },
                narration: { type: 'object', properties: { paceMs: { type: 'integer' } } },
            },
        },
    },
});

describe('BuildTypeConfigurationValidationErrors', () => {
    it('accepts a conforming configuration', () => {
        const config = JSON.stringify({ realtime: { modelPreference: 'GPT Realtime', narration: { paceMs: 5000 } } });
        expect(BuildTypeConfigurationValidationErrors(config, SCHEMA)).toEqual([]);
    });

    it('FAILS on unparseable TypeConfiguration JSON', () => {
        const errors = BuildTypeConfigurationValidationErrors('{broken', SCHEMA);
        expect(errors).toHaveLength(1);
        expect(errors[0].Source).toBe('TypeConfiguration');
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(errors[0].Message).toMatch(/not valid JSON/i);
    });

    it('FAILS on non-object TypeConfiguration (arrays and scalars)', () => {
        for (const payload of ['[1,2]', '"string"', '42', 'null']) {
            const errors = BuildTypeConfigurationValidationErrors(payload, SCHEMA);
            expect(errors).toHaveLength(1);
            expect(errors[0].Type).toBe(ValidationErrorType.Failure);
            expect(errors[0].Message).toMatch(/must be a JSON object/i);
        }
    });

    it('is freeform (no errors) when the type publishes NO schema', () => {
        const config = JSON.stringify({ anything: { goes: true } });
        expect(BuildTypeConfigurationValidationErrors(config, null)).toEqual([]);
        expect(BuildTypeConfigurationValidationErrors(config, '')).toEqual([]);
        expect(BuildTypeConfigurationValidationErrors(config, '   ')).toEqual([]);
    });

    it('still rejects non-object configuration even without a schema', () => {
        const errors = BuildTypeConfigurationValidationErrors('[1]', null);
        expect(errors).toHaveLength(1);
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
    });

    it('WARNS (does not fail) on an unparseable ConfigSchema — a metadata bug must not brick agent saves', () => {
        const config = JSON.stringify({ realtime: {} });
        for (const badSchema of ['{broken', '[1,2]', '"schema"']) {
            const errors = BuildTypeConfigurationValidationErrors(config, badSchema);
            expect(errors).toHaveLength(1);
            expect(errors[0].Type).toBe(ValidationErrorType.Warning);
            expect(errors[0].Message).toMatch(/ConfigSchema/);
        }
    });

    it('FAILS per schema violation with the JSON-path location', () => {
        const config = JSON.stringify({ realtime: { allowUserModelOverride: 'yes', narration: { paceMs: 'fast' } } });
        const errors = BuildTypeConfigurationValidationErrors(config, SCHEMA);
        expect(errors).toHaveLength(2);
        for (const error of errors) {
            expect(error.Source).toBe('TypeConfiguration');
            expect(error.Type).toBe(ValidationErrorType.Failure);
            expect(error.Message).toMatch(/does not conform/);
        }
        const combined = errors.map((e) => e.Message).join('\n');
        expect(combined).toContain('$.realtime.allowUserModelOverride');
        expect(combined).toContain('$.realtime.narration.paceMs');
    });

    it('FAILS on a missing required section', () => {
        const errors = BuildTypeConfigurationValidationErrors(JSON.stringify({ other: 1 }), SCHEMA);
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain("missing required property 'realtime'");
    });
});

describe('ValidateAgentInheritanceAndSandbox & ValidateAgentPersonaOwnership', () => {
    const ALICE = '11111111-1111-1111-1111-111111111111';
    const BOB = '22222222-2222-2222-2222-222222222222';
    const COS_ID = 'c0500000-0000-0000-0000-000000000000';
    const PEPPER_ID = 'c0500000-0000-0000-0000-000000000001';
    const ROLE_SALES = '33333333-3333-3333-3333-333333333333';

    function makeUser(id: string, type: 'User' | 'Owner' = 'User', roleIds: string[] = []): UserInfo {
        return new UserInfo(undefined, {
            ID: id,
            Name: id,
            Email: `${id}@example.com`,
            Type: type,
            UserRoles: roleIds.map((r) => ({ RoleID: r, Role: r, UserID: id })),
        });
    }

    function baseAgentRow(overrides: Partial<AgentSandboxValidationContext['AllAgents'][number]> = {}) {
        return {
            ID: COS_ID,
            Name: 'Chief of Staff',
            BaseAgentID: null,
            OwnerUserID: null,
            Status: 'Active' as const,
            InstantiationMode: 'Required' as const,
            DriverClass: null,
            Isolation: 'Worker' as const,
            MaxCostPerRun: 2.0,
            MaxTokensPerRun: 50000,
            MaxTimePerRun: 120,
            MaxIterationsPerRun: 25,
            TypeConfiguration: null,
            ...overrides,
        };
    }

    function makeTarget(overrides: Partial<AgentSandboxValidationTarget> = {}): AgentSandboxValidationTarget {
        return {
            ID: PEPPER_ID,
            IsSaved: false,
            BaseAgentID: COS_ID,
            PreSaveBaseAgentID: null,
            OwnerUserID: ALICE,
            PreSaveOwnerUserID: null,
            InstantiationMode: 'None',
            DriverClass: null,
            DriverClassDirty: false,
            Isolation: 'Worker',
            ExposeAsAction: false,
            MaxCostPerRun: 1.5,
            MaxTokensPerRun: 40000,
            MaxTimePerRun: 90,
            MaxIterationsPerRun: 20,
            ...overrides,
        };
    }

    it('allows a UI-role user to create a valid personal derived instance', () => {
        const errors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget(),
            User: makeUser(ALICE, 'User'),
            AllAgents: [baseAgentRow()],
            AllPermissions: [],
        });
        expect(errors).toEqual([]);
    });

    it('blocks a UI-role user from creating a root catalog agent (BaseAgentID == null)', () => {
        const errors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ BaseAgentID: null }),
            User: makeUser(ALICE, 'User'),
            AllAgents: [baseAgentRow()],
            AllPermissions: [],
        });
        expect(errors.some((e) => e.Source === 'BaseAgentID')).toBe(true);
    });

    it('blocks a UI-role user from editing another user instance, setting InstantiationMode != None, custom DriverClass, loosening Isolation, ExposeAsAction, or raising MaxCostPerRun', () => {
        const otherErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ IsSaved: true, PreSaveBaseAgentID: COS_ID, PreSaveOwnerUserID: BOB, OwnerUserID: ALICE }),
            User: makeUser(ALICE, 'User'),
            AllAgents: [baseAgentRow()],
            AllPermissions: [],
        });
        expect(otherErrors.some((e) => e.Source === 'OwnerUserID')).toBe(true);

        const escalationErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                InstantiationMode: 'Optional',
                DriverClass: 'EvilAgent',
                DriverClassDirty: true,
                Isolation: 'InProcess',
                ExposeAsAction: true,
                MaxCostPerRun: 50,
            }),
            User: makeUser(ALICE, 'User'),
            AllAgents: [baseAgentRow()],
            AllPermissions: [],
        });
        const sources = new Set(escalationErrors.map((e) => e.Source));
        expect(sources.has('InstantiationMode')).toBe(true);
        expect(sources.has('DriverClass')).toBe(true);
        expect(sources.has('Isolation')).toBe(true);
        expect(sources.has('ExposeAsAction')).toBe(true);
        expect(sources.has('MaxCostPerRun')).toBe(true);
    });

    it('blocks exceeding MAX_AGENT_INHERITANCE_DEPTH (5) even for Owner users', () => {
        const chain = [0, 1, 2, 3, 4, 5].map((i) =>
            baseAgentRow({
                ID: `a0000000-0000-0000-0000-00000000000${i}`,
                Name: `Level ${i}`,
                BaseAgentID: i === 0 ? null : `a0000000-0000-0000-0000-00000000000${i - 1}`,
                InstantiationMode: 'Optional',
            })
        );
        // Attaching Level 6 under Level 5 = 6 hops > 5 -> MUST fail!
        const errors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                ID: 'a0000000-0000-0000-0000-000000000006',
                BaseAgentID: 'a0000000-0000-0000-0000-000000000005',
            }),
            User: makeUser(ALICE, 'Owner'),
            AllAgents: chain,
            AllPermissions: [],
        });
        expect(errors.some((e) => /exceeds maximum allowed depth/i.test(e.Message))).toBe(true);
    });

    it('enforces maxInstancesPerUser and CanRun on BaseAgentID', () => {
        const salesTemplate = baseAgentRow({
            ID: 'b0000000-0000-0000-0000-000000000001',
            BaseAgentID: COS_ID,
            InstantiationMode: 'Required',
            TypeConfiguration: JSON.stringify({ instantiation: { maxInstancesPerUser: 1 } }),
        });
        const existingInstance = baseAgentRow({
            ID: 'b0000000-0000-0000-0000-000000000002',
            BaseAgentID: salesTemplate.ID,
            OwnerUserID: ALICE,
            InstantiationMode: 'None',
        });
        const salesPerm = Object.assign(Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity, {});
        Object.defineProperties(salesPerm, {
            AgentID: { value: salesTemplate.ID },
            RoleID: { value: ROLE_SALES },
            UserID: { value: null },
            CanView: { value: true },
            CanRun: { value: true },
            CanEdit: { value: false },
            CanDelete: { value: false },
        });

        // Bob lacks Sales role -> denied CanRun on salesTemplate
        const bobErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ BaseAgentID: salesTemplate.ID, OwnerUserID: BOB }),
            User: makeUser(BOB, 'User', []),
            AllAgents: [baseAgentRow(), salesTemplate, existingInstance],
            AllPermissions: [salesPerm],
        });
        expect(bobErrors.some((e) => /do not have permission to run/i.test(e.Message))).toBe(true);

        // Alice already has 1 instance and maxInstancesPerUser is 1 -> rejected
        const capErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ ID: 'b0000000-0000-0000-0000-000000000099', BaseAgentID: salesTemplate.ID, OwnerUserID: ALICE }),
            User: makeUser(ALICE, 'User', [ROLE_SALES]),
            AllAgents: [baseAgentRow(), salesTemplate, existingInstance],
            AllPermissions: [salesPerm],
        });
        expect(capErrors.some((e) => /Maximum of 1 active instance/i.test(e.Message))).toBe(true);
    });

    it('ValidateAgentPersonaOwnership allows derived owner and blocks root or other user agents', () => {
        const alice = makeUser(ALICE, 'User');
        expect(
            ValidateAgentPersonaOwnership({ ID: PEPPER_ID, BaseAgentID: COS_ID, OwnerUserID: ALICE }, alice, PEPPER_ID)
        ).toEqual([]);
        expect(
            ValidateAgentPersonaOwnership({ ID: COS_ID, BaseAgentID: null, OwnerUserID: ALICE }, alice, COS_ID)
        ).toHaveLength(1);
        expect(
            ValidateAgentPersonaOwnership({ ID: PEPPER_ID, BaseAgentID: COS_ID, OwnerUserID: BOB }, alice, PEPPER_ID)
        ).toHaveLength(1);
    });

    it('E4: enforces transitive ancestor CanRun invariant on BaseAgentID write across multi-level chains', () => {
        const restrictedRoot = baseAgentRow({
            ID: 'c0000000-0000-0000-0000-000000000001',
            Name: 'Exec Chief of Staff',
            BaseAgentID: null,
            InstantiationMode: 'Optional',
        });
        const intermediateTemplate = baseAgentRow({
            ID: 'c0000000-0000-0000-0000-000000000002',
            Name: 'Regional CoS Template',
            BaseAgentID: restrictedRoot.ID,
            InstantiationMode: 'Optional',
        });
        // Root requires ROLE_SALES; intermediate is shared with ROLE_UI (so Bob passes intermediate directly
        // but must still be rejected transitively because he lacks CanRun on restrictedRoot!)
        const ROLE_UI = 'r0000000-0000-0000-0000-000000000009';
        const rootPerm = Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity;
        Object.defineProperties(rootPerm, {
            AgentID: { value: restrictedRoot.ID },
            RoleID: { value: ROLE_SALES },
            UserID: { value: null },
            CanView: { value: true },
            CanRun: { value: true },
            CanEdit: { value: false },
            CanDelete: { value: false },
        });
        const intermediatePerm = Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity;
        Object.defineProperties(intermediatePerm, {
            AgentID: { value: intermediateTemplate.ID },
            RoleID: { value: ROLE_UI },
            UserID: { value: null },
            CanView: { value: true },
            CanRun: { value: true },
            CanEdit: { value: false },
            CanDelete: { value: false },
        });

        // Bob holds ROLE_UI (direct access to intermediateTemplate) but lacks ROLE_SALES on restrictedRoot -> rejected!
        const deniedErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ BaseAgentID: intermediateTemplate.ID, OwnerUserID: BOB }),
            User: makeUser(BOB, 'User', [ROLE_UI]),
            AllAgents: [restrictedRoot, intermediateTemplate],
            AllPermissions: [rootPerm, intermediatePerm],
        });
        expect(deniedErrors.some((e) => /do not have permission to run/i.test(e.Message))).toBe(true);

        // Alice holds ROLE_UI + ROLE_SALES -> permitted to derive from intermediateTemplate
        const allowedErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ BaseAgentID: intermediateTemplate.ID, OwnerUserID: ALICE }),
            User: makeUser(ALICE, 'User', [ROLE_UI, ROLE_SALES]),
            AllAgents: [restrictedRoot, intermediateTemplate],
            AllPermissions: [rootPerm, intermediatePerm],
        });
        expect(allowedErrors).toEqual([]);
    });

    it('s13: enforces admin-only helperPlugins writes and rejects code-only security seams for ALL users including admins', () => {
        const standardUser = makeUser(ALICE, 'User');
        const adminUser = makeUser(ALICE, 'Owner');
        const messagingPluginJson = JSON.stringify({
            helperPlugins: [{ seam: 'messaging', driverClass: 'CustomMessagingHelper' }],
        });

        // Non-admin writing helperPlugins in Configuration or TypeConfiguration -> REJECTED
        const nonAdminConfigErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ BaseAgentID: COS_ID, OwnerUserID: ALICE, Configuration: messagingPluginJson }),
            User: standardUser,
            AllAgents: [baseAgentRow()],
            AllPermissions: [],
        });
        expect(nonAdminConfigErrors.some((e) => /Only administrators may configure helperPlugins/i.test(e.Message))).toBe(true);

        const nonAdminTypeConfigErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ BaseAgentID: COS_ID, OwnerUserID: ALICE, TypeConfiguration: messagingPluginJson }),
            User: standardUser,
            AllAgents: [baseAgentRow()],
            AllPermissions: [],
        });
        expect(nonAdminTypeConfigErrors.some((e) => /Only administrators may configure helperPlugins/i.test(e.Message))).toBe(true);

        // Admin configuring a non-security seam -> ALLOWED
        const adminAllowedErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({ BaseAgentID: COS_ID, OwnerUserID: ALICE, Configuration: messagingPluginJson }),
            User: adminUser,
            AllAgents: [baseAgentRow()],
            AllPermissions: [],
        });
        expect(adminAllowedErrors).toEqual([]);

        // Even an Admin configuring code-only security seams -> REJECTED
        for (const forbiddenSeam of ['limits', 'actionPolicy', 'action-policy', 'policy', 'permissions']) {
            const forbiddenJson = JSON.stringify({
                helperPlugins: [{ seam: forbiddenSeam, driverClass: 'BypassHelper' }],
            });
            const adminForbiddenErrors = ValidateAgentInheritanceAndSandbox({
                Target: makeTarget({ BaseAgentID: COS_ID, OwnerUserID: ALICE, Configuration: forbiddenJson }),
                User: adminUser,
                AllAgents: [baseAgentRow()],
                AllPermissions: [],
            });
            expect(
                adminForbiddenErrors.some((e) => /is code-only/i.test(e.Message)),
                `Expected code-only security seam rejection for '${forbiddenSeam}'`
            ).toBe(true);
        }
    });
});
