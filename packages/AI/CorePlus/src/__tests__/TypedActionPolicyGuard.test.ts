import { describe, it, expect, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import { MJAIAgentUserPolicyEntity } from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '../AgentUserPolicyEngine';
import { TypedActionPolicyGuard } from '../TypedActionPolicyGuard';

function makePolicy(overrides: Partial<MJAIAgentUserPolicyEntity> = {}): MJAIAgentUserPolicyEntity {
    return {
        ID: 'pol-1',
        AgentID: 'agent-cos',
        UserID: 'user-alice',
        DisplayNameOverride: null,
        PreferredPersonaID: null,
        Status: 'Active',
        OnboardingStatus: 'Completed',
        CoordinationMode: 'Coordinator',
        DefaultDataAccessMode: 'UserCeiling',
        EmailChannelMode: 'DraftOnly',
        CalendarChannelMode: 'ReadOnly',
        PhoneChannelMode: 'InboundOnly',
        MessagingChannelMode: 'Enabled',
        AllowInterAgentCoordination: true,
        RequireApprovalForExternalComms: true,
        RequireApprovalForFinancials: true,
        RequireApprovalForDestructiveActions: true,
        AutoApproveAmountThreshold: null,
        EntityAccessRules: null,
        EntityAccessRulesObject: null,
        ActionPolicyRules: null,
        ActionPolicyRulesObject: null,
        InstructionsOverride: null,
        ...overrides,
    } as unknown as MJAIAgentUserPolicyEntity;
}

const alice = {
    ID: 'user-alice',
    Name: 'Alice Executive',
    Email: 'alice@example.com',
    IsActive: true,
    Type: 'User',
    UserRoles: [],
} as unknown as UserInfo;

describe('TypedActionPolicyGuard & Sub-Agent Policy Ceiling', () => {
    const engine = AgentUserPolicyEngine.Instance;

    beforeEach(() => {
        engine.ClearCache();
    });

    it('allows direct non-agent calls when no executing agent context is active', async () => {
        const res = await TypedActionPolicyGuard.CheckEntityAccess({
            entityName: 'MJ_BizApps_Tasks: Tasks',
            operation: 'Create',
            contextUser: alice,
        });
        expect(res.Allowed).toBe(true);
        expect(res.Active).toBe(false);
    });

    it('blocks writes when active executing agent has DefaultDataAccessMode=ReadOnly', async () => {
        engine.SetCachedPolicy(
            makePolicy({
                AgentID: 'agent-cos',
                UserID: alice.ID,
                DefaultDataAccessMode: 'ReadOnly',
            })
        );

        const outcome = await engine.RunWithExecutingAgentContext('agent-cos', async () =>
            TypedActionPolicyGuard.CheckEntityAccess({
                entityName: 'MJ_BizApps_Tasks: Tasks',
                operation: 'Create',
                contextUser: alice,
            })
        );

        expect(outcome.Allowed).toBe(false);
        expect(outcome.ResultCode).toBe('POLICY_DENIED');
    });

    it('enforces strictest-wins across inherited parent policyCeilingAgentIds for delegated sub-agents', async () => {
        // Parent CoS is ReadOnly; delegated sub-agent Align Coach has permissive UserCeiling.
        // Parent ceiling MUST win so sub-agent cannot escalate privileges.
        engine.SetCachedPolicy(
            makePolicy({
                ID: 'pol-cos',
                AgentID: 'agent-cos',
                UserID: alice.ID,
                DefaultDataAccessMode: 'ReadOnly',
            })
        );
        engine.SetCachedPolicy(
            makePolicy({
                ID: 'pol-align',
                AgentID: 'agent-align',
                UserID: alice.ID,
                DefaultDataAccessMode: 'UserCeiling',
            })
        );

        const outcome = await engine.RunWithExecutingAgentContext(
            'agent-align',
            async () =>
                TypedActionPolicyGuard.CheckEntityAccess({
                    entityName: 'MJ_BizApps_Planning: Priorities',
                    operation: 'Update',
                    writeFields: ['Status'],
                    contextUser: alice,
                }),
            ['agent-cos']
        );

        expect(outcome.Allowed).toBe(false);
        expect(outcome.ResultCode).toBe('POLICY_DENIED');
    });

    it('unions DeniedFieldPatterns across parent and sub-agent policies and masks output rows', async () => {
        engine.SetCachedPolicy(
            makePolicy({
                ID: 'pol-cos',
                AgentID: 'agent-cos',
                UserID: alice.ID,
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'MJ_BizApps_Tasks: Tasks',
                        access: 'ReadWrite',
                        flsNarrowing: {
                            deniedFields: ['PrivateNotes'],
                        },
                    },
                ],
            })
        );
        engine.SetCachedPolicy(
            makePolicy({
                ID: 'pol-sub',
                AgentID: 'agent-sub',
                UserID: alice.ID,
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'MJ_BizApps_Tasks: Tasks',
                        access: 'ReadWrite',
                        flsNarrowing: {
                            deniedFields: ['BudgetAmount'],
                        },
                    },
                ],
            })
        );

        const outcome = await engine.RunWithExecutingAgentContext(
            'agent-sub',
            async () =>
                TypedActionPolicyGuard.CheckEntityAccess({
                    entityName: 'MJ_BizApps_Tasks: Tasks',
                    operation: 'Read',
                    contextUser: alice,
                }),
            ['agent-cos']
        );

        expect(outcome.Allowed).toBe(true);
        expect(outcome.DeniedFieldPatterns).toEqual(expect.arrayContaining(['PrivateNotes', 'BudgetAmount']));

        const masked = TypedActionPolicyGuard.MaskRows(
            [{ ID: 't1', Name: 'Launch', PrivateNotes: 'secret', BudgetAmount: 50000 }],
            outcome.DeniedFieldPatterns
        );
        expect(masked[0]).toEqual({ ID: 't1', Name: 'Launch' });
    });
});
