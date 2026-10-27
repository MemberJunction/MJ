import { describe, it, expect, beforeEach } from 'vitest';
import { UserInfo } from '@memberjunction/core';
import {
    MJAIAgentUserPolicyEntity,
    MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule,
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '../AgentUserPolicyEngine';

interface MockPolicyShape {
    ID: string;
    AgentID: string;
    UserID: string;
    DisplayNameOverride: string | null;
    PreferredPersonaID: string | null;
    Status: MJAIAgentUserPolicyEntity['Status'];
    OnboardingStatus: MJAIAgentUserPolicyEntity['OnboardingStatus'];
    CoordinationMode: MJAIAgentUserPolicyEntity['CoordinationMode'];
    DefaultDataAccessMode: MJAIAgentUserPolicyEntity['DefaultDataAccessMode'];
    EmailChannelMode: MJAIAgentUserPolicyEntity['EmailChannelMode'];
    CalendarChannelMode: MJAIAgentUserPolicyEntity['CalendarChannelMode'];
    PhoneChannelMode: MJAIAgentUserPolicyEntity['PhoneChannelMode'];
    MessagingChannelMode: MJAIAgentUserPolicyEntity['MessagingChannelMode'];
    AllowInterAgentCoordination: boolean;
    RequireApprovalForExternalComms: boolean;
    RequireApprovalForFinancials: boolean;
    RequireApprovalForDestructiveActions: boolean;
    AutoApproveAmountThreshold: number | null;
    EntityAccessRules: string | null;
    EntityAccessRulesObject: MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[] | null;
    ActionPolicyRules: string | null;
    ActionPolicyRulesObject: MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[] | null;
    InstructionsOverride: string | null;
}

function buildPolicy(overrides: Partial<MockPolicyShape> = {}): MJAIAgentUserPolicyEntity {
    const base: MockPolicyShape = {
        ID: 'policy-1',
        AgentID: 'agent-cos',
        UserID: 'user-alice-1',
        DisplayNameOverride: 'Maya',
        PreferredPersonaID: null,
        Status: 'Active',
        OnboardingStatus: 'Completed',
        CoordinationMode: 'Coordinator',
        DefaultDataAccessMode: 'UserCeiling',
        EmailChannelMode: 'DraftOnly',
        CalendarChannelMode: 'ProposeWithApproval',
        PhoneChannelMode: 'OutboundWithApproval',
        MessagingChannelMode: 'Enabled',
        AllowInterAgentCoordination: true,
        RequireApprovalForExternalComms: true,
        RequireApprovalForFinancials: true,
        RequireApprovalForDestructiveActions: true,
        AutoApproveAmountThreshold: 250,
        EntityAccessRules: null,
        EntityAccessRulesObject: null,
        ActionPolicyRules: null,
        ActionPolicyRulesObject: null,
        InstructionsOverride: 'Keep executive briefings concise and bulleted.',
        ...overrides,
    };
    return base as unknown as MJAIAgentUserPolicyEntity;
}

const aliceUser = {
    ID: 'user-alice-1',
    Name: 'Alice Executive',
    Email: 'alice@example.com',
    IsActive: true,
} as UserInfo;

describe('AgentUserPolicyEngine', () => {
    const engine = AgentUserPolicyEngine.Instance;

    beforeEach(() => {
        engine.ClearCache();
    });

    describe('Entity Access Evaluation — Ceiling, CRUD, RLS, FLS, Time Windows', () => {
        it('enforces the user permission ceiling even when the agent policy rule says ReadWrite', () => {
            const policy = buildPolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'MJ_BizApps_Accounting:*',
                        access: 'ReadWrite',
                    },
                ],
            });

            const result = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Accounting: Journal Entries',
                operation: 'Create',
                contextUser: aliceUser,
                policy,
                userPermissionCeiling: {
                    canRead: true,
                    canCreate: false,
                    canUpdate: false,
                    canDelete: false,
                },
            });

            expect(result.verdict).toBe('Deny');
            expect(result.reason).toContain('cannot exceed the user\'s permission ceiling');
        });

        it('enforces DefaultDataAccessMode ReadOnly and AllowListOnly when no explicit rule matches', () => {
            const readOnlyPolicy = buildPolicy({ DefaultDataAccessMode: 'ReadOnly' });
            expect(
                engine.EvaluateEntityAccess({
                    entityName: 'MJ_BizApps_Tasks: Tasks',
                    operation: 'Read',
                    contextUser: aliceUser,
                    policy: readOnlyPolicy,
                }).verdict
            ).toBe('Allow');
            expect(
                engine.EvaluateEntityAccess({
                    entityName: 'MJ_BizApps_Tasks: Tasks',
                    operation: 'Update',
                    contextUser: aliceUser,
                    policy: readOnlyPolicy,
                }).verdict
            ).toBe('Deny');

            const allowListPolicy = buildPolicy({
                DefaultDataAccessMode: 'AllowListOnly',
                EntityAccessRulesObject: [{ entityPattern: 'MJ_BizApps_Tasks:*', access: 'ReadWrite' }],
            });
            expect(
                engine.EvaluateEntityAccess({
                    entityName: 'MJ_BizApps_Issues: Issues',
                    operation: 'Read',
                    contextUser: aliceUser,
                    policy: allowListPolicy,
                }).verdict
            ).toBe('Deny');
        });

        it('validates and interpolates RLS whereClause and evaluates recordConditionExpression', () => {
            const policy = buildPolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'MJ_BizApps_Sales: Deals',
                        access: 'ReadWrite',
                        rlsNarrowing: {
                            whereClause: 'OwnerUserID = {{UserID}} AND Stage <> \'Archived\'',
                            recordConditionExpression: 'record.Amount <= 50000 && record.OwnerUserID === user.ID',
                        },
                    },
                ],
            });

            const allowed = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Sales: Deals',
                operation: 'Update',
                contextUser: aliceUser,
                policy,
                record: { Amount: 25000, OwnerUserID: 'user-alice-1' },
            });
            expect(allowed.verdict).toBe('Allow');
            expect(allowed.combinedRlsWhereClause).toBe("(OwnerUserID = 'user-alice-1' AND Stage <> 'Archived')");

            const deniedByRecord = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Sales: Deals',
                operation: 'Update',
                contextUser: aliceUser,
                policy,
                record: { Amount: 120000, OwnerUserID: 'user-alice-1' },
            });
            expect(deniedByRecord.verdict).toBe('Deny');
            expect(deniedByRecord.reason).toContain('recordConditionExpression');
        });

        it('rejects unsafe SQL injection in RLS whereClause via SQLExpressionValidator', () => {
            const policy = buildPolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: '*',
                        access: 'ReadOnly',
                        rlsNarrowing: {
                            whereClause: '1=1; DROP TABLE __mj.User --',
                        },
                    },
                ],
            });

            const result = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Tasks: Tasks',
                operation: 'Read',
                contextUser: aliceUser,
                policy,
            });
            expect(result.verdict).toBe('Deny');
            expect(result.reason).toContain('SQLExpressionValidator');
        });

        it('enforces FLS deniedFields, readOnlyFields, requireApprovalFields, and MaskRecordFields', () => {
            const policy = buildPolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'MJ_BizApps_Common: People',
                        access: 'ReadWrite',
                        flsNarrowing: {
                            deniedFields: ['*SSN*', 'TaxID'],
                            readOnlyFields: ['LinkedUserID'],
                            requireApprovalFields: ['Email', 'PrimaryPhone'],
                        },
                    },
                ],
            });

            const deniedMutation = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Common: People',
                operation: 'Update',
                contextUser: aliceUser,
                policy,
                mutatedFields: ['FirstName', 'LinkedUserID'],
            });
            expect(deniedMutation.verdict).toBe('Deny');
            expect(deniedMutation.reason).toContain('LinkedUserID');

            const approvalMutation = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Common: People',
                operation: 'Update',
                contextUser: aliceUser,
                policy,
                mutatedFields: ['FirstName', 'Email'],
            });
            expect(approvalMutation.verdict).toBe('RequireApproval');

            const masked = engine.MaskRecordFields(
                {
                    ID: 'p-1',
                    FirstName: 'Alice',
                    EncryptedSSN: '123-45-6789',
                    TaxID: '99-999999',
                },
                approvalMutation.deniedFieldPatterns
            );
            expect(masked).toEqual({ ID: 'p-1', FirstName: 'Alice' });
        });

        it('evaluates timeWindows and outsideWindowBehavior (ReadOnly, DeferUntilNextWindow)', () => {
            const policy = buildPolicy({
                EntityAccessRulesObject: [
                    {
                        entityPattern: 'MJ_BizApps_Tasks: Tasks',
                        access: 'ReadWrite',
                        timeWindows: [
                            {
                                daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                                startTime: '08:00',
                                endTime: '18:00',
                                timezone: 'UTC',
                                outsideWindowBehavior: 'DeferUntilNextWindow',
                            },
                        ],
                    },
                ],
            });

            // Saturday 2026-10-17T12:00:00Z is outside Mon-Fri 08:00-18:00
            const saturdayNoon = new Date('2026-10-17T12:00:00Z');
            const outOfWindow = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Tasks: Tasks',
                operation: 'Update',
                contextUser: aliceUser,
                policy,
                now: saturdayNoon,
            });
            expect(outOfWindow.verdict).toBe('DeferUntilNextWindow');
            expect(outOfWindow.nextWindowStartISO).toBe('2026-10-19T08:00:00.000Z'); // Monday 08:00 UTC

            // Monday 2026-10-19T10:00:00Z is inside window
            const mondayMorning = new Date('2026-10-19T10:00:00Z');
            const inWindow = engine.EvaluateEntityAccess({
                entityName: 'MJ_BizApps_Tasks: Tasks',
                operation: 'Update',
                contextUser: aliceUser,
                policy,
                now: mondayMorning,
            });
            expect(inWindow.verdict).toBe('Allow');
        });
    });

    describe('Action Policy Evaluation — Guardrails, Conditions & Time Windows', () => {
        it('requires approval for external communications and financial thresholds', () => {
            const policy = buildPolicy({
                RequireApprovalForExternalComms: true,
                RequireApprovalForFinancials: false,
                AutoApproveAmountThreshold: 250,
            });

            const externalComms = engine.EvaluateActionExecution({
                actionName: 'Send Single Message',
                params: { IsExternal: true, Recipient: 'vendor@external.com' },
                contextUser: aliceUser,
                policy,
            });
            expect(externalComms.verdict).toBe('RequireApproval');

            const lowAmount = engine.EvaluateActionExecution({
                actionName: 'Approve Expense',
                params: { Amount: 120 },
                contextUser: aliceUser,
                policy,
            });
            expect(lowAmount.verdict).toBe('Allow');

            const highAmount = engine.EvaluateActionExecution({
                actionName: 'Approve Expense',
                params: { Amount: 650 },
                contextUser: aliceUser,
                policy,
            });
            expect(highAmount.verdict).toBe('RequireApproval');
            expect(highAmount.reason).toContain('AutoApproveAmountThreshold');
        });

        it('evaluates ActionPolicyRules with conditionExpression and timeWindows', () => {
            const policy = buildPolicy({
                RequireApprovalForExternalComms: false,
                ActionPolicyRulesObject: [
                    {
                        actionPattern: '*Outbound Call*',
                        policy: 'Allow',
                        timeWindows: [
                            {
                                daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                                startTime: '09:00',
                                endTime: '17:00',
                                timezone: 'UTC',
                                outsideWindowBehavior: 'RequireApproval',
                            },
                        ],
                    },
                    {
                        actionPattern: '*Nudge*',
                        policy: 'Deny',
                        conditionExpression: 'params.Urgency === "Low"',
                    },
                ],
            });

            const weekendCall = engine.EvaluateActionExecution({
                actionName: 'Prepare Outbound Call Brief',
                params: {},
                contextUser: aliceUser,
                policy,
                now: new Date('2026-10-17T14:00:00Z'), // Saturday
            });
            expect(weekendCall.verdict).toBe('RequireApproval');

            const lowUrgencyNudge = engine.EvaluateActionExecution({
                actionName: 'Send Owner Nudge',
                params: { Urgency: 'Low' },
                contextUser: aliceUser,
                policy,
            });
            expect(lowUrgencyNudge.verdict).toBe('Deny');

            const highUrgencyNudge = engine.EvaluateActionExecution({
                actionName: 'Send Owner Nudge',
                params: { Urgency: 'High' },
                contextUser: aliceUser,
                policy,
            });
            expect(highUrgencyNudge.verdict).toBe('Allow');
        });

        it('formats BuildPromptPolicyContextBlock with onboarding status, CalendarChannelMode, and standing instructions', () => {
            const policy = buildPolicy();
            const block = engine.BuildPromptPolicyContextBlock(policy, aliceUser);
            expect(block).toContain('Maya');
            expect(block).toContain('Coordinator');
            expect(block).toContain('Calendar=`ProposeWithApproval`');
            expect(block).toContain('Keep executive briefings concise and bulleted.');
        });

        it('evaluates CalendarChannelMode and EmailChannelMode verdicts accurately', () => {
            const proposePolicy = buildPolicy({ CalendarChannelMode: 'ProposeWithApproval', EmailChannelMode: 'DraftOnly' });
            expect(engine.EvaluateCalendarOperation(proposePolicy, false).verdict).toBe('Allow');
            expect(engine.EvaluateCalendarOperation(proposePolicy, true).verdict).toBe('RequireApproval');
            expect(engine.EvaluateEmailOperation(proposePolicy, 'Read').verdict).toBe('Allow');
            expect(engine.EvaluateEmailOperation(proposePolicy, 'Draft').verdict).toBe('Allow');
            expect(engine.EvaluateEmailOperation(proposePolicy, 'Send').verdict).toBe('Deny');

            const readOnlyCal = buildPolicy({ CalendarChannelMode: 'ReadOnly' });
            expect(engine.EvaluateCalendarOperation(readOnlyCal, false).verdict).toBe('Allow');
            expect(engine.EvaluateCalendarOperation(readOnlyCal, true).verdict).toBe('Deny');

            const autonomousCal = buildPolicy({ CalendarChannelMode: 'Autonomous', EmailChannelMode: 'SendAsUser' });
            expect(engine.EvaluateCalendarOperation(autonomousCal, true).verdict).toBe('Allow');
            expect(engine.EvaluateEmailOperation(autonomousCal, 'Send').verdict).toBe('RequireApproval');
        });
    });
});
