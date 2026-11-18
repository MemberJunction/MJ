import type { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction, ActionEngineServer } from "@memberjunction/actions";
import { LogError, type UserInfo } from "@memberjunction/core";
import { AIEngine } from "@memberjunction/aiengine";
import type { MJAISkillEntity } from "@memberjunction/core-entities";
import { NormalizeUUID } from "@memberjunction/global";
import {
    GetActionBooleanParam,
    GetActionParamValue,
    RunSemanticEntitySearch,
} from "./semantic-entity-search.helper";

/**
 * Shape of each entry emitted in the `MatchedSkills` output parameter and the
 * `matchedSkills` field of the JSON `Message` returned by `Find Candidate Skills`
 * and `Find Best Skill`.
 */
export interface MatchedSkillResult {
    ID: string;
    Name: string;
    Description: string;
    Category: string;
    ActivationMode: 'Auto' | 'RequestedOnly';
    ActivationScope: 'Conversation' | 'Run';
    SimilarityScore: number;
    ActionNames: string[];
    SubAgentNames: string[];
}

const DEFAULT_MAX_RESULTS = 10;
const MIN_MAX_RESULTS = 1;
const MAX_MAX_RESULTS = 50;
const DEFAULT_MIN_SCORE = 0.35;

/**
 * Shared implementation for `Find Candidate Skills` and `Find Best Skill`.
 *
 * Uses `RunSemanticEntitySearch` (`Provider.SearchEntity('MJ: AI Skills', ...)` in
 * hybrid vector + full-text mode, backed by the `"AI Skills Search"` EntityDocument)
 * with an automatic lexical token-overlap fallback over `AIEngine.Instance.Skills`
 * when no vector index is configured or reachable.
 *
 * Each returned skill is hydrated from `AIEngine.Instance` with its bundled
 * `ActionNames` and `SubAgentNames` so an agent can immediately see what capabilities
 * activating the skill will unlock.
 */
export abstract class BaseFindSkillsAction extends BaseAction {
    /** Human-readable label included in error messages (`find candidate skills` vs `find best skill`). */
    protected abstract get actionLabel(): string;

