import { describe, expect, it } from 'vitest';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import {
    AgentUserPolicyEngine,
    DeepMergeAgentConfigObjects,
    MAX_AGENT_INHERITANCE_DEPTH,
    ParseAgentInstantiationConfig,
    ResolveAgentRunLimits,
} from '../index';

function makePolicy(overrides: Partial<MJAIAgentUserPolicyEntity> = {}): MJAIAgentUserPolicyEntity {
    const base = Object.create(MJAIAgentUserPolicyEntity.prototype) as MJAIAgentUserPolicyEntity;
    const fields: Partial<MJAIAgentUserPolicyEntity> = {
        ID: 'policy-1',
        AgentID: 'agent-1',
        UserID: 'user-1',
        Status: 'Active',
        CoordinationMode: 'Autonomous',
        AllowInterAgentCoordination: true,
        DefaultDataAccessMode: 'UserCeiling',
        EmailChannelMode: 'SendAsAgent',
        PhoneChannelMode: 'OutboundWithApproval',
        CalendarChannelMode: 'ProposeWithApproval',
        MessagingChannelMode: 'Enabled',
        RequireApprovalForExternalComms: false,
        RequireApprovalForFinancials: false,
        RequireApprovalForDestructiveActions: false,
        AutoApproveAmountThreshold: 500,
        DisplayNameOverride: null,
        InstructionsOverride: null,
        PreferredPersonaID: null,
        EntityAccessRules: null,
        ActionPolicyRules: null,
        EntityAccessRulesObject: null,
        ActionPolicyRulesObject: null,
        ...overrides,
    };
    for (const key of Object.keys(fields) as Array<keyof MJAIAgentUserPolicyEntity>) {
        Object.defineProperty(base, key, {
            value: fields[key],
            enumerable: true,
            configurable: true,
            writable: true,
        });
    }
    return base;
}

describe('ParseAgentInstantiationConfig & DeepMergeAgentConfigObjects', () => {
    it('parses valid TypeConfiguration.instantiation fields', () => {
        const raw = JSON.stringify({
            realtime: { directActions: { enabled: true } },
            instantiation: {
                suggestedNames: ['Pepper', 'Cato', '  '],
                suggestedIcons: ['fa-solid fa-pepper-hot'],
                suggestedPersonaNames: ['Sage', 'Nova'],
                maxInstancesPerUser: 3.9,
                onboardingGreeting: '  Welcome!  ',
                personalityPresets: [
                    {
                        label: 'Direct & Witty',
                        tone: 'Direct and dryly witty',
                        speakingStyle: 'Concise, zero fluff',
                    },
                    { label: '', tone: 'invalid', speakingStyle: 'invalid' },
                ],
            },
        });

        const parsed = ParseAgentInstantiationConfig(raw);
        expect(parsed).toEqual({
            suggestedNames: ['Pepper', 'Cato'],
            suggestedIcons: ['fa-solid fa-pepper-hot'],
            suggestedPersonaNames: ['Sage', 'Nova'],
            maxInstancesPerUser: 3,
            onboardingGreeting: 'Welcome!',
            personalityPresets: [
                {
                    label: 'Direct & Witty',
                    tone: 'Direct and dryly witty',
                    speakingStyle: 'Concise, zero fluff',
                },
            ],
        });
    });

    it('returns null when absent, malformed, or not an object', () => {
        expect(ParseAgentInstantiationConfig(null)).toBeNull();
        expect(ParseAgentInstantiationConfig('')).toBeNull();
        expect(ParseAgentInstantiationConfig('not-json')).toBeNull();
        expect(ParseAgentInstantiationConfig('[]')).toBeNull();
        expect(ParseAgentInstantiationConfig('{"realtime":{}}')).toBeNull();
    });

    it('deep-merges nested JSON objects without mutating inputs', () => {
        const base = { realtime: { directActions: { enabled: true, timeoutMs: 5000 } }, flag: true };
        const child = { realtime: { directActions: { timeoutMs: 2000 } }, extra: 'ok' };
        const merged = DeepMergeAgentConfigObjects(base, child);
        expect(merged).toEqual({
            realtime: { directActions: { enabled: true, timeoutMs: 2000 } },
            flag: true,
            extra: 'ok',
        });
        expect(base.realtime.directActions.timeoutMs).toBe(5000);
        expect(MAX_AGENT_INHERITANCE_DEPTH).toBe(5);
    });
});

