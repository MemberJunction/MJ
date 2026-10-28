import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { DetectVolatilePlaceholders } from '../volatile-child-prompt.js';
import type {
    MJAIAgentUserPolicyEntity,
    MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule,
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule,
} from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../../../');

describe('Chief of Staff End-to-End Metadata, Policy & Security Lifecycle', () => {
    const contextUser = {
        ID: 'user-exec-1',
        Name: 'Jordan Taylor',
        Email: 'jordan@example.com',
        IsActive: true,
    } as UserInfo;

    beforeEach(() => {
        AgentUserPolicyEngine.Instance.ClearCache();
    });

    it('ships valid Chief of Staff agent, prompt, template, and action metadata with KV-cache-clean template', () => {
        const agentMetaPath = path.join(REPO_ROOT, 'metadata/agents/.chief-of-staff-agent.json');
        const promptMetaPath = path.join(REPO_ROOT, 'metadata/prompts/.chief-of-staff-prompts.json');
        const actionMetaPath = path.join(REPO_ROOT, 'metadata/actions/.chief-of-staff-actions.json');
        const templatePath = path.join(REPO_ROOT, 'metadata/prompts/templates/chief-of-staff/chief-of-staff.template.md');

        expect(fs.existsSync(agentMetaPath)).toBe(true);
        expect(fs.existsSync(promptMetaPath)).toBe(true);
        expect(fs.existsSync(actionMetaPath)).toBe(true);
        expect(fs.existsSync(templatePath)).toBe(true);

        const agents = JSON.parse(fs.readFileSync(agentMetaPath, 'utf8')) as Array<{
            fields: { Name: string; TypeID: string };
            relatedEntities: { 'MJ: AI Agent Actions': Array<{ fields: { ActionID: string } }> };
        }>;
        expect(agents[0].fields.Name).toBe('Chief of Staff');
        expect(agents[0].fields.TypeID).toContain('Loop');

        const actionLookups = agents[0].relatedEntities['MJ: AI Agent Actions'].map((a) => a.fields.ActionID);
        expect(actionLookups).toContain('@lookup:MJ: Actions.Name=Schedule Next Agent Wake');
        expect(actionLookups).toContain('@lookup:MJ: Actions.Name=Configure Agent User Policy');
        expect(actionLookups).toContain('@lookup:MJ: Actions.Name=Send Inter-Agent Request');
        expect(actionLookups).toContain('@lookup:MJ: Actions.Name=Prepare Outbound Call Brief');

        const templateContent = fs.readFileSync(templatePath, 'utf8');
        expect(DetectVolatilePlaceholders(templateContent)).toEqual([]);
        expect(templateContent).toContain('Schedule Next Agent Wake');
        expect(templateContent).toContain('Configure Agent User Policy');
        expect(templateContent).toContain('MJ_BizApps_Tasks: Tasks');
        expect(templateContent).toContain('MJ_BizApps_Tasks: Task Check Ins');
        expect(templateContent).toContain('MJ_BizApps_Issues: Issues');
    });

    it('enforces onboarding policy, RLS/FLS entity narrowing, time windows, and action approval gates end-to-end', () => {
        const entityRules: MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[] = [
            {
                entityPattern: 'MJ_BizApps_Tasks:*',
                access: 'ReadWrite',
                rlsNarrowing: {
                    whereClause: "CreatedByPersonID = 'person-exec-1'",
                },
                flsNarrowing: {
                    deniedFields: ['InternalCostNotes'],
                    readOnlyFields: ['CreatedByPersonID'],
                },
            },
            {
                entityPattern: 'MJ_BizApps_Issues:*',
                access: 'ReadOnly',
            },
        ];

        const actionRules: MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[] = [
            {
                actionPattern: 'Schedule Next Agent Wake',
                policy: 'Allow',
            },
            {
                actionPattern: 'Send Single Message',
                policy: 'RequireApproval',
                rationale: 'External emails require explicit executive sign-off',
            },
            {
                actionPattern: 'Prepare Outbound Call Brief',
                policy: 'Allow',
                timeWindows: [
                    {
                        daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                        startTime: '00:00',
                        endTime: '23:59',
                        timezone: 'UTC',
                    },
                ],
            },
        ];

        const policy = {
            ID: 'policy-cos-1',
            AgentID: 'C05A8E01-4C11-4E8A-9B01-1A2B3C4D5E00',
            UserID: 'user-exec-1',
            Status: 'Active',
            DisplayNameOverride: 'Atlas',
            OnboardingStatus: 'Completed',
            CoordinationMode: 'Coordinator',
            EmailChannelMode: 'DraftOnly',
            PhoneChannelMode: 'OutboundWithApproval',
            MessagingChannelMode: 'Enabled',
            DefaultDataAccessMode: 'AllowListOnly',
            AllowInterAgentCoordination: true,
            RequireApprovalForExternalComms: true,
            RequireApprovalForFinancials: true,
            RequireApprovalForDestructiveActions: true,
            AutoApproveAmountThreshold: 250,
            InstructionsOverride: 'Focus on Q4 enterprise renewals and escalate any OffTrack Key Results immediately.',
            EntityAccessRules: JSON.stringify(entityRules),
            EntityAccessRulesObject: entityRules,
            ActionPolicyRules: JSON.stringify(actionRules),
            ActionPolicyRulesObject: actionRules,
        } as unknown as MJAIAgentUserPolicyEntity;

        const engine = AgentUserPolicyEngine.Instance;

        // 1. Tasks entity update allowed with narrowed RLS & FLS; Delete requires approval due to RequireApprovalForDestructiveActions; Issues write denied due to ReadOnly
        const taskUpdate = engine.EvaluateEntityAccess({
            entityName: 'MJ_BizApps_Tasks: Tasks',
            operation: 'Update',
            contextUser,
            policy,
            mutatedFields: ['HealthStatus', 'PercentComplete', 'CurrentValue'],
        });
        expect(taskUpdate.verdict).toBe('Allow');
        expect(taskUpdate.combinedRlsWhereClause).toBe("(CreatedByPersonID = 'person-exec-1')");
        expect(taskUpdate.deniedFieldPatterns).toEqual(['InternalCostNotes']);

        const taskDelete = engine.EvaluateEntityAccess({
            entityName: 'MJ_BizApps_Tasks: Tasks',
            operation: 'Delete',
            contextUser,
            policy,
        });
        expect(taskDelete.verdict).toBe('RequireApproval');

        const issueUpdate = engine.EvaluateEntityAccess({
            entityName: 'MJ_BizApps_Issues: Issues',
            operation: 'Update',
            contextUser,
            policy,
        });
        expect(issueUpdate.verdict).toBe('Deny');

        // 2. Unlisted entity denied under AllowListOnly ceiling
        const payrollRead = engine.EvaluateEntityAccess({
            entityName: 'Payroll: Compensation',
            operation: 'Read',
            contextUser,
            policy,
        });
        expect(payrollRead.verdict).toBe('Deny');

        // 3. Action policies
        const wakeDecision = engine.EvaluateActionExecution({
            actionName: 'Schedule Next Agent Wake',
            contextUser,
            policy,
        });
        expect(wakeDecision.verdict).toBe('Allow');

        const emailDecision = engine.EvaluateActionExecution({
            actionName: 'Send Single Message',
            contextUser,
            policy,
        });
        expect(emailDecision.verdict).toBe('RequireApproval');
        expect(emailDecision.matchedRulePattern).toBe('Send Single Message');

        // 4. Prompt summary injection
        const promptBlock = engine.BuildPromptPolicyContextBlock(policy, contextUser);
        expect(promptBlock).toContain('Atlas');
        expect(promptBlock).toContain('Coordinator');
        expect(promptBlock).toContain('Focus on Q4 enterprise renewals');
    });
});
