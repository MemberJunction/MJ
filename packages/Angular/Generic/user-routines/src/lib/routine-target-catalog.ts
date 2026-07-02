/**
 * Loads the pickable routine targets (Agents / Actions / Prompts) and the Active AI
 * Skills from the already-cached metadata engines — provider-scoped, lazy Config, no
 * bespoke RunView round-trips. Shared by the routines list (id → name resolution) and
 * the editor (target / skill pickers).
 */
import { IMetadataProvider } from '@memberjunction/core';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ActionEngineBase } from '@memberjunction/actions-base';
import { NormalizeUUID } from '@memberjunction/global';

/** A pickable target (agent, action, or prompt). */
export interface RoutineTargetOption {
    ID: string;
    Name: string;
    Description: string | null;
}

/** A pickable AI Skill for RequestedSkillIDs. */
export interface RoutineSkillOption {
    ID: string;
    Name: string;
    Description: string | null;
    IconClass: string | null;
    Color: string | null;
}

/** The full catalog of routine-pickable targets + skills, plus an id → name map. */
export interface RoutineTargetCatalog {
    /** Active agents, EXCLUDING agents whose type is the Realtime agent type (interactive-only). */
    Agents: RoutineTargetOption[];
    /** Active actions. */
    Actions: RoutineTargetOption[];
    /** Active prompts. */
    Prompts: RoutineTargetOption[];
    /** Active AI Skills (for Agent targets' RequestedSkillIDs). */
    Skills: RoutineSkillOption[];
    /**
     * Display name for ANY known target id (normalized), regardless of status — so
     * routines pointing at since-deactivated targets still render a name.
     */
    NameByID: Map<string, string>;
    /**
     * Font Awesome icon class for ANY known agent id (normalized) that has an
     * IconClass set. Consumers fall back to 'fa-solid fa-robot' when absent.
     */
    IconByID: Map<string, string>;
}

/**
 * Builds the catalog from the provider-scoped AI + Action engines. Both engines cache
 * after their first Config, so repeated calls are cheap.
 */
export async function LoadRoutineTargetCatalog(provider: IMetadataProvider): Promise<RoutineTargetCatalog> {
    const aiEngine = AIEngineBase.GetProviderInstance<AIEngineBase>(provider, AIEngineBase) as AIEngineBase;
    const actionEngine = ActionEngineBase.GetProviderInstance<ActionEngineBase>(provider, ActionEngineBase) as ActionEngineBase;
    await Promise.all([
        aiEngine.Config(false, undefined, provider),
        actionEngine.Config(false, undefined, provider),
    ]);

    // Resolve the Realtime agent type by NAME from metadata — never by hardcoded ID.
    const realtimeTypeIDs = new Set<string>(
        aiEngine.AgentTypes
            .filter((t) => t.Name?.trim().toLowerCase() === 'realtime')
            .map((t) => NormalizeUUID(t.ID))
    );

    const nameByID = new Map<string, string>();
    const iconByID = new Map<string, string>();
    const byName = (a: { Name: string }, b: { Name: string }) => a.Name.localeCompare(b.Name);

    const agents = aiEngine.Agents
        .filter((a) => {
            nameByID.set(NormalizeUUID(a.ID), a.Name ?? '');
            if (a.IconClass) {
                iconByID.set(NormalizeUUID(a.ID), a.IconClass);
            }
            const isRealtime = a.TypeID != null && realtimeTypeIDs.has(NormalizeUUID(a.TypeID));
            return a.Status === 'Active' && !isRealtime;
        })
        .map((a) => ({ ID: a.ID, Name: a.Name ?? '', Description: a.Description ?? null }))
        .sort(byName);

    const actions = actionEngine.Actions
        .filter((a) => {
            nameByID.set(NormalizeUUID(a.ID), a.Name ?? '');
            return a.Status === 'Active';
        })
        .map((a) => ({ ID: a.ID, Name: a.Name ?? '', Description: a.Description ?? null }))
        .sort(byName);

    const prompts = aiEngine.Prompts
        .filter((prompt) => {
            nameByID.set(NormalizeUUID(prompt.ID), prompt.Name ?? '');
            return prompt.Status === 'Active';
        })
        .map((prompt) => ({ ID: prompt.ID, Name: prompt.Name ?? '', Description: prompt.Description ?? null }))
        .sort(byName);

    const skills = aiEngine.Skills
        .filter((s) => s.Status === 'Active')
        .map((s) => ({
            ID: s.ID,
            Name: s.Name ?? '',
            Description: s.Description ?? null,
            IconClass: s.IconClass ?? null,
            Color: s.Color ?? null,
        }))
        .sort(byName);

    return { Agents: agents, Actions: actions, Prompts: prompts, Skills: skills, NameByID: nameByID, IconByID: iconByID };
}