    /** Default `MaxResults` when the caller omits the parameter. */
    protected get defaultMaxResults(): number {
        return DEFAULT_MAX_RESULTS;
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const rawTask = GetActionParamValue(params, 'TaskDescription');
            const taskDescription = typeof rawTask === 'string' ? rawTask.trim() : '';
            if (!taskDescription) {
                return {
                    Success: false,
                    ResultCode: 'MISSING_TASK_DESCRIPTION',
                    Message: 'TaskDescription is required and must be a non-empty string',
                };
            }

            const rawMax = Number(GetActionParamValue(params, 'MaxResults') ?? this.defaultMaxResults);
            const maxResults = Number.isFinite(rawMax)
                ? Math.max(MIN_MAX_RESULTS, Math.min(MAX_MAX_RESULTS, Math.floor(rawMax)))
                : this.defaultMaxResults;

            const rawMinScore = Number(GetActionParamValue(params, 'MinimumSimilarityScore') ?? DEFAULT_MIN_SCORE);
            const minScore = Number.isFinite(rawMinScore)
                ? Math.max(0, Math.min(1, rawMinScore))
                : DEFAULT_MIN_SCORE;

            const rawCategory = GetActionParamValue(params, 'Category');
            const categoryFilter = typeof rawCategory === 'string' && rawCategory.trim()
                ? rawCategory.trim().toLowerCase()
                : undefined;

            const rawAgentId = GetActionParamValue(params, 'AgentID');
            const agentId = typeof rawAgentId === 'string' && rawAgentId.trim()
                ? rawAgentId.trim()
                : undefined;

            const includeRequestedOnly = GetActionBooleanParam(params, 'IncludeRequestedOnly', false);

            await AIEngine.Instance.Config(false, params.ContextUser);
            await ActionEngineServer.Instance.Config(false, params.ContextUser);

            const eligibleSkills = this.resolveEligibleSkills(
                agentId,
                includeRequestedOnly,
                categoryFilter,
                params.ContextUser,
            );
            const eligibleById = new Map<string, MJAISkillEntity>(
                eligibleSkills.map((s) => [NormalizeUUID(s.ID), s]),
            );

            // 1. Attempt hybrid vector + FTS search via Provider.SearchEntity('MJ: AI Skills')
            let matchedSkills: MatchedSkillResult[] = [];
            let searchMethod: 'hybrid-vector' | 'lexical-fallback' = 'hybrid-vector';

            const overFetch = Math.min(maxResults * 3, MAX_MAX_RESULTS);
            try {
                const searchOutcome = await RunSemanticEntitySearch(
                    params,
                    'MJ: AI Skills',
                    taskDescription,
                    overFetch,
                    minScore,
                    'hybrid',
                );

                if (searchOutcome.ok && Array.isArray(searchOutcome.results) && searchOutcome.results.length > 0) {
                    for (const hit of searchOutcome.results) {
                        const hitRecord = hit as unknown as {
                            recordId?: string;
                            primaryKeyValues?: { ID?: string };
                            score: number;
                        };
                        const id = String(hitRecord.recordId ?? hitRecord.primaryKeyValues?.ID ?? '');
                        const skill = eligibleById.get(NormalizeUUID(id));
                        if (!skill) {
                            continue;
                        }
                        matchedSkills.push(this.hydrateSkillResult(skill, hitRecord.score));
                        if (matchedSkills.length >= maxResults) {
                            break;
                        }
                    }
                }
            } catch {
                // Provider or vector index unavailable — fall through to lexical ranking
            }

            // 2. Fallback to in-memory lexical + capability scoring when vector index is unavailable or empty
            if (matchedSkills.length === 0 && eligibleSkills.length > 0) {
                searchMethod = 'lexical-fallback';
                matchedSkills = this.rankSkillsLexically(
                    eligibleSkills,
                    taskDescription,
                    minScore,
                    maxResults,
                );
            }

            this.setOutputParam(params, 'MatchedSkills', matchedSkills);
            this.setOutputParam(params, 'MatchCount', matchedSkills.length);
            if (matchedSkills.length > 0) {
                this.setOutputParam(params, 'BestSkill', matchedSkills[0]);
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: JSON.stringify(
                    {
                        taskDescription,
                        searchMethod,
                        matchCount: matchedSkills.length,
                        minimumSimilarityScore: minScore,
                        bestSkill: matchedSkills[0] ?? null,
                        matchedSkills,
                    },
                    null,
                    2,
                ),
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            LogError(`Failed to ${this.actionLabel}: ${errorMessage}`);
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Failed to ${this.actionLabel}: ${errorMessage}`,
            };
        }
    }

    protected setOutputParam(params: RunActionParams, name: string, value: unknown): void {
        const existing = params.Params.find((p) => p.Name.toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.Value = value;
        } else {
            params.Params.push({ Name: name, Type: 'Output', Value: value });
        }
    }

    /**
     * Resolves the set of active `MJAISkillEntity` records eligible for the search,
     * applying optional `AgentID` governance gates and `Category` filtering.
     */
    private resolveEligibleSkills(
        agentId: string | undefined,
        includeRequestedOnly: boolean,
        categoryFilter: string | undefined,
        contextUser?: UserInfo,
    ): MJAISkillEntity[] {
        let baseSkills: MJAISkillEntity[];

        if (agentId) {
            const agent = AIEngine.Instance.Agents.find(
                (a) => NormalizeUUID(a.ID) === NormalizeUUID(agentId),
            );
            if (agent) {
                baseSkills = includeRequestedOnly
                    ? AIEngine.Instance.GetSkillsForAgent(agent, contextUser)
                    : AIEngine.Instance.GetAutoActivatableSkillsForAgent(agent, contextUser);
            } else {
                baseSkills = [];
            }
        } else {
            baseSkills = AIEngine.Instance.Skills.filter(
                (s) => s.Status === 'Active' && (includeRequestedOnly || s.ActivationMode === 'Auto' || s.ActivationMode === 'RequestedOnly'),
            );
        }

        if (categoryFilter) {
            baseSkills = baseSkills.filter(
                (s) => (s.Category ?? '').trim().toLowerCase() === categoryFilter,
            );
        }

        return baseSkills;
    }

    /**
     * Hydrates a skill entity into a {@link MatchedSkillResult} including its bundled
     * action names and sub-agent names.
     */
    protected hydrateSkillResult(skill: MJAISkillEntity, score: number): MatchedSkillResult {
        const actionIds = AIEngine.Instance.GetSkillExposedActionIDs(skill.ID);
        const actionNames: string[] = [];
        for (const actionId of actionIds) {
            const action = ActionEngineServer.Instance.Actions.find(
                (a) => NormalizeUUID(a.ID) === NormalizeUUID(actionId),
            );
            if (action?.Name) {
                actionNames.push(action.Name);
            }
        }

        const subAgentIds = AIEngine.Instance.GetSkillSubAgentIDs(skill.ID);
        const subAgentNames: string[] = [];
        for (const subAgentId of subAgentIds) {
            const subAgent = AIEngine.Instance.Agents.find(
                (a) => NormalizeUUID(a.ID) === NormalizeUUID(subAgentId),
            );
            if (subAgent?.Name) {
                subAgentNames.push(subAgent.Name);
            }
        }

        return {
            ID: skill.ID,
            Name: skill.Name,
            Description: skill.Description ?? '',
            Category: skill.Category ?? 'Uncategorized',
            ActivationMode: skill.ActivationMode ?? 'RequestedOnly',
            ActivationScope: skill.ActivationScope ?? 'Run',
            SimilarityScore: Math.round(score * 10000) / 10000,
            ActionNames: actionNames,
            SubAgentNames: subAgentNames,
        };
    }

    /**
     * Token-overlap and phrase-boost lexical fallback over `eligibleSkills` when
     * no vector index is configured or reachable.
     */
    private rankSkillsLexically(
        eligibleSkills: MJAISkillEntity[],
        taskDescription: string,
        minScore: number,
        maxResults: number,
    ): MatchedSkillResult[] {
        const queryTokens = this.tokenize(taskDescription);
        if (queryTokens.length === 0) {
            return [];
        }
        const queryLower = taskDescription.toLowerCase();

        const scored: MatchedSkillResult[] = [];
        for (const skill of eligibleSkills) {
            const hydrated = this.hydrateSkillResult(skill, 0);
            const nameLower = skill.Name.toLowerCase();
            const categoryLower = (skill.Category ?? '').toLowerCase();
            const descLower = (skill.Description ?? '').toLowerCase();
            const actionsLower = hydrated.ActionNames.join(' ').toLowerCase();
            const corpus = `${nameLower} ${categoryLower} ${descLower} ${actionsLower}`;

            let matchedTokens = 0;
            let nameMatchedTokens = 0;
            for (const token of queryTokens) {
                if (corpus.includes(token)) {
                    matchedTokens++;
                }
                if (nameLower.includes(token) || categoryLower.includes(token)) {
                    nameMatchedTokens++;
                }
            }

            if (matchedTokens === 0) {
                continue;
            }

            const tokenRecall = matchedTokens / queryTokens.length;
            const nameBoost = (nameMatchedTokens / queryTokens.length) * 0.25;
            const exactPhraseBoost =
                nameLower.includes(queryLower) || descLower.includes(queryLower) ? 0.2 : 0;

            const rawScore = Math.min(1, 0.35 + tokenRecall * 0.45 + nameBoost + exactPhraseBoost);
            if (rawScore >= minScore) {
                hydrated.SimilarityScore = Math.round(rawScore * 10000) / 10000;
                scored.push(hydrated);
            }
        }

        scored.sort((a, b) => b.SimilarityScore - a.SimilarityScore || a.Name.localeCompare(b.Name));
        return scored.slice(0, maxResults);
    }

    private tokenize(text: string): string[] {
        const stopWords = new Set([
            'a', 'an', 'the', 'to', 'for', 'of', 'in', 'on', 'with', 'and', 'or', 'by', 'is', 'are', 'be',
            'that', 'this', 'from', 'at', 'as', 'it', 'i', 'need', 'want', 'find', 'skill', 'skills',
        ]);
        return text
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length >= 2 && !stopWords.has(t));
    }
}
