import type { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction, ActionEngineServer } from "@memberjunction/actions";
import { RegisterClass, NormalizeUUID } from "@memberjunction/global";
import { LogError } from "@memberjunction/core";
import { AIEngine } from "@memberjunction/aiengine";
import type { MJAISkillEntity } from "@memberjunction/core-entities";
import { GetActionBooleanParam, GetActionParamValue } from "./semantic-entity-search.helper";

/**
 * Detailed representation of an `MJ: AI Skills` record returned by `Get Skill Details`.
 */
export interface SkillDetailsResult {
    ID: string;
    Name: string;
    Description: string;
    Category: string;
    Status: 'Active' | 'Deprecated' | 'Pending';
    ActivationMode: 'Auto' | 'RequestedOnly';
    ActivationScope: 'Conversation' | 'Run';
    SearchScopeAccess: 'All' | 'Assigned' | 'None' | null;
    BundledActions: Array<{
        ID: string;
        Name: string;
        Description: string;
        ExposeAsTool: boolean;
    }>;
    BundledSubAgents: Array<{
        ID: string;
        Name: string;
        Description: string;
    }>;
    Instructions?: string;
}

/**
 * Progressive-disclosure inspection action that retrieves the full metadata, bundled
 * actions, bundled sub-agents, and (optionally) markdown instructions for a specific
 * AI Skill by `SkillID` or `SkillName`.
 *
 * Agents use `Get Skill Details` after `Find Candidate Skills` when they want to inspect
 * what tools/instructions a skill provides before committing a turn to activating it.
 */
@RegisterClass(BaseAction, "Get Skill Details")
export class GetSkillDetailsAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const rawSkillId = GetActionParamValue(params, 'SkillID');
            const skillId = typeof rawSkillId === 'string' && rawSkillId.trim() ? rawSkillId.trim() : undefined;
            const rawSkillName = GetActionParamValue(params, 'SkillName');
            const skillName = typeof rawSkillName === 'string' && rawSkillName.trim() ? rawSkillName.trim() : undefined;
            const includeInstructions = GetActionBooleanParam(params, 'IncludeInstructions', true);

            if (!skillId && !skillName) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_SKILL_IDENTIFIER',
                    Message: 'Either SkillID or SkillName must be provided',
                };
            }

            await AIEngine.Instance.Config(false, params.ContextUser);
            await ActionEngineServer.Instance.Config(false, params.ContextUser);

            const skill = this.resolveSkill(skillId, skillName);
            if (!skill) {
                const identifier = skillId ? `SkillID='${skillId}'` : `SkillName='${skillName}'`;
                return {
                    Success: false,
                    ResultCode: 'SKILL_NOT_FOUND',
                    Message: `No AI Skill found matching ${identifier}`,
                };
            }

            const exposedActionIds = new Set(
                AIEngine.Instance.GetSkillExposedActionIDs(skill.ID).map((id) => NormalizeUUID(id)),
            );
            const allSkillActionIds = AIEngine.Instance.GetSkillActionIDs(skill.ID);

            const bundledActions = allSkillActionIds
                .map((actionId) => {
                    const action = ActionEngineServer.Instance.Actions.find(
                        (a) => NormalizeUUID(a.ID) === NormalizeUUID(actionId),
                    );
                    if (!action) {
                        return null;
                    }
                    return {
                        ID: action.ID,
                        Name: action.Name,
                        Description: action.Description ?? '',
                        ExposeAsTool: exposedActionIds.has(NormalizeUUID(action.ID)),
                    };
                })
                .filter((a): a is NonNullable<typeof a> => a !== null);

            const subAgentIds = AIEngine.Instance.GetSkillSubAgentIDs(skill.ID);
            const bundledSubAgents = subAgentIds
                .map((subAgentId) => {
                    const subAgent = AIEngine.Instance.Agents.find(
                        (a) => NormalizeUUID(a.ID) === NormalizeUUID(subAgentId),
                    );
                    if (!subAgent) {
                        return null;
                    }
                    return {
                        ID: subAgent.ID,
                        Name: subAgent.Name ?? '',
                        Description: subAgent.Description ?? '',
                    };
                })
                .filter((sa): sa is NonNullable<typeof sa> => sa !== null);

            const details: SkillDetailsResult = {
                ID: skill.ID,
                Name: skill.Name,
                Description: skill.Description ?? '',
                Category: skill.Category ?? 'Uncategorized',
                Status: skill.Status,
                ActivationMode: skill.ActivationMode ?? 'RequestedOnly',
                ActivationScope: skill.ActivationScope ?? 'Run',
                SearchScopeAccess: skill.SearchScopeAccess ?? null,
                BundledActions: bundledActions,
                BundledSubAgents: bundledSubAgents,
                ...(includeInstructions ? { Instructions: skill.Instructions ?? '' } : {}),
            };

            const existing = params.Params.find((p) => p.Name.toLowerCase() === 'skilldetails');
            if (existing) {
                existing.Value = details;
            } else {
                params.Params.push({ Name: 'SkillDetails', Type: 'Output', Value: details });
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(details, null, 2),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogError(`Failed to get skill details: ${errorMessage}`);
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Failed to get skill details: ${errorMessage}`,
            };
        }
    }

    private resolveSkill(skillId?: string, skillName?: string): MJAISkillEntity | undefined {
        const skills = AIEngine.Instance.Skills;
        if (skillId) {
            const normalizedId = NormalizeUUID(skillId);
            const byId = skills.find((s) => NormalizeUUID(s.ID) === normalizedId);
            if (byId) {
                return byId;
            }
        }
        if (skillName) {
            const targetLower = skillName.toLowerCase();
            return (
                skills.find((s) => s.Name.toLowerCase() === targetLower) ??
                skills.find((s) => s.Name.toLowerCase().includes(targetLower))
            );
        }
        return undefined;
    }
}
