/**
 * Unit tests for the PURE validation core behind `MJAIAgentEntityServer.ValidateAsync` —
 * the `TypeConfiguration ⊨ ConfigSchema` invariant. Follows the package's exported-pure-function
 * test style (entity instantiation needs live metadata, so the DB-coupled wrapper is thin and
 * the matrix lives here).
 */
import { describe, it, expect, vi } from 'vitest';
import { BaseEntity, UserInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { MJAIAgentEntity, MJAIAgentPermissionEntity } from '@memberjunction/core-entities';
import {
    BuildTypeConfigurationValidationErrors,
    MJAIAgentEntityServer,
    ValidateAgentInheritanceAndSandbox,
    type AgentSandboxValidationContext,
    type AgentSandboxValidationTarget,
} from '../custom/MJAIAgentEntityServer.server';
import {
    MJAIAgentPersonaEntityServer,
    ValidateAgentPersonaOwnership,
} from '../custom/MJAIAgentPersonaEntityServer.server';
import {
    MJAIAgentCategoryEntityServer,
    ValidateAgentCategoryDelete,
    ValidateAgentCategoryMutation,
    ValidateAgentScopedConfigurationJson,
} from '../custom/MJAIAgentCategoryEntityServer.server';
import {
    MJAIAgentTypeEntityServer,
    ValidateAgentTypeDelete,
    ValidateAgentTypeMutation,
} from '../custom/MJAIAgentTypeEntityServer.server';
import {
    ValidateAgentStepTypeDelete,
    ValidateAgentStepTypeMutation,
} from '../custom/MJAIAgentStepTypeEntityServer.server';

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

    it('blocks non-admin multi-hop ceiling escalation, null-clearing finite limits, narrow-only widening via Configuration, and non-dirty DriverClass smuggling (2.7 regression)', () => {
        const standardUser = makeUser(ALICE, 'User');
        const DEPT_ID = '00000000-0000-4000-8000-000000000099';
        const root = baseAgentRow({
            ID: COS_ID,
            Isolation: 'Container',
            MaxCostPerRun: 5,
            MaxIterationsPerRun: 20,
            SearchScopeAccess: 'Assigned',
            AcceptsSkills: 'Limited',
            SkillActivationMode: 'RequestedOnly',
            RequirePlanMode: true,
            SupportsPlanMode: false,
            AcceptUnregisteredFiles: false,
            AllowEphemeralClientTools: false,
            AllowMemoryWrite: false,
            MaxSubAgentConsultRounds: 2,
            DriverClass: 'RootDriver',
            Configuration: JSON.stringify({ instantiation: { maxInstancesPerUser: 1 } }),
        });
        // Intermediate department template leaves MaxCostPerRun null & Isolation InProcess (weak defaults)
        const dept = baseAgentRow({
            ID: DEPT_ID,
            Name: 'Sales Dept Template',
            BaseAgentID: COS_ID,
            InstantiationMode: 'Optional',
            Isolation: 'InProcess',
            MaxCostPerRun: null,
            MaxIterationsPerRun: null,
            SearchScopeAccess: 'None',
            DriverClass: null,
        });
        function makePerm(agentId: string, userId: string | null, roleId: string | null): MJAIAgentPermissionEntity {
            const perm = Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity;
            Object.defineProperties(perm, {
                AgentID: { value: agentId },
                UserID: { value: userId },
                RoleID: { value: roleId },
                CanView: { value: true },
                CanRun: { value: true },
                CanEdit: { value: false },
                CanDelete: { value: false },
            });
            return perm;
        }
        const allowPerm = makePerm(DEPT_ID, ALICE, null);

        // Multi-hop escalation + dirty null-clearing + narrow-only widening via Configuration + non-dirty DriverClass
        const escalateErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: DEPT_ID,
                PreSaveOwnerUserID: ALICE,
                BaseAgentID: DEPT_ID,
                OwnerUserID: ALICE,
                Isolation: 'Worker', // weaker than root 'Container'
                MaxCostPerRun: null, // dirty null-clearing previously bounded 5
                DirtyFields: new Set(['MaxCostPerRun', 'Isolation', 'Configuration']),
                PreSaveLimits: { MaxCostPerRun: 5 },
                MaxIterationsPerRun: 50, // exceeds root's 20
                DriverClass: 'EvilDriver',
                DriverClassDirty: false, // unconditional check still blocks!
                Configuration: JSON.stringify({
                    scope: { searchScopeAccess: 'All' },
                    skills: { activationMode: 'Auto' },
                    execution: { requirePlanMode: false, supportsPlanMode: true },
                    attachments: { acceptUnregisteredFiles: true },
                    clientTools: { allowEphemeral: true },
                    memory: { allowMemoryWrite: true },
                    subAgentExecution: { maxConsultRounds: 9 },
                }),
            }),
            User: standardUser,
            AllAgents: [root, dept],
            AllPermissions: [allowPerm],
        });

        const fields = new Set(escalateErrors.map((e) => e.Source));
        expect(fields.has('Isolation')).toBe(true);
        expect(fields.has('MaxCostPerRun')).toBe(true);
        expect(fields.has('MaxIterationsPerRun')).toBe(true);
        expect(fields.has('DriverClass')).toBe(true);
        expect(fields.has('SearchScopeAccess')).toBe(true);
        expect(fields.has('SkillActivationMode')).toBe(true);
        expect(fields.has('RequirePlanMode')).toBe(true);
        expect(fields.has('SupportsPlanMode')).toBe(true);
        expect(fields.has('AcceptUnregisteredFiles')).toBe(true);
        expect(fields.has('AllowEphemeralClientTools')).toBe(true);
        expect(fields.has('AllowMemoryWrite')).toBe(true);
        expect(fields.has('MaxSubAgentConsultRounds')).toBe(true);

        // maxInstancesPerUser read from baseAgent.Configuration.instantiation
        const existingInstance = baseAgentRow({
            ID: '00000000-0000-4000-8000-000000000077',
            BaseAgentID: COS_ID,
            OwnerUserID: ALICE,
            InstantiationMode: 'None',
            Status: 'Active',
        });
        const maxInstErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                ID: '00000000-0000-4000-8000-000000000078',
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'Container',
                MaxCostPerRun: 2,
                MaxIterationsPerRun: 10,
                DriverClass: 'RootDriver',
            }),
            User: standardUser,
            AllAgents: [root, existingInstance],
            AllPermissions: [makePerm(COS_ID, ALICE, null)],
        });
        expect(maxInstErrors.some((e) => /Maximum of 1 active instance/i.test(e.Message))).toBe(true);
    });

    it('enforces category/type DefaultConfiguration JSON validation, admin-only helperPlugins, and code-only seam blocks', () => {
        const standardUser = makeUser(ALICE, 'User');
        const adminUser = makeUser(ALICE, 'Owner');

        // Malformed JSON rejected on both Category and Type
        expect(
            ValidateAgentScopedConfigurationJson('{broken', 'DefaultConfiguration', 'AI Agent Category', adminUser)
                .length
        ).toBeGreaterThan(0);
        expect(
            ValidateAgentScopedConfigurationJson(
                '[1,2,3]',
                'DefaultAgentConfiguration',
                'AI Agent Type',
                adminUser
            ).length
        ).toBeGreaterThan(0);

        const pluginJson = JSON.stringify({
            helperPlugins: [{ seam: 'messaging', driverClass: 'CustomMsgHelper' }],
        });
        // Non-admin blocked from writing helperPlugins
        const nonAdminErrors = ValidateAgentScopedConfigurationJson(
            pluginJson,
            'DefaultConfiguration',
            'AI Agent Category',
            standardUser
        );
        expect(nonAdminErrors.some((e) => /Only administrators may configure helperPlugins/i.test(e.Message))).toBe(
            true
        );
        // Admin allowed for non-security seam
        expect(
            ValidateAgentScopedConfigurationJson(pluginJson, 'DefaultConfiguration', 'AI Agent Category', adminUser)
        ).toEqual([]);

        // Even admin blocked from code-only seams on Category & Type
        const forbiddenJson = JSON.stringify({
            helperPlugins: [{ seam: 'actionPolicy', driverClass: 'EvilPolicy' }],
        });
        const forbiddenTypeErrors = ValidateAgentScopedConfigurationJson(
            forbiddenJson,
            'DefaultAgentConfiguration',
            'AI Agent Type',
            adminUser
        );
        expect(forbiddenTypeErrors.some((e) => /is code-only/i.test(e.Message))).toBe(true);
    });

    it('enforces MJAIAgentStepTypeEntityServer admin-only writes/deletes and built-in security floors', () => {
        const standardUser = makeUser(ALICE, 'User');
        const adminUser = makeUser(ALICE, 'Owner');

        // Non-admin blocked from creating/modifying or deleting any step type
        const nonAdminCreate = ValidateAgentStepTypeMutation(
            {
                Name: 'CustomApproval',
                DriverClass: 'CustomApprovalStepHandler',
                AllowedInUnapprovedPlanMode: false,
                CountsAgainstTreeBudget: true,
            },
            standardUser
        );
        expect(nonAdminCreate.some((e) => /Only administrators/i.test(e.Message))).toBe(true);

        const nonAdminDelete = ValidateAgentStepTypeDelete('CustomApproval', 'id-1', standardUser);
        expect(nonAdminDelete.some((e) => /Only administrators/i.test(e.Message))).toBe(true);

        // Admin cannot weaken built-in Actions floors or hijack DriverClass
        const builtInWeakening = ValidateAgentStepTypeMutation(
            {
                Name: 'Actions',
                DriverClass: 'HijackedDriver',
                AllowedInUnapprovedPlanMode: true,
                CountsAgainstTreeBudget: false,
            },
            adminUser
        );
        const sources = new Set(builtInWeakening.map((e) => e.Source));
        expect(sources.has('AllowedInUnapprovedPlanMode')).toBe(true);
        expect(sources.has('CountsAgainstTreeBudget')).toBe(true);
        expect(sources.has('DriverClass')).toBe(true);

        // Admin cannot delete built-in step types, CAN delete custom step types
        expect(
            ValidateAgentStepTypeDelete('Actions', 'id-2', adminUser).some((e) => /cannot be deleted/i.test(e.Message))
        ).toBe(true);
        expect(ValidateAgentStepTypeDelete('CustomApproval', 'id-3', adminUser)).toEqual([]);

        // Admin can save valid custom step type & valid built-in step type
        expect(
            ValidateAgentStepTypeMutation(
                {
                    Name: 'Actions',
                    DriverClass: 'ActionsStepHandler',
                    AllowedInUnapprovedPlanMode: false,
                    CountsAgainstTreeBudget: true,
                },
                adminUser
            )
        ).toEqual([]);
        expect(
            ValidateAgentStepTypeMutation(
                {
                    Name: 'CustomApproval',
                    DriverClass: 'CustomApprovalStepHandler',
                    AllowedInUnapprovedPlanMode: false,
                    CountsAgainstTreeBudget: true,
                },
                adminUser
            )
        ).toEqual([]);

        // Built-in step types cannot be disabled (S4)
        const disableBuiltIn = ValidateAgentStepTypeMutation(
            {
                Name: 'Actions',
                DriverClass: 'ActionsStepHandler',
                AllowedInUnapprovedPlanMode: false,
                CountsAgainstTreeBudget: true,
                Status: 'Disabled',
            },
            adminUser
        );
        expect(disableBuiltIn.some((e) => e.Source === 'Status')).toBe(true);
    });

    it('allows derived-instance create/edit with null inherited limits while blocking helperPlugins clears, CategoryID re-point, __proto__, and newly code-only seams (B3, B4, S2, S3)', () => {
        const standardUser = makeUser(ALICE, 'User');
        const adminUser = makeUser(ALICE, 'Owner');
        const root = baseAgentRow({
            ID: COS_ID,
            InstantiationMode: 'Optional',
            Isolation: 'Worker',
            MaxCostPerRun: 5,
            MaxIterationsPerRun: 25,
            CategoryID: '00000000-0000-4000-8000-000000000201',
            TypeID: '00000000-0000-4000-8000-000000000301',
        });
        const perm = Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity;
        Object.defineProperties(perm, {
            AgentID: { value: COS_ID },
            UserID: { value: ALICE },
            RoleID: { value: null },
            CanView: { value: true },
            CanRun: { value: true },
            CanEdit: { value: false },
            CanDelete: { value: false },
        });

        // B4: Fresh create with null limits under a finite ancestor cap MUST pass (inherits at runtime)
        const createErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: false,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'Worker',
                MaxCostPerRun: null,
                MaxIterationsPerRun: null,
                CategoryID: root.CategoryID,
                TypeID: root.TypeID,
            }),
            User: standardUser,
            AllAgents: [root],
            AllPermissions: [perm],
        });
        expect(createErrors).toEqual([]);

        // S2: Non-admin cannot clear helperPlugins with [] or re-point CategoryID/TypeID
        const escapeErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: COS_ID,
                PreSaveOwnerUserID: ALICE,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'Worker',
                MaxCostPerRun: null,
                MaxIterationsPerRun: null,
                CategoryID: '00000000-0000-4000-8000-000000000999',
                PreSaveCategoryID: root.CategoryID,
                TypeID: '00000000-0000-4000-8000-000000000888',
                PreSaveTypeID: root.TypeID,
                Configuration: JSON.stringify({ helperPlugins: [] }),
            }),
            User: standardUser,
            AllAgents: [root],
            AllPermissions: [perm],
        });
        const sources = new Set(escapeErrors.map((e) => e.Source));
        expect(sources.has('Configuration')).toBe(true);
        expect(sources.has('CategoryID')).toBe(true);
        expect(sources.has('TypeID')).toBe(true);

        // S2 on Category: non-admin cannot write {"helperPlugins": []}
        const catClearErrors = ValidateAgentScopedConfigurationJson(
            JSON.stringify({ helperPlugins: [] }),
            'DefaultConfiguration',
            'AI Agent Category',
            standardUser
        );
        expect(catClearErrors.some((e) => /Only administrators may configure helperPlugins/i.test(e.Message))).toBe(true);

        // B3: __proto__ payload rejected on Category even for admin
        const protoErrors = ValidateAgentScopedConfigurationJson(
            '{"__proto__":{"helperPlugins":[{"seam":"messaging","driverClass":"Evil"}]}}',
            'DefaultConfiguration',
            'AI Agent Category',
            adminUser
        );
        expect(protoErrors.some((e) => /forbidden prototype-pollution key/i.test(e.Message))).toBe(true);

        // S3: setup, steps, actions, subAgents rejected as code-only even for admin
        for (const seam of ['setup', 'steps', 'actions', 'subAgents']) {
            const seamErrors = ValidateAgentScopedConfigurationJson(
                JSON.stringify({ helperPlugins: [{ seam, driverClass: 'CustomDriver' }] }),
                'DefaultConfiguration',
                'AI Agent Category',
                adminUser
            );
            expect(seamErrors.some((e) => /is code-only/i.test(e.Message))).toBe(true);
        }

        // R2-3 + Minor: unrelated rename (`DirtyFields = {'Name'}`) on an existing saved instance
        // succeeds even if an admin tightened the base agent or left `helperPlugins: []` in JSON!
        const tightenedRoot = baseAgentRow({
            ID: COS_ID,
            InstantiationMode: 'Optional',
            Isolation: 'Container',
            RequirePlanMode: true,
            AllowEphemeralClientTools: false,
            CategoryID: root.CategoryID,
            TypeID: root.TypeID,
        });
        const renameErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: COS_ID,
                PreSaveOwnerUserID: ALICE,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'InProcess',
                RequirePlanMode: false,
                AllowEphemeralClientTools: true,
                CategoryID: root.CategoryID,
                PreSaveCategoryID: root.CategoryID,
                TypeID: root.TypeID,
                PreSaveTypeID: root.TypeID,
                Configuration: JSON.stringify({ helperPlugins: [] }),
                DirtyFields: new Set(['Name']),
            }),
            User: standardUser,
            AllAgents: [tightenedRoot],
            AllPermissions: [perm],
        });
        expect(renameErrors).toEqual([]);

        // R2-4: saved instance with PreSaveCategoryID = null CANNOT assign a loose CategoryID when base has a strict category (or no category)
        const nullPreSaveCatErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: COS_ID,
                PreSaveOwnerUserID: ALICE,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'Worker',
                CategoryID: '00000000-0000-4000-8000-000000000777',
                PreSaveCategoryID: null,
                TypeID: root.TypeID,
                PreSaveTypeID: root.TypeID,
                DirtyFields: new Set(['CategoryID']),
            }),
            User: standardUser,
            AllAgents: [root],
            AllPermissions: [perm],
        });
        expect(nullPreSaveCatErrors.some((e) => e.Source === 'CategoryID')).toBe(true);

        // R2-11: invalid seam name inside TypeConfiguration.helperPlugins is rejected at save time
        const badTypeConfigSeam = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: false,
                BaseAgentID: null,
                OwnerUserID: null,
                TypeConfiguration: JSON.stringify({ helperPlugins: [{ seam: 'bogusSeam', driverClass: 'X' }] }),
            }),
            User: adminUser,
            AllAgents: [root],
            AllPermissions: [],
        });
        expect(badTypeConfigSeam.some((e) => /not a valid helper seam/i.test(e.Message))).toBe(true);

        // R3-5a: unrelated rename (`DirtyFields = {'Name'}`) succeeds even after admin lowers numeric
        // ceilings (`MaxCostPerRun`, `MaxIterationsPerRun`, `MaxExecutionsPerRun`, `MaxSubAgentConsultRounds`)
        const loweredCeilingRoot = baseAgentRow({
            ID: COS_ID,
            InstantiationMode: 'Optional',
            Isolation: 'Worker',
            MaxCostPerRun: 2,
            MaxIterationsPerRun: 10,
            MaxExecutionsPerRun: 2,
            MaxSubAgentConsultRounds: 2,
            CategoryID: root.CategoryID,
            TypeID: root.TypeID,
        });
        const renameAfterLoweredCeilings = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: COS_ID,
                PreSaveOwnerUserID: ALICE,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'Worker',
                MaxCostPerRun: 5,
                MaxIterationsPerRun: 20,
                MaxExecutionsPerRun: 4,
                MaxSubAgentConsultRounds: 5,
                CategoryID: root.CategoryID,
                PreSaveCategoryID: root.CategoryID,
                TypeID: root.TypeID,
                PreSaveTypeID: root.TypeID,
                DirtyFields: new Set(['Name']),
            }),
            User: standardUser,
            AllAgents: [loweredCeilingRoot],
            AllPermissions: [perm],
        });
        expect(renameAfterLoweredCeilings).toEqual([]);

        // R3-5b: attaching a previously unparented saved row (`DirtyFields = {'BaseAgentID'}`) MUST
        // enforce ALL narrow-only fields including Isolation and numeric ceilings!
        const attachBaseErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: null,
                PreSaveOwnerUserID: ALICE,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'InProcess',
                MaxCostPerRun: 10,
                CategoryID: root.CategoryID,
                PreSaveCategoryID: root.CategoryID,
                TypeID: root.TypeID,
                PreSaveTypeID: root.TypeID,
                DirtyFields: new Set(['BaseAgentID']),
            }),
            User: standardUser,
            AllAgents: [loweredCeilingRoot],
            AllPermissions: [perm],
        });
        const attachSources = new Set(attachBaseErrors.map((e) => e.Source));
        expect(attachSources.has('Isolation')).toBe(true);
        expect(attachSources.has('MaxCostPerRun')).toBe(true);

        // R3-12: no-ancestor-category branch (`PreSaveCategoryID: null`, base `CategoryID: null`, dirty `CategoryID`)
        const catlessBase = baseAgentRow({
            ID: COS_ID,
            InstantiationMode: 'Optional',
            Isolation: 'Worker',
            CategoryID: null,
            TypeID: root.TypeID,
        });
        const noAncCatErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                PreSaveBaseAgentID: COS_ID,
                PreSaveOwnerUserID: ALICE,
                BaseAgentID: COS_ID,
                OwnerUserID: ALICE,
                Isolation: 'Worker',
                CategoryID: '00000000-0000-4000-8000-000000000777',
                PreSaveCategoryID: null,
                TypeID: root.TypeID,
                PreSaveTypeID: root.TypeID,
                DirtyFields: new Set(['CategoryID']),
            }),
            User: standardUser,
            AllAgents: [catlessBase],
            AllPermissions: [perm],
        });
        expect(noAncCatErrors.some((e) => e.Source === 'CategoryID')).toBe(true);
    });

    it('create clamp preserves strict AcceptUnregisteredFiles=false under true base while clamping loose Isolation=InProcess (R3-3)', () => {
        const fields = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        const setField = (name: string, dirty: boolean, neverSet: boolean): void => {
            fields.set(name, { Name: name, Dirty: dirty, NeverSet: neverSet });
        };
        setField('AcceptUnregisteredFiles', true, false);
        setField('Isolation', true, false);
        setField('AllowMemoryWrite', true, false);

        const server = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        server['GetFieldByName'] = (name: string) => fields.get(name);
        Object.defineProperties(server, {
            AcceptUnregisteredFiles: { value: false, writable: true, configurable: true },
            Isolation: { value: 'InProcess', writable: true, configurable: true },
            AllowMemoryWrite: { value: true, writable: true, configurable: true },
            TypeID: { value: 'type-1', writable: true, configurable: true },
            CategoryID: { value: null, writable: true, configurable: true },
        });

        const base = {
            ID: 'base-1',
            BaseAgentID: null,
            TypeID: 'type-1',
            CategoryID: null,
            Isolation: 'Container',
            AcceptUnregisteredFiles: true,
            AllowMemoryWrite: false,
            Configuration: null,
        } as unknown as MJAIAgentEntity;

        (server as unknown as { inheritDefaultsFromBaseAgent(b: MJAIAgentEntity, all?: readonly MJAIAgentEntity[]): void })
            .inheritDefaultsFromBaseAgent(base, [base]);

        // R3-3: strict AcceptUnregisteredFiles=false MUST stay false (never widened to true!)
        expect(server['AcceptUnregisteredFiles']).toBe(false);
        // Loose DB defaults clamp to stricter ancestor values
        expect(server['Isolation']).toBe('Container');
        expect(server['AllowMemoryWrite']).toBe(false);
    });

    it('legacy-column-only edit on saved row with pre-existing invalid backfilled Configuration does not fail ValidateAsync (R3-10)', async () => {
        const fields = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        const configField = {
            Name: 'Configuration',
            Dirty: false,
            NeverSet: false,
            OldValue: JSON.stringify({ contextWindow: { compactionTriggerPercent: 150 } }),
        };
        const injectNotesField = { Name: 'InjectNotes', Dirty: true, NeverSet: false, OldValue: true };
        fields.set('Configuration', configField);
        fields.set('InjectNotes', injectNotesField);

        const server = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        server['GetFieldByName'] = (name: string) => fields.get(name);
        Object.defineProperty(server, 'Fields', { get: () => Array.from(fields.values()), configurable: true });
        Object.defineProperty(server, 'IsSaved', { get: () => true, configurable: true });
        Object.defineProperty(server, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(server, 'BaseAgentID', { get: () => null, configurable: true });
        Object.defineProperty(server, 'OwnerUserID', { get: () => null, configurable: true });
        Object.defineProperty(server, 'TypeConfiguration', { get: () => null, configurable: true });
        let configVal: string | null = configField.OldValue as string;
        Object.defineProperty(server, 'Configuration', {
            get: () => configVal,
            set: (v: string | null) => {
                configVal = v;
                configField.Dirty = true; // simulate BaseEntity marking Configuration dirty during sync!
            },
            configurable: true,
        });
        Object.defineProperty(server, 'InjectNotes', { value: false, writable: true, configurable: true });

        let observedValidationResult: ValidationResult | null = null;
        const okResult = new ValidationResult();
        okResult.Success = true;
        const baseValidateSpy = vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(okResult);
        const baseSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: MJAIAgentEntityServer) {
            observedValidationResult = await this.ValidateAsync();
            return observedValidationResult.Success;
        });
        try {
            const saved = await server.Save();
            expect(saved).toBe(true);
            expect(observedValidationResult?.Success).toBe(true);
            // Sync still updated Configuration with the dirty legacy column
            expect(JSON.parse(configVal ?? '{}').memory?.injectNotes).toBe(false);
        } finally {
            baseSaveSpy.mockRestore();
            baseValidateSpy.mockRestore();
        }
    });

    it('C-R1-1 & R5-1: GraphQL NewRecord() + SetMany(defaults) does not freeze non-strict SQL defaults while preserving explicit strict-default narrow-only restrictions', async () => {
        // Simulate ResolverBase.CreateRecord: NewRecord() + SetMany(gqlPayload) sets NeverSet=false
        // while keeping Dirty=false on every column populated with its SQL default.
        const fieldState = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        const addField = (name: string, dirty: boolean, neverSet: boolean): void => {
            fieldState.set(name, { Name: name, Dirty: dirty, NeverSet: neverSet });
        };
        const defaultColumns: Record<string, unknown> = {
            ModelSelectionMode: 'Agent Type',
            SkillActivationMode: 'RequestedOnly',
            SearchScopeAccess: 'None',
            ArtifactCreationMode: 'Always',
            MaxNotesToInject: 5,
            EnableContextCompression: false,
            MessageMode: 'None',
            AcceptsSkills: 'None',
            Isolation: 'InProcess',
            AllowMemoryWrite: true,
            SupportsPlanMode: true,
            RequirePlanMode: false,
            AllowEphemeralClientTools: true,
            AcceptUnregisteredFiles: false,
            Configuration: null,
        };
        for (const col of Object.keys(defaultColumns)) {
            addField(col, false, false);
        }

        const server = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        server['GetFieldByName'] = (name: string) => fieldState.get(name);
        Object.defineProperty(server, 'Fields', { get: () => Array.from(fieldState.values()), configurable: true });
        Object.defineProperty(server, 'IsSaved', { get: () => false, configurable: true });
        Object.defineProperty(server, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(server, 'ID', { value: 'c1111111-1111-4111-8111-111111111111', writable: true, configurable: true });
        Object.defineProperty(server, 'BaseAgentID', { value: COS_ID, writable: true, configurable: true });
        Object.defineProperty(server, 'OwnerUserID', { value: ALICE, writable: true, configurable: true });
        Object.defineProperty(server, 'TypeID', { value: null, writable: true, configurable: true });
        Object.defineProperty(server, 'CategoryID', { value: null, writable: true, configurable: true });
        Object.defineProperty(server, 'IsPrimaryInstance', { value: false, writable: true, configurable: true });
        Object.defineProperty(server, 'TypeConfiguration', { value: null, writable: true, configurable: true });
        for (const [k, v] of Object.entries(defaultColumns)) {
            Object.defineProperty(server, k, { value: v, writable: true, configurable: true });
        }

        const base = {
            ID: COS_ID,
            Name: 'Chief of Staff',
            BaseAgentID: null,
            TypeID: '33333333-3333-4333-8333-333333333333',
            CategoryID: '44444444-4444-4444-8444-444444444444',
            ModelSelectionMode: 'Agent',
            SkillActivationMode: 'Auto',
            SearchScopeAccess: 'All',
            ArtifactCreationMode: 'Never',
            MaxNotesToInject: 12,
            EnableContextCompression: true,
            MessageMode: 'Latest',
            AcceptsSkills: 'All',
            Isolation: 'Worker',
            AllowMemoryWrite: true,
            SupportsPlanMode: true,
            RequirePlanMode: false,
            AllowEphemeralClientTools: true,
            AcceptUnregisteredFiles: true,
            Configuration: null,
            Status: 'Active',
        } as unknown as MJAIAgentEntity;

        const loadBatchSpy = vi
            .spyOn(
                server as unknown as {
                    loadGuardMetadataBatch(): Promise<{
                        AllAgents: MJAIAgentEntity[];
                        AllPermissions: MJAIAgentPermissionEntity[];
                        AllCategories: unknown[];
                        AllAgentTypes: unknown[];
                    }>;
                },
                'loadGuardMetadataBatch'
            )
            .mockResolvedValue({ AllAgents: [base], AllPermissions: [], AllCategories: [], AllAgentTypes: [] });
        const clearPrimarySpy = vi
            .spyOn(server as unknown as { clearOtherPrimaryInstances(): Promise<void> }, 'clearOtherPrimaryInstances')
            .mockResolvedValue(undefined);
        const baseSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        try {
            const saved = await server.Save();
            expect(saved).toBe(true);
            // Non-strict-default operational columns inherit from baseAgent and are NOT frozen into Configuration!
            expect(server['ModelSelectionMode']).toBe('Agent');
            expect(server['ArtifactCreationMode']).toBe('Never');
            expect(server['MaxNotesToInject']).toBe(12);
            expect(server['EnableContextCompression']).toBe(true);
            // R5-1: Explicit strict-default narrow-only columns (NeverSet === false) MUST NOT be silently loosened!
            expect(server['SearchScopeAccess']).toBe('None');
            expect(server['AcceptUnregisteredFiles']).toBe(false);
            expect(server['AcceptsSkills']).toBe('None');
            expect(server['SkillActivationMode']).toBe('RequestedOnly');
            // And SearchScopeAccess='None' under base 'All' is recorded in Configuration.scope so runtime honors it,
            // while none of the other 45 SQL defaults were frozen into Configuration!
            const parsedCfg = JSON.parse(String(server['Configuration']));
            expect(parsedCfg).toEqual({ scope: { searchScopeAccess: 'None' } });

            // Meanwhile, truly untouched (NeverSet === true) narrow-only columns DO inherit from baseAgent
            for (const [col, defVal] of Object.entries(defaultColumns)) {
                server[col] = defVal;
                fieldState.set(col, { Name: col, Dirty: false, NeverSet: true });
            }
            expect(await server.Save()).toBe(true);
            expect(server['SearchScopeAccess']).toBe('All');
            expect(server['AcceptUnregisteredFiles']).toBe(true);
            expect(server['AcceptsSkills']).toBe('All');
            expect(server['SkillActivationMode']).toBe('Auto');
            expect(server['Configuration']).toBeNull();
        } finally {
            baseSaveSpy.mockRestore();
            clearPrimarySpy.mockRestore();
            loadBatchSpy.mockRestore();
        }
    });

    it('C-R1-2: enforces admin-only on Category & AgentType mutations/deletes, blocks TypeID=null clear, middle-ancestor SearchScopeAccess=None bypass, and Category/AgentType narrow-only ceilings', async () => {
        const devUser = makeUser(ALICE, 'User', ['Developer']);
        const ownerUser = makeUser(ALICE, 'Owner');

        // 1. Developer cannot wipe Category/Type DefaultConfiguration with '{}' or mutate/delete either entity
        expect(
            ValidateAgentScopedConfigurationJson('{}', 'DefaultConfiguration', 'AI Agent Category', devUser).length
        ).toBeGreaterThan(0);
        expect(ValidateAgentCategoryMutation('Finance', devUser).length).toBeGreaterThan(0);
        expect(ValidateAgentCategoryDelete('cat-1', devUser).length).toBeGreaterThan(0);
        expect(ValidateAgentTypeMutation('Loop', devUser).length).toBeGreaterThan(0);
        expect(ValidateAgentTypeDelete('type-1', devUser).length).toBeGreaterThan(0);
        // Admin and system context (null) stay allowed
        expect(ValidateAgentCategoryMutation('Finance', ownerUser)).toEqual([]);
        expect(ValidateAgentCategoryDelete('cat-1', null)).toEqual([]);
        expect(ValidateAgentTypeMutation('Loop', ownerUser)).toEqual([]);
        expect(ValidateAgentTypeDelete('type-1', null)).toEqual([]);

        // R5-4: Verify Delete() rejects non-admin AND populates LatestResult.CompleteMessage via RegisterResultHistoryEntry (no stub!)
        const catServer = Object.create(MJAIAgentCategoryEntityServer.prototype) as MJAIAgentCategoryEntityServer & Record<string, unknown>;
        catServer['_resultHistory'] = [];
        Object.defineProperty(catServer, 'ContextCurrentUser', { get: () => devUser, configurable: true });
        Object.defineProperty(catServer, 'ID', { get: () => 'cat-1', configurable: true });
        expect(await catServer.Delete()).toBe(false);
        expect(catServer.LatestResult?.Success).toBe(false);
        expect(catServer.LatestResult?.CompleteMessage).toMatch(/Only administrators may delete MJ: AI Agent Categories/i);

        const typeServer = Object.create(MJAIAgentTypeEntityServer.prototype) as MJAIAgentTypeEntityServer & Record<string, unknown>;
        typeServer['_resultHistory'] = [];
        Object.defineProperty(typeServer, 'ContextCurrentUser', { get: () => devUser, configurable: true });
        Object.defineProperty(typeServer, 'ID', { get: () => 'type-1', configurable: true });
        expect(await typeServer.Delete()).toBe(false);
        expect(typeServer.LatestResult?.Success).toBe(false);
        expect(typeServer.LatestResult?.CompleteMessage).toMatch(/Only administrators may delete MJ: AI Agent Types/i);

        // 2. Non-admin clearing TypeID = null on saved derived instance is blocked
        const uiUser = makeUser(ALICE, 'User', ['UI']);
        const L0 = baseAgentRow({
            ID: COS_ID,
            InstantiationMode: 'Optional',
            TypeID: '33333333-3333-4333-8333-333333333333',
            CategoryID: '44444444-4444-4444-8444-444444444444',
            SearchScopeAccess: 'All',
            Configuration: JSON.stringify({ scope: { searchScopeAccess: 'All' } }),
        });
        const L1 = baseAgentRow({
            ID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            Name: 'L1 Restricted Template',
            BaseAgentID: L0.ID,
            InstantiationMode: 'Optional',
            TypeID: L0.TypeID,
            CategoryID: L0.CategoryID,
            SearchScopeAccess: 'None',
            Configuration: null,
        });
        const makePerm = (agentId: string): MJAIAgentPermissionEntity => {
            const p = Object.assign(Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity, {});
            Object.defineProperties(p, {
                AgentID: { value: agentId },
                UserID: { value: ALICE },
                RoleID: { value: null },
                CanView: { value: true },
                CanRun: { value: true },
                CanEdit: { value: false },
                CanDelete: { value: false },
            });
            return p;
        };
        const perm0 = makePerm(L0.ID);
        const perm1 = makePerm(L1.ID);

        const clearTypeErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: true,
                BaseAgentID: L0.ID,
                PreSaveBaseAgentID: L0.ID,
                OwnerUserID: ALICE,
                PreSaveOwnerUserID: ALICE,
                CategoryID: L0.CategoryID,
                PreSaveCategoryID: L0.CategoryID,
                TypeID: null,
                PreSaveTypeID: L0.TypeID,
                DirtyFields: new Set(['TypeID']),
            }),
            User: uiUser,
            AllAgents: [L0],
            AllPermissions: [perm0],
        });
        expect(clearTypeErrors.some((e) => e.Source === 'TypeID' && /clear TypeID/i.test(e.Message))).toBe(true);

        // 3. Middle-ancestor SearchScopeAccess='None' (Configuration=null) blocks L2 widening to 'All'
        const middleNoneErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: false,
                BaseAgentID: L1.ID,
                OwnerUserID: ALICE,
                CategoryID: L1.CategoryID,
                TypeID: L1.TypeID,
                SearchScopeAccess: 'All',
                Configuration: JSON.stringify({ scope: { searchScopeAccess: 'All' } }),
            }),
            User: uiUser,
            AllAgents: [L0, L1],
            AllPermissions: [perm0, perm1],
        });
        expect(middleNoneErrors.some((e) => e.Source === 'SearchScopeAccess')).toBe(true);

        // 4. Category & AgentType narrow-only ceilings enforced on derived saves
        const strictCategory = {
            ID: L0.CategoryID!,
            ParentID: null,
            DefaultConfiguration: JSON.stringify({
                execution: { requirePlanMode: true },
                clientTools: { allowEphemeral: false },
                scope: { searchScopeAccess: 'Assigned' },
                subAgentExecution: { maxExecutionsPerRun: 2 },
            }),
        };
        const strictType = {
            ID: L0.TypeID!,
            DefaultAgentConfiguration: JSON.stringify({
                memory: { allowMemoryWrite: false },
                skills: { activationMode: 'RequestedOnly' },
                subAgentExecution: { maxConsultRounds: 1 },
            }),
        };
        const policyViolationErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                IsSaved: false,
                BaseAgentID: L0.ID,
                OwnerUserID: ALICE,
                CategoryID: L0.CategoryID,
                TypeID: L0.TypeID,
                Configuration: JSON.stringify({
                    execution: { requirePlanMode: false },
                    clientTools: { allowEphemeral: true },
                    scope: { searchScopeAccess: 'All' },
                    memory: { allowMemoryWrite: true },
                    skills: { activationMode: 'Auto' },
                    subAgentExecution: { maxExecutionsPerRun: 5, maxConsultRounds: 4 },
                }),
            }),
            User: uiUser,
            AllAgents: [L0],
            AllPermissions: [perm0],
            AllCategories: [strictCategory],
            AllAgentTypes: [strictType],
        });
        const violatedSources = new Set(policyViolationErrors.map((e) => e.Source));
        expect(violatedSources.has('RequirePlanMode')).toBe(true);
        expect(violatedSources.has('AllowEphemeralClientTools')).toBe(true);
        expect(violatedSources.has('SearchScopeAccess')).toBe(true);
        expect(violatedSources.has('AllowMemoryWrite')).toBe(true);
        expect(violatedSources.has('SkillActivationMode')).toBe(true);
        expect(violatedSources.has('MaxExecutionsPerRun')).toBe(true);
        expect(violatedSources.has('MaxSubAgentConsultRounds')).toBe(true);
    });

    it('C-R1-7a: rejects invalid caller-dirty legacy column edits on saved MJAIAgentEntityServer and MJAIAgentTypeEntityServer', async () => {
        const agentFields = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        const configField = { Name: 'Configuration', Dirty: false, NeverSet: false, OldValue: null };
        agentFields.set('Configuration', configField);
        agentFields.set('MaxExecutionsPerRun', { Name: 'MaxExecutionsPerRun', Dirty: true, NeverSet: false, OldValue: 3 });
        agentFields.set('CompactionTriggerPercent', { Name: 'CompactionTriggerPercent', Dirty: true, NeverSet: false, OldValue: 75 });
        agentFields.set('RerankerConfiguration', { Name: 'RerankerConfiguration', Dirty: true, NeverSet: false, OldValue: null });

        const agentServer = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        agentServer['GetFieldByName'] = (name: string) => agentFields.get(name);
        Object.defineProperty(agentServer, 'Fields', { get: () => Array.from(agentFields.values()), configurable: true });
        Object.defineProperty(agentServer, 'IsSaved', { get: () => true, configurable: true });
        Object.defineProperty(agentServer, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(agentServer, 'BaseAgentID', { get: () => null, configurable: true });
        Object.defineProperty(agentServer, 'OwnerUserID', { get: () => null, configurable: true });
        Object.defineProperty(agentServer, 'TypeConfiguration', { get: () => null, configurable: true });
        let agentConfigVal: string | null = null;
        Object.defineProperty(agentServer, 'Configuration', {
            get: () => agentConfigVal,
            set: (v: string | null) => {
                agentConfigVal = v;
                configField.Dirty = true;
            },
            configurable: true,
        });
        Object.defineProperty(agentServer, 'MaxExecutionsPerRun', { value: 0, writable: true, configurable: true });
        Object.defineProperty(agentServer, 'CompactionTriggerPercent', { value: 150, writable: true, configurable: true });
        Object.defineProperty(agentServer, 'RerankerConfiguration', { value: '{bad', writable: true, configurable: true });

        let agentValResult: ValidationResult | null = null;
        const okResult = new ValidationResult();
        okResult.Success = true;
        const baseValidateSpy = vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(okResult);
        const baseSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: MJAIAgentEntityServer) {
            agentValResult = await this.ValidateAsync();
            return agentValResult.Success;
        });
        try {
            const saved = await agentServer.Save();
            expect(saved).toBe(false);
            expect(agentValResult?.Success).toBe(false);
            const joined = (agentValResult?.Errors ?? []).map((e) => e.Message).join('\n');
            expect(joined).toMatch(/maxExecutionsPerRun/i);
            expect(joined).toMatch(/compactionTriggerPercent/i);
            expect(joined).toMatch(/RerankerConfiguration/i);
        } finally {
            baseSaveSpy.mockRestore();
            baseValidateSpy.mockRestore();
        }

        // Same check on MJAIAgentTypeEntityServer
        const typeFields = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        const typeCfgField = { Name: 'DefaultAgentConfiguration', Dirty: false, NeverSet: false, OldValue: null };
        typeFields.set('DefaultAgentConfiguration', typeCfgField);
        typeFields.set('CompactionTriggerPercent', { Name: 'CompactionTriggerPercent', Dirty: true, NeverSet: false, OldValue: 75 });

        const typeServer = Object.create(MJAIAgentTypeEntityServer.prototype) as MJAIAgentTypeEntityServer & Record<string, unknown>;
        typeServer['GetFieldByName'] = (name: string) => typeFields.get(name);
        Object.defineProperty(typeServer, 'IsSaved', { get: () => true, configurable: true });
        Object.defineProperty(typeServer, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(typeServer, 'Name', { get: () => 'Loop', configurable: true });
        let typeConfigVal: string | null = null;
        Object.defineProperty(typeServer, 'DefaultAgentConfiguration', {
            get: () => typeConfigVal,
            set: (v: string | null) => {
                typeConfigVal = v;
                typeCfgField.Dirty = true;
            },
            configurable: true,
        });
        Object.defineProperty(typeServer, 'CompactionTriggerPercent', { value: 150, writable: true, configurable: true });

        let typeValResult: ValidationResult | null = null;
        const okTypeResult = new ValidationResult();
        okTypeResult.Success = true;
        const typeValidateSpy = vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(okTypeResult);
        const typeSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: MJAIAgentTypeEntityServer) {
            typeValResult = await this.ValidateAsync();
            return typeValResult.Success;
        });
        try {
            const saved = await typeServer.Save();
            expect(saved).toBe(false);
            expect(typeValResult?.Success).toBe(false);
            expect((typeValResult?.Errors ?? []).some((e) => /compactionTriggerPercent/i.test(e.Message))).toBe(true);
        } finally {
            typeSaveSpy.mockRestore();
            typeValidateSpy.mockRestore();
        }
    });

    it('C-R2-1: MJAIAgentTypeEntityServer GraphQL create (NewRecord + SetMany defaults) preserves DefaultAgentConfiguration and keeps null creates null', async () => {
        const makeTypeServer = (defaultAgentConfig: string | null, configDirty: boolean) => {
            const fields = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
            const defaultCols: Record<string, unknown> = {
                ContextCompressionMessageThreshold: null,
                ContextCompressionPromptID: null,
                ContextCompressionMessageRetentionCount: null,
                ContextWindowMaxTokens: null,
                CompactionTriggerPercent: 75,
                CompactionTargetPercent: 30,
                ConversationSummaryPromptID: null,
            };
            for (const col of Object.keys(defaultCols)) {
                fields.set(col, { Name: col, Dirty: false, NeverSet: false });
            }
            fields.set('DefaultAgentConfiguration', {
                Name: 'DefaultAgentConfiguration',
                Dirty: configDirty,
                NeverSet: false,
            });

            const server = Object.create(MJAIAgentTypeEntityServer.prototype) as MJAIAgentTypeEntityServer & Record<string, unknown>;
            server['GetFieldByName'] = (name: string) => fields.get(name);
            Object.defineProperty(server, 'IsSaved', { get: () => false, configurable: true });
            Object.defineProperty(server, 'ContextCurrentUser', { get: () => null, configurable: true });
            Object.defineProperty(server, 'Name', { value: 'CustomType', writable: true, configurable: true });
            Object.defineProperty(server, 'DefaultAgentConfiguration', {
                value: defaultAgentConfig,
                writable: true,
                configurable: true,
            });
            for (const [k, v] of Object.entries(defaultCols)) {
                Object.defineProperty(server, k, { value: v, writable: true, configurable: true });
            }
            return server;
        };

        const baseSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        try {
            // Case 1: GraphQL create with explicit DefaultAgentConfiguration and untouched SQL defaults
            const cfgJson = JSON.stringify({
                contextWindow: { compactionTriggerPercent: 85, compactionTargetPercent: 40, maxTokens: 200000 },
            });
            const s1 = makeTypeServer(cfgJson, false);
            expect(await s1.Save()).toBe(true);
            expect(s1['DefaultAgentConfiguration']).toBe(cfgJson);
            expect(s1['CompactionTriggerPercent']).toBe(85);
            expect(s1['CompactionTargetPercent']).toBe(40);
            expect(s1['ContextWindowMaxTokens']).toBe(200000);

            // Case 2: GraphQL create with DefaultAgentConfiguration = null and untouched SQL defaults
            const s2 = makeTypeServer(null, false);
            expect(await s2.Save()).toBe(true);
            expect(s2['DefaultAgentConfiguration']).toBeNull();
        } finally {
            baseSaveSpy.mockRestore();
        }
    });

    it('R5-7: ValidateAgentInheritanceAndSandbox computes Math.min maxInstancesPerUser across Category/Type/ancestors and counts per root base agent', () => {
        const uiUser = makeUser(ALICE, 'User', ['UI']);
        const catId = '44444444-4444-4444-8444-444444444499';
        const root = baseAgentRow({
            ID: COS_ID,
            InstantiationMode: 'Optional',
            CategoryID: catId,
            Configuration: JSON.stringify({ instantiation: { maxInstancesPerUser: 1 } }),
        });
        const subTemplateA = baseAgentRow({
            ID: 'b0000000-0000-4000-8000-0000000000a1',
            Name: 'SubTemplate A',
            BaseAgentID: root.ID,
            InstantiationMode: 'Optional',
            CategoryID: catId,
            // Middle template tries to raise cap to 5 — monotonic min MUST keep cap = 1!
            Configuration: JSON.stringify({ instantiation: { maxInstancesPerUser: 5 } }),
        });
        const subTemplateB = baseAgentRow({
            ID: 'b0000000-0000-4000-8000-0000000000b1',
            Name: 'SubTemplate B',
            BaseAgentID: root.ID,
            InstantiationMode: 'Optional',
            CategoryID: catId,
            Configuration: null,
        });
        const existingUnderA = baseAgentRow({
            ID: 'b0000000-0000-4000-8000-0000000000c1',
            Name: 'Alice Instance Under A',
            BaseAgentID: subTemplateA.ID,
            OwnerUserID: ALICE,
            InstantiationMode: 'None',
            Status: 'Active',
        });
        const perm = (agentId: string): MJAIAgentPermissionEntity => {
            const p = Object.assign(Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity, {});
            Object.defineProperties(p, {
                AgentID: { value: agentId },
                UserID: { value: ALICE },
                RoleID: { value: null },
                CanView: { value: true },
                CanRun: { value: true },
                CanEdit: { value: false },
                CanDelete: { value: false },
            });
            return p;
        };

        // Creating a second instance under sibling SubTemplate B MUST be blocked because cap=1 is counted per root!
        const siblingCapErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                ID: 'b0000000-0000-4000-8000-0000000000d1',
                IsSaved: false,
                BaseAgentID: subTemplateB.ID,
                OwnerUserID: ALICE,
                CategoryID: catId,
            }),
            User: uiUser,
            AllAgents: [root, subTemplateA, subTemplateB, existingUnderA],
            AllPermissions: [perm(root.ID), perm(subTemplateA.ID), perm(subTemplateB.ID)],
        });
        expect(siblingCapErrors.some((e) => /Maximum of 1 active instance/i.test(e.Message))).toBe(true);

        // Cap defined ONLY in Category DefaultConfiguration is also enforced!
        const uncappedRoot = baseAgentRow({ ID: COS_ID, InstantiationMode: 'Optional', CategoryID: catId, Configuration: null });
        const catCapErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                ID: 'b0000000-0000-4000-8000-0000000000d2',
                IsSaved: false,
                BaseAgentID: uncappedRoot.ID,
                OwnerUserID: ALICE,
                CategoryID: catId,
            }),
            User: uiUser,
            AllAgents: [
                uncappedRoot,
                baseAgentRow({ ID: 'b0000000-0000-4000-8000-0000000000c2', BaseAgentID: uncappedRoot.ID, OwnerUserID: ALICE, InstantiationMode: 'None' }),
            ],
            AllPermissions: [perm(uncappedRoot.ID)],
            AllCategories: [{ ID: catId, ParentID: null, DefaultConfiguration: JSON.stringify({ instantiation: { maxInstancesPerUser: 1 } }) }],
        });
        expect(catCapErrors.some((e) => /Maximum of 1 active instance/i.test(e.Message))).toBe(true);
    });

    it('Follow-up #6: rejects single-sided legacy pair inversions (CompactionTargetPercent >= stored CompactionTriggerPercent, MinExecutionsPerRun > stored MaxExecutionsPerRun)', async () => {
        const agentFields = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        const configField = { Name: 'Configuration', Dirty: false, NeverSet: false, OldValue: null };
        agentFields.set('Configuration', configField);
        agentFields.set('CompactionTargetPercent', { Name: 'CompactionTargetPercent', Dirty: true, NeverSet: false, OldValue: 30 });
        agentFields.set('CompactionTriggerPercent', { Name: 'CompactionTriggerPercent', Dirty: false, NeverSet: false, OldValue: 75 });
        agentFields.set('MinExecutionsPerRun', { Name: 'MinExecutionsPerRun', Dirty: true, NeverSet: false, OldValue: 1 });
        agentFields.set('MaxExecutionsPerRun', { Name: 'MaxExecutionsPerRun', Dirty: false, NeverSet: false, OldValue: 3 });

        const agentServer = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        agentServer['GetFieldByName'] = (name: string) => agentFields.get(name);
        Object.defineProperty(agentServer, 'Fields', { get: () => Array.from(agentFields.values()), configurable: true });
        Object.defineProperty(agentServer, 'IsSaved', { get: () => true, configurable: true });
        Object.defineProperty(agentServer, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(agentServer, 'BaseAgentID', { get: () => null, configurable: true });
        Object.defineProperty(agentServer, 'OwnerUserID', { get: () => null, configurable: true });
        Object.defineProperty(agentServer, 'TypeConfiguration', { get: () => null, configurable: true });
        let agentConfigVal: string | null = null;
        Object.defineProperty(agentServer, 'Configuration', {
            get: () => agentConfigVal,
            set: (v: string | null) => {
                agentConfigVal = v;
                configField.Dirty = true;
            },
            configurable: true,
        });
        Object.defineProperty(agentServer, 'CompactionTargetPercent', { value: 80, writable: true, configurable: true });
        Object.defineProperty(agentServer, 'CompactionTriggerPercent', { value: 75, writable: true, configurable: true });
        Object.defineProperty(agentServer, 'MinExecutionsPerRun', { value: 5, writable: true, configurable: true });
        Object.defineProperty(agentServer, 'MaxExecutionsPerRun', { value: 3, writable: true, configurable: true });

        let agentValResult: ValidationResult | null = null;
        const okResult = new ValidationResult();
        okResult.Success = true;
        const baseValidateSpy = vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(okResult);
        const baseSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: MJAIAgentEntityServer) {
            agentValResult = await this.ValidateAsync();
            return agentValResult.Success;
        });
        try {
            expect(await agentServer.Save()).toBe(false);
            const joined = (agentValResult?.Errors ?? []).map((e) => e.Message).join('\n');
            expect(joined).toMatch(/compactionTargetPercent/i);
            expect(joined).toMatch(/minExecutionsPerRun/i);
        } finally {
            baseSaveSpy.mockRestore();
            baseValidateSpy.mockRestore();
        }

        // Same single-sided check on MJAIAgentTypeEntityServer
        const typeFields = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        const typeCfgField = { Name: 'DefaultAgentConfiguration', Dirty: false, NeverSet: false, OldValue: null };
        typeFields.set('DefaultAgentConfiguration', typeCfgField);
        typeFields.set('CompactionTargetPercent', { Name: 'CompactionTargetPercent', Dirty: true, NeverSet: false, OldValue: 30 });
        typeFields.set('CompactionTriggerPercent', { Name: 'CompactionTriggerPercent', Dirty: false, NeverSet: false, OldValue: 75 });

        const typeServer = Object.create(MJAIAgentTypeEntityServer.prototype) as MJAIAgentTypeEntityServer & Record<string, unknown>;
        typeServer['GetFieldByName'] = (name: string) => typeFields.get(name);
        Object.defineProperty(typeServer, 'IsSaved', { get: () => true, configurable: true });
        Object.defineProperty(typeServer, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(typeServer, 'Name', { get: () => 'Loop', configurable: true });
        let typeConfigVal: string | null = null;
        Object.defineProperty(typeServer, 'DefaultAgentConfiguration', {
            get: () => typeConfigVal,
            set: (v: string | null) => {
                typeConfigVal = v;
                typeCfgField.Dirty = true;
            },
            configurable: true,
        });
        Object.defineProperty(typeServer, 'CompactionTargetPercent', { value: 80, writable: true, configurable: true });
        Object.defineProperty(typeServer, 'CompactionTriggerPercent', { value: 75, writable: true, configurable: true });

        let typeValResult: ValidationResult | null = null;
        const okTypeResult = new ValidationResult();
        okTypeResult.Success = true;
        const typeValidateSpy = vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(okTypeResult);
        const typeSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: MJAIAgentTypeEntityServer) {
            typeValResult = await this.ValidateAsync();
            return typeValResult.Success;
        });
        try {
            expect(await typeServer.Save()).toBe(false);
            expect((typeValResult?.Errors ?? []).some((e) => /compactionTargetPercent/i.test(e.Message))).toBe(true);
        } finally {
            typeSaveSpy.mockRestore();
            typeValidateSpy.mockRestore();
        }
    });

    it('Follow-up #5: ValidateAsync fails closed when batched guard metadata loader fails', async () => {
        const uiUser = makeUser(ALICE, 'User', ['UI']);
        const server = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        server['GetFieldByName'] = () => undefined;
        Object.defineProperty(server, 'Fields', { get: () => [], configurable: true });
        Object.defineProperty(server, 'IsSaved', { get: () => false, configurable: true });
        Object.defineProperty(server, 'ContextCurrentUser', { get: () => uiUser, configurable: true });
        Object.defineProperty(server, 'BaseAgentID', { get: () => COS_ID, configurable: true });
        Object.defineProperty(server, 'OwnerUserID', { get: () => ALICE, configurable: true });
        Object.defineProperty(server, 'Configuration', { get: () => null, configurable: true });
        Object.defineProperty(server, 'TypeConfiguration', { get: () => null, configurable: true });

        const okResult = new ValidationResult();
        okResult.Success = true;
        const baseValidateSpy = vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(okResult);
        const loadBatchSpy = vi
            .spyOn(
                server as unknown as {
                    loadGuardMetadataBatch(): Promise<{
                        AllAgents: MJAIAgentEntity[];
                        AllPermissions: MJAIAgentPermissionEntity[];
                        AllCategories: unknown[];
                        AllAgentTypes: unknown[];
                        ErrorMessage?: string;
                    }>;
                },
                'loadGuardMetadataBatch'
            )
            .mockResolvedValue({
                AllAgents: [],
                AllPermissions: [],
                AllCategories: [],
                AllAgentTypes: [],
                ErrorMessage: 'Simulated RunViews transient failure',
            });
        try {
            const result = await server.ValidateAsync();
            expect(result.Success).toBe(false);
            expect(result.Errors.some((e) => /Simulated RunViews transient failure/i.test(e.Message))).toBe(true);
        } finally {
            loadBatchSpy.mockRestore();
            baseValidateSpy.mockRestore();
        }
    });

    it('C-R3-1 & C-R3-2: derived GraphQL create preserves explicit Configuration.scope.searchScopeAccess and applies R5-6 non-instantiable derived ancestor ceiling', async () => {
        const l0 = baseAgentRow({
            ID: COS_ID,
            Name: 'L0 Root',
            BaseAgentID: null,
            InstantiationMode: 'Optional',
            SearchScopeAccess: 'All',
            Configuration: null,
        });
        // Non-instantiable derived middle node L1 sitting at default SearchScopeAccess='None' + Configuration=null
        // resolves to 'All' under R5-6!
        const l1 = baseAgentRow({
            ID: 'c3200000-0000-4000-8000-000000000001',
            Name: 'L1 Non-Instantiable Derived',
            BaseAgentID: l0.ID,
            InstantiationMode: 'None',
            SearchScopeAccess: 'None',
            Configuration: null,
        });

        const buildDerivedCreate = (opts: {
            baseId: string;
            config: string | null;
            configDirty: boolean;
            searchNeverSet: boolean;
        }) => {
            const fieldState = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
            fieldState.set('SearchScopeAccess', { Name: 'SearchScopeAccess', Dirty: false, NeverSet: opts.searchNeverSet });
            fieldState.set('Configuration', { Name: 'Configuration', Dirty: opts.configDirty, NeverSet: false });
            const server = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
            server['GetFieldByName'] = (name: string) => fieldState.get(name);
            Object.defineProperty(server, 'Fields', { get: () => Array.from(fieldState.values()), configurable: true });
            Object.defineProperty(server, 'IsSaved', { get: () => false, configurable: true });
            Object.defineProperty(server, 'ContextCurrentUser', { get: () => null, configurable: true });
            Object.defineProperty(server, 'ID', { value: 'c3200000-0000-4000-8000-000000000099', writable: true, configurable: true });
            Object.defineProperty(server, 'BaseAgentID', { value: opts.baseId, writable: true, configurable: true });
            Object.defineProperty(server, 'OwnerUserID', { value: ALICE, writable: true, configurable: true });
            Object.defineProperty(server, 'TypeID', { value: l0.TypeID, writable: true, configurable: true });
            Object.defineProperty(server, 'CategoryID', { value: l0.CategoryID, writable: true, configurable: true });
            Object.defineProperty(server, 'IsPrimaryInstance', { value: false, writable: true, configurable: true });
            Object.defineProperty(server, 'SearchScopeAccess', { value: 'None', writable: true, configurable: true });
            Object.defineProperty(server, 'Configuration', { value: opts.config, writable: true, configurable: true });
            Object.defineProperty(server, 'TypeConfiguration', { value: null, writable: true, configurable: true });
            vi.spyOn(
                server as unknown as {
                    loadGuardMetadataBatch(): Promise<{
                        AllAgents: MJAIAgentEntity[];
                        AllPermissions: MJAIAgentPermissionEntity[];
                        AllCategories: unknown[];
                        AllAgentTypes: unknown[];
                    }>;
                },
                'loadGuardMetadataBatch'
            ).mockResolvedValue({ AllAgents: [l0, l1], AllPermissions: [], AllCategories: [], AllAgentTypes: [] });
            vi.spyOn(
                server as unknown as { clearOtherPrimaryInstances(): Promise<void> },
                'clearOtherPrimaryInstances'
            ).mockResolvedValue(undefined);
            return server;
        };

        const baseSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
        try {
            // C-R3-1: GraphQL create with explicit Configuration.scope.searchScopeAccess='Assigned' + untouched SearchScopeAccess='None'
            const s1 = buildDerivedCreate({
                baseId: l0.ID,
                config: JSON.stringify({ scope: { searchScopeAccess: 'Assigned' } }),
                configDirty: false,
                searchNeverSet: false,
            });
            expect(await s1.Save()).toBe(true);
            expect(JSON.parse(String(s1['Configuration'])).scope?.searchScopeAccess).toBe('Assigned');
            expect(s1['SearchScopeAccess']).toBe('Assigned');

            // C-R3-2a: Untouched (NeverSet=true) create under L1 inherits L0's 'All' (not L1's default 'None')
            const s2 = buildDerivedCreate({
                baseId: l1.ID,
                config: null,
                configDirty: false,
                searchNeverSet: true,
            });
            expect(await s2.Save()).toBe(true);
            expect(s2['SearchScopeAccess']).toBe('All');

            // C-R3-2b: Explicit SearchScopeAccess='None' (NeverSet=false) create under L1 persists scope.searchScopeAccess='None'
            // because effective ancestor ceiling through L1 is 'All' (not 'None')!
            const s3 = buildDerivedCreate({
                baseId: l1.ID,
                config: null,
                configDirty: false,
                searchNeverSet: false,
            });
            expect(await s3.Save()).toBe(true);
            expect(s3['SearchScopeAccess']).toBe('None');
            expect(JSON.parse(String(s3['Configuration'])).scope?.searchScopeAccess).toBe('None');
        } finally {
            baseSaveSpy.mockRestore();
        }
    });

    it('C-R3-3: rejects cross-field compaction & execution pair inversions on create and JSON-only updates for Agent & AgentType', async () => {
        // Case A: AgentType create with CompactionTriggerPercent=25 (Dirty=true) vs untouched SQL default CompactionTargetPercent=30
        const typeFieldsA = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        typeFieldsA.set('DefaultAgentConfiguration', { Name: 'DefaultAgentConfiguration', Dirty: false, NeverSet: true });
        typeFieldsA.set('CompactionTriggerPercent', { Name: 'CompactionTriggerPercent', Dirty: true, NeverSet: false });
        typeFieldsA.set('CompactionTargetPercent', { Name: 'CompactionTargetPercent', Dirty: false, NeverSet: false });
        const typeServerA = Object.create(MJAIAgentTypeEntityServer.prototype) as MJAIAgentTypeEntityServer & Record<string, unknown>;
        typeServerA['GetFieldByName'] = (name: string) => typeFieldsA.get(name);
        Object.defineProperty(typeServerA, 'IsSaved', { get: () => false, configurable: true });
        Object.defineProperty(typeServerA, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(typeServerA, 'Name', { value: 'BadType', writable: true, configurable: true });
        Object.defineProperty(typeServerA, 'DefaultAgentConfiguration', { value: null, writable: true, configurable: true });
        Object.defineProperty(typeServerA, 'CompactionTriggerPercent', { value: 25, writable: true, configurable: true });
        Object.defineProperty(typeServerA, 'CompactionTargetPercent', { value: 30, writable: true, configurable: true });

        // Case B: Saved AIAgent JSON-only update setting compactionTargetPercent=80 against stored CompactionTriggerPercent=75
        const agentFieldsB = new Map<string, { Name: string; Dirty: boolean; NeverSet: boolean; OldValue?: unknown }>();
        agentFieldsB.set('Configuration', { Name: 'Configuration', Dirty: true, NeverSet: false, OldValue: null });
        agentFieldsB.set('CompactionTriggerPercent', { Name: 'CompactionTriggerPercent', Dirty: false, NeverSet: false, OldValue: 75 });
        agentFieldsB.set('CompactionTargetPercent', { Name: 'CompactionTargetPercent', Dirty: false, NeverSet: false, OldValue: 30 });
        const agentServerB = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        agentServerB['GetFieldByName'] = (name: string) => agentFieldsB.get(name);
        Object.defineProperty(agentServerB, 'Fields', { get: () => Array.from(agentFieldsB.values()), configurable: true });
        Object.defineProperty(agentServerB, 'IsSaved', { get: () => true, configurable: true });
        Object.defineProperty(agentServerB, 'ContextCurrentUser', { get: () => null, configurable: true });
        Object.defineProperty(agentServerB, 'BaseAgentID', { get: () => null, configurable: true });
        Object.defineProperty(agentServerB, 'OwnerUserID', { get: () => null, configurable: true });
        Object.defineProperty(agentServerB, 'TypeConfiguration', { get: () => null, configurable: true });
        Object.defineProperty(agentServerB, 'Configuration', {
            value: JSON.stringify({ contextWindow: { compactionTargetPercent: 80 } }),
            writable: true,
            configurable: true,
        });
        Object.defineProperty(agentServerB, 'CompactionTriggerPercent', { value: 75, writable: true, configurable: true });
        Object.defineProperty(agentServerB, 'CompactionTargetPercent', { value: 30, writable: true, configurable: true });

        let valA: ValidationResult | null = null;
        let valB: ValidationResult | null = null;
        const baseValidateSpy = vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockImplementation(async () => {
            const vr = new ValidationResult();
            vr.Success = true;
            return vr;
        });
        const baseSaveSpy = vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: BaseEntity) {
            const vr = await this.ValidateAsync();
            if (this === typeServerA) valA = vr;
            if (this === agentServerB) valB = vr;
            return vr.Success;
        });
        try {
            expect(await typeServerA.Save()).toBe(false);
            expect(valA?.Success).toBe(false);
            expect((valA?.Errors ?? []).some((e) => /CompactionTargetPercent/i.test(e.Message))).toBe(true);

            expect(await agentServerB.Save()).toBe(false);
            expect(valB?.Success).toBe(false);
            expect((valB?.Errors ?? []).some((e) => /CompactionTargetPercent/i.test(e.Message))).toBe(true);
            expect(agentServerB['CompactionTargetPercent']).toBe(80);
        } finally {
            baseSaveSpy.mockRestore();
            baseValidateSpy.mockRestore();
        }
    });

    it('C-R3-4: MJAIAgentPersonaEntityServer.Delete() populates LatestResult.CompleteMessage on refusal', async () => {
        const uiUser = makeUser(ALICE, 'User', ['UI']);
        const personaServer = Object.create(MJAIAgentPersonaEntityServer.prototype) as MJAIAgentPersonaEntityServer & Record<string, unknown>;
        personaServer['_resultHistory'] = [];
        personaServer['GetFieldByName'] = () => undefined;
        Object.defineProperty(personaServer, 'ContextCurrentUser', { get: () => uiUser, configurable: true });
        Object.defineProperty(personaServer, 'AgentID', { get: () => COS_ID, configurable: true });
        vi.spyOn(
            personaServer as unknown as { loadAgent(id: string): Promise<MJAIAgentEntity | null> },
            'loadAgent'
        ).mockResolvedValue(baseAgentRow({ ID: COS_ID, BaseAgentID: null, OwnerUserID: null }));

        expect(await personaServer.Delete()).toBe(false);
        expect(personaServer.LatestResult?.Success).toBe(false);
        expect(personaServer.LatestResult?.CompleteMessage).toMatch(/Non-administrator users can only configure personas/i);
        // R6 Follow-up #8: refusal message is NOT duplicated in CompleteMessage
        const occurrences = (personaServer.LatestResult?.CompleteMessage ?? '').match(/Non-administrator users can only configure personas/g) ?? [];
        expect(occurrences).toHaveLength(1);
    });

    it('R6 Follow-ups #4 & #5: maxInstancesPerUser folds both JSON+TypeConfiguration, ignores templates, and loadGuardMetadataBatch fails closed when FLS omits guard fields', async () => {
        const uiUser = makeUser(ALICE, 'User', ['UI']);
        const adminUser = makeUser(ALICE, 'Owner');
        const root = baseAgentRow({
            ID: COS_ID,
            InstantiationMode: 'Optional',
            // Configuration says 5, legacy TypeConfiguration says 1 -> monotonic Math.min enforces 1!
            Configuration: JSON.stringify({ instantiation: { maxInstancesPerUser: 5 } }),
            TypeConfiguration: JSON.stringify({ instantiation: { maxInstancesPerUser: 1 } }),
        });
        const existingTemplate = baseAgentRow({
            ID: 'f4000000-0000-4000-8000-000000000001',
            BaseAgentID: root.ID,
            OwnerUserID: ALICE,
            InstantiationMode: 'Optional',
            Status: 'Active',
        });
        const existingPersonal = baseAgentRow({
            ID: 'f4000000-0000-4000-8000-000000000002',
            BaseAgentID: root.ID,
            OwnerUserID: ALICE,
            InstantiationMode: 'None',
            Status: 'Active',
        });
        const perm = Object.create(MJAIAgentPermissionEntity.prototype) as MJAIAgentPermissionEntity;
        Object.defineProperties(perm, {
            AgentID: { value: root.ID },
            UserID: { value: ALICE },
            RoleID: { value: null },
            CanView: { value: true },
            CanRun: { value: true },
            CanEdit: { value: false },
            CanDelete: { value: false },
        });

        // 1. Existing personal instance blocks second personal instance under min(5, 1) = 1
        const capErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                ID: 'f4000000-0000-4000-8000-000000000003',
                IsSaved: false,
                BaseAgentID: root.ID,
                OwnerUserID: ALICE,
                InstantiationMode: 'None',
            }),
            User: uiUser,
            AllAgents: [root, existingPersonal],
            AllPermissions: [perm],
        });
        expect(capErrors.some((e) => /Maximum of 1 active instance/i.test(e.Message))).toBe(true);

        // 2. Existing admin-owned sub-template does NOT count against personal cap and admin can create another sub-template
        const subTemplateErrors = ValidateAgentInheritanceAndSandbox({
            Target: makeTarget({
                ID: 'f4000000-0000-4000-8000-000000000004',
                IsSaved: false,
                BaseAgentID: root.ID,
                OwnerUserID: ALICE,
                InstantiationMode: 'Optional',
            }),
            User: adminUser,
            AllAgents: [root, existingTemplate, existingPersonal],
            AllPermissions: [],
        });
        expect(subTemplateErrors).toEqual([]);

        // 3. Follow-up #5: loadGuardMetadataBatch fails closed if FLS drops DefaultConfiguration on Categories
        const flsServer = Object.create(MJAIAgentEntityServer.prototype) as MJAIAgentEntityServer & Record<string, unknown>;
        Object.defineProperty(flsServer, 'ContextCurrentUser', { get: () => uiUser, configurable: true });
        Object.defineProperty(flsServer, 'RunViewProviderToUse', {
            get: () => ({
                RunViews: async () => [
                    { Success: true, Results: [{ ID: COS_ID, BaseAgentID: null, Configuration: null, SearchScopeAccess: 'All', Isolation: 'InProcess' }] },
                    { Success: true, Results: [{ AgentID: COS_ID, CanRun: true }] },
                    // DefaultConfiguration omitted by FLS!
                    { Success: true, Results: [{ ID: 'cat-1', ParentID: null }] },
                    { Success: true, Results: [{ ID: 'type-1', DefaultAgentConfiguration: null }] },
                ],
            }),
            configurable: true,
        });
        const batchRes = await (
            flsServer as unknown as {
                loadGuardMetadataBatch(): Promise<{ ErrorMessage?: string }>;
            }
        ).loadGuardMetadataBatch();
        expect(batchRes.ErrorMessage).toMatch(/DefaultConfiguration/);
    });
});