describe('AgentUserPolicyEngine.IntersectPolicies (multi-level ceiling inheritance)', () => {
    const engine = AgentUserPolicyEngine.Instance;

    it('returns null for empty list and returns single policy directly in O(1)', () => {
        expect(engine.IntersectPolicies([])).toBeNull();
        const single = makePolicy({ DisplayNameOverride: 'Pepper' });
        expect(engine.IntersectPolicies([null, single, undefined])).toBe(single);
    });

    it('enforces strictest-wins ceilings across [root -> department -> leaf] policies', () => {
        const rootPolicy = makePolicy({
            AgentID: 'cos-root',
            CoordinationMode: 'Autonomous',
            DefaultDataAccessMode: 'UserCeiling',
            EmailChannelMode: 'SendAsAgent',
            RequireApprovalForExternalComms: true,
            AutoApproveAmountThreshold: 250,
            InstructionsOverride: 'Root policy rule',
            EntityAccessRules: JSON.stringify([{ entityPattern: 'HR:*', access: 'Deny' }]),
        });
        const deptPolicy = makePolicy({
            AgentID: 'sales-cos',
            CoordinationMode: 'Coordinator',
            DefaultDataAccessMode: 'ReadOnly',
            EmailChannelMode: 'DraftOnly',
            RequireApprovalForFinancials: true,
            AutoApproveAmountThreshold: 100,
            InstructionsOverride: 'Sales rule',
            ActionPolicyRules: JSON.stringify([{ actionPattern: 'Send*', policy: 'RequireApproval' }]),
        });
        const leafPolicy = makePolicy({
            AgentID: 'pepper',
            DisplayNameOverride: 'Pepper',
            PreferredPersonaID: 'persona-sage',
            // Attempt to widen everything on the leaf — must be clamped by ancestors!
            CoordinationMode: 'Autonomous',
            DefaultDataAccessMode: 'UserCeiling',
            EmailChannelMode: 'SendAsUser',
            RequireApprovalForExternalComms: false,
            RequireApprovalForFinancials: false,
            AutoApproveAmountThreshold: 1000,
            InstructionsOverride: 'Be witty',
            EntityAccessRules: JSON.stringify([{ entityPattern: 'Finance:*', access: 'ReadOnly' }]),
        });

        const effective = engine.IntersectPolicies([rootPolicy, deptPolicy, leafPolicy]);
        expect(effective).not.toBeNull();
        expect(effective!.CoordinationMode).toBe('Coordinator');
        expect(effective!.DefaultDataAccessMode).toBe('ReadOnly');
        expect(effective!.EmailChannelMode).toBe('DraftOnly');
        expect(effective!.RequireApprovalForExternalComms).toBe(true);
        expect(effective!.RequireApprovalForFinancials).toBe(true);
        expect(effective!.AutoApproveAmountThreshold).toBe(100);
        expect(effective!.DisplayNameOverride).toBe('Pepper');
        expect(effective!.PreferredPersonaID).toBe('persona-sage');
        expect(effective!.InstructionsOverride).toBe('Root policy rule\n\nSales rule\n\nBe witty');
        expect(effective!.EntityAccessRulesObject).toHaveLength(2);
        expect(effective!.ActionPolicyRulesObject).toHaveLength(1);
    });

    it('treats null AutoApproveAmountThreshold on any ancestor as stricter than finite leaf threshold', () => {
        const ancestor = makePolicy({ AutoApproveAmountThreshold: null });
        const leaf = makePolicy({ AutoApproveAmountThreshold: 500 });
        const effective = engine.IntersectPolicies([ancestor, leaf]);
        expect(effective!.AutoApproveAmountThreshold).toBeNull();
    });
});

describe('ResolveAgentRunLimits with AncestorAgents & AncestorUserPolicies', () => {
    it('clamps child agent MaxCostPerRun / MaxTokensPerRun / MaxTimePerRun to ancestor ceilings', () => {
        const result = ResolveAgentRunLimits({
            AncestorAgents: [
                {
                    MaxCostPerRun: 2.0,
                    MaxTokensPerRun: 50000,
                    MaxTimePerRun: 120,
                    TypeConfiguration: null,
                },
            ],
            Agent: {
                // Child attempts to raise cost and time, while narrowing tokens
                MaxCostPerRun: 10.0,
                MaxTokensPerRun: 20000,
                MaxTimePerRun: 600,
                TypeConfiguration: null,
            },
        });

        expect(result.Limits.Budgets.PerRun.MaxCostUsd).toBe(2.0);
        expect(result.Limits.Budgets.PerRun.MaxTokens).toBe(20000);
        expect(result.Limits.Budgets.PerRun.MaxWallClockMs).toBe(120000);
    });

    it('E2 (F1): places mj.config.cjs limits at the root ceiling so user instance policy can only narrow, never raise org ceilings', () => {
        const leafPolicy = makePolicy({
            AgentID: 'pepper',
            Status: 'Active',
        });

        const result = ResolveAgentRunLimits({
            MjConfigLimits: {
                AgentAbsoluteIterations: 4_000,
                Budgets: {
                    PerRun: { MaxCostUsd: 5.0, MaxWallClockMs: 180_000 },
                    PerUserPerDay: { MaxCostUsd: 25.0 },
                },
            },
            UserPolicy: leafPolicy,
            UserPolicyLimitsOverride: {
                // Attempts to raise cost and iterations above mj.config.cjs while narrowing wall clock
                AgentAbsoluteIterations: 20_000,
                Budgets: {
                    PerRun: { MaxCostUsd: 50.0, MaxWallClockMs: 60_000 },
                    PerUserPerDay: { MaxCostUsd: null },
                },
            },
        });

        expect(result.Limits.AgentAbsoluteIterations).toBe(4_000);
        expect(result.Provenance.AgentAbsoluteIterations.SourceTier).toBe('MjConfig');
        expect(result.Provenance.AgentAbsoluteIterations.WasClampedByPolicyCeiling).toBe(true);

        expect(result.Limits.Budgets.PerRun.MaxCostUsd).toBe(5.0);
        expect(result.Provenance['Budgets.PerRun.MaxCostUsd'].SourceTier).toBe('MjConfig');
        expect(result.Provenance['Budgets.PerRun.MaxCostUsd'].WasClampedByPolicyCeiling).toBe(true);

        expect(result.Limits.Budgets.PerUserPerDay.MaxCostUsd).toBe(25.0);
        expect(result.Provenance['Budgets.PerUserPerDay.MaxCostUsd'].SourceTier).toBe('MjConfig');

        expect(result.Limits.Budgets.PerRun.MaxWallClockMs).toBe(60_000);
        expect(result.Provenance['Budgets.PerRun.MaxWallClockMs'].SourceTier).toBe('UserAgentPolicy');
    });
});
