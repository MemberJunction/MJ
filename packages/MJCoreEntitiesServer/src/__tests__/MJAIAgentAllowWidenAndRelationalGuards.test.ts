import { describe, expect, it } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    ValidateAgentInheritanceAndSandbox,
    type AgentSandboxValidationContext,
} from '../custom/MJAIAgentEntityServer.server';
import { ValidateDerivedAgentRelationalGrant } from '../custom/agentRelationalGrantGuard';

function makeAdminUser(): UserInfo {
    return new UserInfo(undefined, {
        ID: '00000000-0000-4000-8000-000000000001',
        Name: 'Admin',
        Email: 'admin@example.test',
        Type: 'Owner',
        UserRoles: [{ Role: 'Administrator', RoleID: 'r-admin' }],
    });
}

function makeUiUser(): UserInfo {
    return new UserInfo(undefined, {
        ID: '00000000-0000-4000-8000-000000000002',
        Name: 'Alice',
        Email: 'alice@example.test',
        Type: 'User',
        UserRoles: [{ Role: 'UI', RoleID: 'r-ui' }],
    });
}

const L0_ID = '10000000-0000-4000-8000-000000000001';
const L1_ID = '10000000-0000-4000-8000-000000000002';
const L2_ID = '10000000-0000-4000-8000-000000000003';

function baseRootAgent(): AgentSandboxValidationContext['AllAgents'][number] {
    return {
        ID: L0_ID,
        Name: 'L0 Strict Root',
        BaseAgentID: null,
        OwnerUserID: null,
        Status: 'Active',
        InstantiationMode: 'Optional',
        DriverClass: null,
        Isolation: 'Worker',
        MaxCostPerRun: 5,
        MaxTokensPerRun: 50000,
        MaxTimePerRun: 300,
        MaxIterationsPerRun: 10,
        TypeConfiguration: null,
        SearchScopeAccess: 'Assigned',
        RequirePlanMode: true,
        SupportsPlanMode: false,
        AcceptUnregisteredFiles: false,
        AllowEphemeralClientTools: false,
        AcceptsSkills: 'Limited',
        SkillActivationMode: 'RequestedOnly',
        AllowMemoryWrite: false,
        MaxExecutionsPerRun: 4,
        MaxSubAgentConsultRounds: 2,
        ArtifactCreationMode: 'System Only',
        MessageMode: 'Latest',
        MaxMessages: 10,
        PayloadDownstreamPaths: '["customer.*"]',
        PayloadScope: '/analysis',
        AttachmentRootPath: '/org/acme',
        ScopeConfig: '{"tenant":"acme","regions":["us","eu"]}',
        NoteRetentionDays: 30,
        AutoArchiveEnabled: true,
        AgentTypePromptParams: '{"enableHandoff":false}',
        Configuration: null,
    };
}

