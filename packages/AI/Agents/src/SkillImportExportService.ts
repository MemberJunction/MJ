/**
 * @fileoverview Orchestrates SKILL.md export/import against the database: resolves Action/Agent
 * names to IDs (import) and IDs back to names (export), and creates/updates the MJ: AI Skills +
 * junction entities. Builds on the pure {@link SkillMarkdownConverter} for the text<->data
 * transformation itself.
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { MJAISkillEntity, MJAISkillActionEntity, MJAISkillSubAgentEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { SkillMarkdownConverter } from './SkillMarkdownConverter';

/**
 * Options for {@link SkillImportExportService.ImportSkill}.
 */
export interface ImportSkillOptions {
    /**
     * When provided, updates this existing skill (and resyncs its Action/sub-agent bundling)
     * instead of creating a new one. The caller is responsible for confirming the current user is
     * allowed to edit this skill (e.g. it's their own, per the "own skills" RLS filter).
     */
    updateSkillId?: string;
}

/**
 * Result of {@link SkillImportExportService.ImportSkill}.
 */
export interface ImportSkillResult {
    skill: MJAISkillEntity;
    /** Action/sub-agent names from the SKILL.md that couldn't be resolved — the skill is still
     *  created/updated with whatever DID resolve, so the caller can surface these as non-fatal
     *  warnings rather than failing the whole import. */
    warnings: string[];
}

export class SkillImportExportService {
    /**
     * Exports a skill to a portable SKILL.md string: Action/sub-agent IDs are resolved to their
     * current Names (not IDs, for cross-instance portability) via the AI/Action engine caches.
     */
    public static async ExportSkill(
        skillId: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string> {
        const md = provider ?? Metadata.Provider;
        const skill = await md.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', contextUser);
        const loaded = await skill.Load(skillId);
        if (!loaded) {
            throw new Error(`Skill ${skillId} not found`);
        }

        const rv = new RunView();
        const [actionRows, subAgentRows] = await rv.RunViews<MJAISkillActionEntity | MJAISkillSubAgentEntity>([
            {
                EntityName: 'MJ: AI Skill Actions',
                ExtraFilter: `SkillID='${skillId}'`,
                ResultType: 'simple'
            },
            {
                EntityName: 'MJ: AI Skill Sub Agents',
                ExtraFilter: `SkillID='${skillId}'`,
                ResultType: 'simple'
            }
        ], contextUser);

        const actionNames = (actionRows.Success ? actionRows.Results : [])
            .map(row => ActionEngineServer.Instance.Actions.find(a => a.ID === (row as MJAISkillActionEntity).ActionID)?.Name)
            .filter((name): name is string => !!name);

        const subAgentNames = (subAgentRows.Success ? subAgentRows.Results : [])
            .map(row => AIEngine.Instance.Agents.find(a => a.ID === (row as MJAISkillSubAgentEntity).SubAgentID)?.Name)
            .filter((name): name is string => !!name);

        return SkillMarkdownConverter.Serialize({
            name: skill.Name,
            description: skill.Description ?? undefined,
            category: skill.Category ?? undefined,
            actionNames,
            subAgentNames,
            instructions: skill.Instructions
        });
    }

    /**
     * Imports a SKILL.md document, resolving Action/sub-agent names against the current instance's
     * catalog (unresolvable names are dropped and reported as warnings, not fatal errors — a skill
     * authored against a different MJ instance may reference actions that don't exist here yet).
     */
    public static async ImportSkill(
        markdownText: string,
        contextUser: UserInfo,
        options?: ImportSkillOptions,
        provider?: IMetadataProvider
    ): Promise<ImportSkillResult> {
        const parsed = SkillMarkdownConverter.Parse(markdownText);
        const warnings: string[] = [];
        const md = provider ?? Metadata.Provider;

        const resolvedActionIDs = this.resolveNames(
            parsed.frontmatter.actions ?? [],
            ActionEngineServer.Instance.Actions,
            warnings,
            'Action'
        );
        const resolvedSubAgentIDs = this.resolveNames(
            parsed.frontmatter.subAgents ?? [],
            AIEngine.Instance.Agents,
            warnings,
            'Sub-agent'
        );

        const skill = await md.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', contextUser);
        if (options?.updateSkillId) {
            const loaded = await skill.Load(options.updateSkillId);
            if (!loaded) {
                throw new Error(`Skill ${options.updateSkillId} not found for update`);
            }
        } else {
            skill.NewRecord();
            skill.CreatedByUserID = contextUser.ID;
            skill.Status = 'Active';
        }
        skill.Name = parsed.frontmatter.name;
        skill.Description = parsed.frontmatter.description ?? null;
        skill.Category = parsed.frontmatter.category ?? null;
        skill.Instructions = parsed.instructions;

        const saved = await skill.Save();
        if (!saved) {
            throw new Error(`Failed to save imported skill: ${skill.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        await this.resyncJunction(skill.ID, 'MJ: AI Skill Actions', resolvedActionIDs, 'ActionID', contextUser, md);
        await this.resyncJunction(skill.ID, 'MJ: AI Skill Sub Agents', resolvedSubAgentIDs, 'SubAgentID', contextUser, md);

        return { skill, warnings };
    }

    /** Resolves a list of names against a cached entity array (by ID+Name), collecting a warning for each miss. */
    private static resolveNames(
        names: string[],
        catalog: Array<{ ID: string; Name: string }>,
        warnings: string[],
        kindLabel: string
    ): string[] {
        const resolved: string[] = [];
        for (const name of names) {
            const match = catalog.find(c => c.Name.trim().toLowerCase() === name.trim().toLowerCase());
            if (match) {
                resolved.push(match.ID);
            } else {
                warnings.push(`${kindLabel} '${name}' not found in this instance — skipped`);
            }
        }
        return resolved;
    }

    /** Deletes existing junction rows for the skill and recreates them from the resolved ID set — the simplest correct resync for a small bounded set of rows. */
    private static async resyncJunction(
        skillId: string,
        entityName: 'MJ: AI Skill Actions' | 'MJ: AI Skill Sub Agents',
        resolvedIDs: string[],
        idFieldName: 'ActionID' | 'SubAgentID',
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<void> {
        const rv = new RunView();
        const existing = await rv.RunView<MJAISkillActionEntity | MJAISkillSubAgentEntity>({
            EntityName: entityName,
            ExtraFilter: `SkillID='${skillId}'`,
            ResultType: 'entity_object'
        }, contextUser);

        if (existing.Success) {
            for (const row of existing.Results) {
                await row.Delete();
            }
        }

        for (const id of resolvedIDs) {
            const junctionRow = await provider.GetEntityObject<MJAISkillActionEntity | MJAISkillSubAgentEntity>(entityName, contextUser);
            junctionRow.NewRecord();
            junctionRow.SkillID = skillId;
            (junctionRow as unknown as Record<string, string>)[idFieldName] = id;
            await junctionRow.Save();
        }
    }
}
