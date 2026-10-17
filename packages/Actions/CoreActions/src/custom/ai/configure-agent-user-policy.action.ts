import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { RegisterClass, SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { LogError, Metadata } from '@memberjunction/core';
import {
    MJAIAgentUserPolicyEntity,
    MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule,
    MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule,
} from '@memberjunction/core-entities';
import { AgentUserPolicyEngine } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';

/**
 * Action that creates or updates the caller's `MJ: AI Agent User Policies` row for a given agent
 * (such as the Chief of Staff agent) during onboarding or when adjusting permissions/channels.
 *
 * Security invariants:
 * - Always binds `UserID = params.ContextUser.ID` (a user or agent can only modify the calling
 *   user's own policy, never another user's policy).
 * - Immediately updates `AgentUserPolicyEngine.Instance.SetCachedPolicy(policy)` so subsequent
 *   turns and action evaluations in the same run reflect the updated policy.
 */
@RegisterClass(BaseAction, 'Configure Agent User Policy')
export class ConfigureAgentUserPolicyAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser?.ID) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_USER_CONTEXT',
                    Message: 'Configure Agent User Policy requires a valid ContextUser.',
                    Params: params.Params,
                };
            }

            await AIEngine.Instance.Config(false, contextUser);
            const rawAgentId = this.getStringParam(params, 'AgentID');
            const rawAgentName = this.getStringParam(params, 'AgentName') ?? (rawAgentId ? null : 'Chief of Staff');
            const agent = rawAgentId
                ? AIEngine.Instance.Agents.find((a) => UUIDsEqual(a.ID, rawAgentId))
                : AIEngine.Instance.Agents.find(
                      (a) => a.Name.trim().toLowerCase() === (rawAgentName ?? '').trim().toLowerCase()
                  );

            if (!agent) {
                return {
                    Success: false,
                    ResultCode: 'AGENT_NOT_FOUND',
                    Message: `Agent "${ rawAgentId ?? rawAgentName }" not found.`,
                    Params: params.Params,
                };
            }

            const existing = await AgentUserPolicyEngine.Instance.GetPolicyForAgentAndUser(
                agent.ID,
                contextUser.ID,
                contextUser,
                true
            );
            const md = new Metadata();
            const policy =
                existing ??
                (await md.GetEntityObject<MJAIAgentUserPolicyEntity>('MJ: AI Agent User Policies', contextUser));

            policy.AgentID = agent.ID;
            policy.UserID = contextUser.ID;

            this.applyPersonalizationAndStatus(policy, params);
            this.applyChannelModes(policy, params);
            this.applyDataAndApprovalSwitches(policy, params);
            this.applyJsonRuleArrays(policy, params);

            const saved = await policy.Save();
            if (!saved) {
                const errMsg = policy.LatestResult?.CompleteMessage ?? 'Unknown error saving MJ: AI Agent User Policies';
                return {
                    Success: false,
                    ResultCode: 'SAVE_FAILED',
                    Message: `Failed to save agent user policy: ${ errMsg }`,
                    Params: params.Params,
                };
            }

            AgentUserPolicyEngine.Instance.SetCachedPolicy(policy);
            const summary = AgentUserPolicyEngine.Instance.BuildPromptPolicyContextBlock(policy, contextUser);

            this.setOutputParam(params, 'PolicyID', policy.ID);
            this.setOutputParam(params, 'OnboardingStatus', policy.OnboardingStatus);
            this.setOutputParam(params, 'EffectivePolicySummary', summary);

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Saved MJ: AI Agent User Policies (ID: ${ policy.ID }, OnboardingStatus: ${ policy.OnboardingStatus }).`,
                Params: params.Params,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`ConfigureAgentUserPolicyAction error: ${ message }`);
            return {
                Success: false,
                ResultCode: 'UNEXPECTED_ERROR',
                Message: `Error configuring agent user policy: ${ message }`,
                Params: params.Params,
            };
        }
    }

    private applyPersonalizationAndStatus(policy: MJAIAgentUserPolicyEntity, params: RunActionParams): void {
        const displayNameOverride = this.getStringParam(params, 'DisplayNameOverride');
        if (displayNameOverride !== null) {
            policy.DisplayNameOverride = displayNameOverride;
        }
        const preferredPersonaId = this.getStringParam(params, 'PreferredPersonaID');
        if (preferredPersonaId !== null) {
            policy.PreferredPersonaID = preferredPersonaId;
        }
        const status = this.getStringParam(params, 'Status');
        if (status === 'Active' || status === 'Paused' || status === 'Disabled') {
            policy.Status = status;
        } else if (!policy.Status) {
            policy.Status = 'Active';
        }
        const onboardingStatus = this.getStringParam(params, 'OnboardingStatus');
        if (
            onboardingStatus === 'NotStarted' ||
            onboardingStatus === 'InProgress' ||
            onboardingStatus === 'Completed'
        ) {
            policy.OnboardingStatus = onboardingStatus;
            if (onboardingStatus === 'Completed' && !policy.OnboardedAt) {
                policy.OnboardedAt = new Date();
            }
        }
        const coordinationMode = this.getStringParam(params, 'CoordinationMode');
        if (
            coordinationMode === 'Observer' ||
            coordinationMode === 'Coordinator' ||
            coordinationMode === 'Autonomous'
        ) {
            policy.CoordinationMode = coordinationMode;
        }
        const allowInterAgent = this.getBooleanParam(params, 'AllowInterAgentCoordination');
        if (allowInterAgent !== null) {
            policy.AllowInterAgentCoordination = allowInterAgent;
        }
        const instructionsOverride =
            this.getStringParam(params, 'InstructionsOverride') ??
            this.getStringParam(params, 'OnboardingSummary');
        if (instructionsOverride !== null) {
            policy.InstructionsOverride = instructionsOverride;
        }
    }

    private applyChannelModes(policy: MJAIAgentUserPolicyEntity, params: RunActionParams): void {
        const emailMode = this.getStringParam(params, 'EmailChannelMode');
        if (
            emailMode === 'Disabled' ||
            emailMode === 'ReadOnly' ||
            emailMode === 'DraftOnly' ||
            emailMode === 'SendAsAgent' ||
            emailMode === 'SendAsUser'
        ) {
            policy.EmailChannelMode = emailMode;
        }
        const phoneMode = this.getStringParam(params, 'PhoneChannelMode');
        if (
            phoneMode === 'Disabled' ||
            phoneMode === 'InboundOnly' ||
            phoneMode === 'OutboundWithApproval' ||
            phoneMode === 'OutboundAutonomous'
        ) {
            policy.PhoneChannelMode = phoneMode;
        }
        const messagingMode = this.getStringParam(params, 'MessagingChannelMode');
        if (messagingMode === 'Disabled' || messagingMode === 'Enabled') {
            policy.MessagingChannelMode = messagingMode;
        }
    }

    private applyDataAndApprovalSwitches(policy: MJAIAgentUserPolicyEntity, params: RunActionParams): void {
        const dataMode = this.getStringParam(params, 'DefaultDataAccessMode');
        if (dataMode === 'UserCeiling' || dataMode === 'ReadOnly' || dataMode === 'AllowListOnly') {
            policy.DefaultDataAccessMode = dataMode;
        }
        const reqExt = this.getBooleanParam(params, 'RequireApprovalForExternalComms');
        if (reqExt !== null) {
            policy.RequireApprovalForExternalComms = reqExt;
        }
        const reqFin = this.getBooleanParam(params, 'RequireApprovalForFinancials');
        if (reqFin !== null) {
            policy.RequireApprovalForFinancials = reqFin;
        }
        const reqDest = this.getBooleanParam(params, 'RequireApprovalForDestructiveActions');
        if (reqDest !== null) {
            policy.RequireApprovalForDestructiveActions = reqDest;
        }
        const threshold = this.getNumericParam(params, 'AutoApproveAmountThreshold');
        if (threshold !== null) {
            policy.AutoApproveAmountThreshold = threshold;
        }
    }

    private applyJsonRuleArrays(policy: MJAIAgentUserPolicyEntity, params: RunActionParams): void {
        const entityRules =
            this.parseObjectParam<MJAIAgentUserPolicyEntity_IAgentUserEntityAccessRule[]>(
                params,
                'EntityAccessRules'
            );
        if (Array.isArray(entityRules)) {
            policy.EntityAccessRulesObject = entityRules;
        }
        const actionRules =
            this.parseObjectParam<MJAIAgentUserPolicyEntity_IAgentUserActionPolicyRule[]>(
                params,
                'ActionPolicyRules'
            );
        if (Array.isArray(actionRules)) {
            policy.ActionPolicyRulesObject = actionRules;
        }
    }

    private getParamValue(params: RunActionParams, name: string): unknown {
        const found = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        return found?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | null {
        const val = this.getParamValue(params, name);
        if (val == null) return null;
        const str = String(val).trim();
        return str.length > 0 ? str : null;
    }

    private getBooleanParam(params: RunActionParams, name: string): boolean | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') {
            const lower = val.trim().toLowerCase();
            if (lower === 'true' || lower === '1' || lower === 'yes') return true;
            if (lower === 'false' || lower === '0' || lower === 'no') return false;
        }
        return null;
    }

    private getNumericParam(params: RunActionParams, name: string): number | null {
        const val = this.getParamValue(params, name);
        if (val == null || val === '') return null;
        const num = typeof val === 'number' ? val : Number(val);
        return Number.isFinite(num) ? num : null;
    }

    private parseObjectParam<T>(params: RunActionParams, name: string): T | null {
        const val = this.getParamValue(params, name);
        if (val == null) return null;
        if (typeof val === 'object') return val as T;
        if (typeof val === 'string') {
            return SafeJSONParse<T>(val) ?? null;
        }
        return null;
    }

    private setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find((p) => p.Name.trim().toLowerCase() === name.trim().toLowerCase());
        if (existing) {
            existing.Value = value;
        } else {
            const outParam: ActionParam = {
                Name: name,
                Value: value,
                Type: 'Output',
            };
            params.Params.push(outParam);
        }
    }
}