describe('MJAIAgentEntityServer allowWidenFromBase & save-time alignment', () => {
    it('blocks non-admin users from setting, modifying, or clearing Configuration.allowWidenFromBase', () => {
        const alice = makeUiUser();
        const root = baseRootAgent();

        const setTrueErrors = ValidateAgentInheritanceAndSandbox({
            Target: {
                ID: L1_ID,
                IsSaved: false,
                BaseAgentID: L0_ID,
                PreSaveBaseAgentID: null,
                OwnerUserID: alice.ID,
                PreSaveOwnerUserID: null,
                InstantiationMode: 'None',
                DriverClass: null,
                DriverClassDirty: false,
                Isolation: 'Worker',
                ExposeAsAction: false,
                MaxCostPerRun: 5,
                MaxTokensPerRun: 50000,
                MaxTimePerRun: 300,
                MaxIterationsPerRun: 10,
                Configuration: JSON.stringify({ allowWidenFromBase: true }),
            },
            User: alice,
            AllAgents: [root],
            AllPermissions: [],
        });
        expect(setTrueErrors.some((e) => /allowWidenFromBase/i.test(e.Message))).toBe(true);

        const clearErrors = ValidateAgentInheritanceAndSandbox({
            Target: {
                ID: L1_ID,
                IsSaved: true,
                BaseAgentID: L0_ID,
                PreSaveBaseAgentID: L0_ID,
                OwnerUserID: alice.ID,
                PreSaveOwnerUserID: alice.ID,
                InstantiationMode: 'None',
                DriverClass: null,
                DriverClassDirty: false,
                Isolation: 'Worker',
                ExposeAsAction: false,
                MaxCostPerRun: 5,
                MaxTokensPerRun: 50000,
                MaxTimePerRun: 300,
                MaxIterationsPerRun: 10,
                Configuration: JSON.stringify({}),
                PreSaveConfiguration: JSON.stringify({ allowWidenFromBase: true }),
                DirtyFields: new Set(['Configuration']),
            },
            User: alice,
            AllAgents: [root],
            AllPermissions: [],
        });
        expect(clearErrors.some((e) => /allowWidenFromBase/i.test(e.Message))).toBe(true);
    });

    it('rejects Admin widening WITHOUT allowWidenFromBase: true across all narrow-only surfaces (no save/runtime split-brain)', () => {
        const admin = makeAdminUser();
        const root = baseRootAgent();

        const errors = ValidateAgentInheritanceAndSandbox({
            Target: {
                ID: L1_ID,
                IsSaved: false,
                BaseAgentID: L0_ID,
                PreSaveBaseAgentID: null,
                OwnerUserID: admin.ID,
                PreSaveOwnerUserID: null,
                InstantiationMode: 'Optional',
                DriverClass: null,
                DriverClassDirty: false,
                Isolation: 'Worker',
                ExposeAsAction: false,
                MaxCostPerRun: 25,
                MaxTokensPerRun: 50000,
                MaxTimePerRun: 300,
                MaxIterationsPerRun: 10,
                SearchScopeAccess: 'All',
                RequirePlanMode: false,
                SupportsPlanMode: true,
                ArtifactCreationMode: 'Always',
                MessageMode: 'All',
                MaxMessages: 50,
                PayloadDownstreamPaths: '["customer.name","secret.key"]',
                PayloadScope: '/billing',
                AttachmentRootPath: '/other/root',
                ScopeConfig: '{"tenant":"evil","regions":["apac"]}',
                AutoArchiveEnabled: false,
                AgentTypePromptParams: '{"enableHandoff":true}',
                Configuration: null,
            },
            User: admin,
            AllAgents: [root],
            AllPermissions: [],
        });

        const sources = new Set(errors.map((e) => e.Source));
        expect(sources.has('MaxCostPerRun')).toBe(true);
        expect(sources.has('SearchScopeAccess')).toBe(true);
        expect(sources.has('RequirePlanMode')).toBe(true);
        expect(sources.has('SupportsPlanMode')).toBe(true);
        expect(sources.has('ArtifactCreationMode')).toBe(true);
        expect(sources.has('MessageMode')).toBe(true);
        expect(sources.has('MaxMessages')).toBe(true);
        expect(sources.has('PayloadDownstreamPaths')).toBe(true);
        expect(sources.has('PayloadScope')).toBe(true);
        expect(sources.has('AttachmentRootPath')).toBe(true);
        expect(sources.has('ScopeConfig')).toBe(true);
        expect(sources.has('AutoArchiveEnabled')).toBe(true);
        expect(sources.has('AgentTypePromptParams')).toBe(true);
        expect(errors.every((e) => /allowWidenFromBase/i.test(e.Message))).toBe(true);
    });

    it('allows Admin widening WITH allowWidenFromBase: true while STILL enforcing Isolation minimum, .. traversal rejection, cross-cascade Min<=Max, and L2 narrowing beneath L1', () => {
        const admin = makeAdminUser();
        const root = baseRootAgent();

        // 1. Even with allowWidenFromBase: true, Isolation loosening + .. traversal + Min>Max are rejected!
        const unconditionalErrors = ValidateAgentInheritanceAndSandbox({
            Target: {
                ID: L1_ID,
                IsSaved: false,
                BaseAgentID: L0_ID,
                PreSaveBaseAgentID: null,
                OwnerUserID: admin.ID,
                PreSaveOwnerUserID: null,
                InstantiationMode: 'Optional',
                DriverClass: null,
                DriverClassDirty: false,
                Isolation: 'InProcess', // violates root Worker!
                ExposeAsAction: false,
                MaxCostPerRun: 50,
                MaxTokensPerRun: 500000,
                MaxTimePerRun: 1200,
                MaxIterationsPerRun: 50,
                MinExecutionsPerRun: 6, // exceeds root MaxExecutionsPerRun=4!
                PayloadScope: '/analysis/../secret',
                AttachmentRootPath: '/org/acme/../hr',
                Configuration: JSON.stringify({ allowWidenFromBase: true }),
            },
            User: admin,
            AllAgents: [root],
            AllPermissions: [],
        });
        expect(unconditionalErrors.some((e) => e.Source === 'Isolation')).toBe(true);
        expect(unconditionalErrors.some((e) => e.Source === 'PayloadScope')).toBe(true);
        expect(unconditionalErrors.some((e) => e.Source === 'AttachmentRootPath')).toBe(true);
        expect(unconditionalErrors.some((e) => e.Source === 'MinExecutionsPerRun')).toBe(true);
        // Meanwhile widened MaxCostPerRun was permitted!
        expect(unconditionalErrors.some((e) => e.Source === 'MaxCostPerRun')).toBe(false);

        // 2. Valid L1 rebase tier establishes new baseline (MaxCostPerRun=25), then L2 narrows under L1
        const l1Rebase: AgentSandboxValidationContext['AllAgents'][number] = {
            ...root,
            ID: L1_ID,
            Name: 'L1 Rebase Tier',
            BaseAgentID: L0_ID,
            MaxCostPerRun: 25,
            Configuration: JSON.stringify({
                allowWidenFromBase: true,
                execution: { requirePlanMode: false },
            }),
        };

        // L2 with MaxCostPerRun=15 (above L0=5, within L1=25) -> VALID!
        const l2Valid = ValidateAgentInheritanceAndSandbox({
            Target: {
                ID: L2_ID,
                IsSaved: false,
                BaseAgentID: L1_ID,
                PreSaveBaseAgentID: null,
                OwnerUserID: admin.ID,
                PreSaveOwnerUserID: null,
                InstantiationMode: 'None',
                DriverClass: null,
                DriverClassDirty: false,
                Isolation: 'Worker',
                ExposeAsAction: false,
                MaxCostPerRun: 15,
                MaxTokensPerRun: 50000,
                MaxTimePerRun: 300,
                MaxIterationsPerRun: 10,
                Configuration: JSON.stringify({ execution: { requirePlanMode: false } }),
            },
            User: admin,
            AllAgents: [root, l1Rebase],
            AllPermissions: [],
        });
        expect(l2Valid).toEqual([]);

        // L2 with MaxCostPerRun=30 (exceeds L1=25) -> REJECTED!
        const l2TooHigh = ValidateAgentInheritanceAndSandbox({
            Target: {
                ID: L2_ID,
                IsSaved: false,
                BaseAgentID: L1_ID,
                PreSaveBaseAgentID: null,
                OwnerUserID: admin.ID,
                PreSaveOwnerUserID: null,
                InstantiationMode: 'None',
                DriverClass: null,
                DriverClassDirty: false,
                Isolation: 'Worker',
                ExposeAsAction: false,
                MaxCostPerRun: 30,
                MaxTokensPerRun: 50000,
                MaxTimePerRun: 300,
                MaxIterationsPerRun: 10,
                Configuration: null,
            },
            User: admin,
            AllAgents: [root, l1Rebase],
            AllPermissions: [],
        });
        expect(l2TooHigh.some((e) => e.Source === 'MaxCostPerRun')).toBe(true);
    });

    it('guards relational join saves across Actions, Relationships, Skills, ClientTools, and Modalities', () => {
        const ACT1 = '20000000-0000-4000-8000-000000000001';
        const ACT2 = '20000000-0000-4000-8000-000000000002';
        const agents = [
            { ID: L0_ID, Name: 'L0 Root', BaseAgentID: null, Configuration: null },
            { ID: L1_ID, Name: 'L1 Strict', BaseAgentID: L0_ID, Configuration: null },
            { ID: L2_ID, Name: 'L1 Widen', BaseAgentID: L0_ID, Configuration: JSON.stringify({ allowWidenFromBase: true }) },
        ];
        const ancestorRows = [
            { AgentID: L0_ID, GrantTargetID: ACT1, IsActiveGrant: true, MaxExecutionsPerRun: 3, MinExecutionsPerRun: 1 },
        ];

        // Net-new Active action on strict derived agent -> REJECTED
        const netNewErr = ValidateDerivedAgentRelationalGrant({
            Kind: 'Action',
            FieldName: 'ActionID',
            TargetAgentID: L1_ID,
            GrantTargetID: ACT2,
            IsActiveGrant: true,
            AllAgents: agents,
            AncestorJoinRows: ancestorRows,
        });
        expect(netNewErr).toHaveLength(1);
        expect(netNewErr[0].Message).toMatch(/allowWidenFromBase/i);

        // Veto (Status = Revoked -> IsActiveGrant = false) on strict derived agent -> ALLOWED
        const vetoErr = ValidateDerivedAgentRelationalGrant({
            Kind: 'Action',
            FieldName: 'ActionID',
            TargetAgentID: L1_ID,
            GrantTargetID: ACT1,
            IsActiveGrant: false,
            AllAgents: agents,
            AncestorJoinRows: ancestorRows,
        });
        expect(vetoErr).toEqual([]);

        // Narrowing per-action bounds on inherited action -> ALLOWED; widening -> REJECTED
        expect(
            ValidateDerivedAgentRelationalGrant({
                Kind: 'Action',
                FieldName: 'ActionID',
                TargetAgentID: L1_ID,
                GrantTargetID: ACT1,
                IsActiveGrant: true,
                AllAgents: agents,
                AncestorJoinRows: ancestorRows,
                TargetBounds: { MaxExecutionsPerRun: 2, MinExecutionsPerRun: 1 },
            })
        ).toEqual([]);
        const boundWidenErr = ValidateDerivedAgentRelationalGrant({
            Kind: 'Action',
            FieldName: 'ActionID',
            TargetAgentID: L1_ID,
            GrantTargetID: ACT1,
            IsActiveGrant: true,
            AllAgents: agents,
            AncestorJoinRows: ancestorRows,
            TargetBounds: { MaxExecutionsPerRun: 10 },
        });
        expect(boundWidenErr.some((e) => e.Source === 'MaxExecutionsPerRun')).toBe(true);

        // Net-new Active action on allowWidenFromBase: true derived agent -> ALLOWED
        expect(
            ValidateDerivedAgentRelationalGrant({
                Kind: 'Action',
                FieldName: 'ActionID',
                TargetAgentID: L2_ID,
                GrantTargetID: ACT2,
                IsActiveGrant: true,
                AllAgents: agents,
                AncestorJoinRows: ancestorRows,
            })
        ).toEqual([]);

        // Net-new grant on root agent -> ALLOWED
        expect(
            ValidateDerivedAgentRelationalGrant({
                Kind: 'Skill',
                FieldName: 'SkillID',
                TargetAgentID: L0_ID,
                GrantTargetID: ACT2,
                IsActiveGrant: true,
                AllAgents: agents,
                AncestorJoinRows: [],
            })
        ).toEqual([]);
    });
});
