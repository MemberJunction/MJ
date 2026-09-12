/**
 * @fileoverview Orchestrates SKILL.md export/import against the database: resolves Action/Agent
 * names to IDs (import) and IDs back to names (export), and creates/updates the MJ: AI Skills +
 * junction entities. Builds on the pure {@link SkillMarkdownConverter} for the text<->data
 * transformation itself.
 *
 * @module @memberjunction/ai-agents
 */

import { IMetadataProvider, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAISkillEntity, MJAISkillActionEntity, MJAISkillSubAgentEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import { SkillMarkdownConverter, type SkillMarkdownFrontmatter } from './SkillMarkdownConverter';

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

/**
 * Result of {@link SkillImportExportService.ExportSkill}.
 */
export interface ExportSkillResult {
    markdown: string;
    /** The skill's Name — returned alongside the markdown so callers don't need a second load. */
    skillName: string;
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
    ): Promise<ExportSkillResult> {
        const md = provider ?? Metadata.Provider;
        // Name resolution below reads the AI/Action engine caches — ensure they're loaded (idempotent
        // no-op when already configured). Without this, a cold caller resolves every ID to no name.
        await this.ensureEnginesConfigured(contextUser, md);
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

        const actionNameOf = (row: MJAISkillActionEntity): string | undefined =>
            ActionEngineServer.Instance.Actions.find(a => UUIDsEqual(a.ID, row.ActionID))?.Name;
        const actionRowsTyped = (actionRows.Success ? actionRows.Results : []) as MJAISkillActionEntity[];
        const actionNames = actionRowsTyped.map(actionNameOf).filter((name): name is string => !!name);
        // ExposeToModel = 0 rows travel as `codeOnlyActions`, so the flag survives a cross-instance import.
        const codeOnlyActionNames = actionRowsTyped
            .filter(row => row.ExposeToModel === false)
            .map(actionNameOf)
            .filter((name): name is string => !!name);

        const subAgentNames = (subAgentRows.Success ? subAgentRows.Results : [])
            .map(row => AIEngine.Instance.Agents.find(a => UUIDsEqual(a.ID, (row as MJAISkillSubAgentEntity).SubAgentID))?.Name)
            .filter((name): name is string => !!name);

        const markdown = SkillMarkdownConverter.Serialize({
            name: skill.Name,
            description: skill.Description ?? undefined,
            category: skill.Category ?? undefined,
            actionNames,
            codeOnlyActionNames,
            subAgentNames,
            instructions: skill.Instructions
        });

        return { markdown, skillName: skill.Name };
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
        // Name→ID resolution below reads the AI/Action engine caches — ensure they're loaded
        // (idempotent). Without this, every bundled Action/sub-agent name would falsely resolve to a
        // "not found" warning on a cold server.
        await this.ensureEnginesConfigured(contextUser, md);

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
        const exposeToModel = this.resolveExposeToModel(parsed.frontmatter, resolvedActionIDs, warnings);

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

        await this.resyncJunction(skill.ID, 'MJ: AI Skill Actions', resolvedActionIDs, 'ActionID', contextUser, md, exposeToModel);
        await this.resyncJunction(skill.ID, 'MJ: AI Skill Sub Agents', resolvedSubAgentIDs, 'SubAgentID', contextUser, md);

        return { skill, warnings };
    }

    /**
     * Loads the AI + Action engine caches that name/ID resolution depends on. Both `Config()` calls
     * are idempotent — a no-op when the engine is already loaded (the common server case) — so this
     * is cheap insurance against a cold caller producing empty resolutions.
     */
    private static async ensureEnginesConfigured(contextUser: UserInfo, provider: IMetadataProvider): Promise<void> {
        await AIEngine.Instance.Config(false, contextUser, provider);
        await ActionEngineServer.Instance.Config(false, contextUser, provider);
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

    /**
     * Turns the frontmatter's `codeOnlyActions` into a per-ActionID `ExposeToModel` map, or `undefined`
     * when the file has no such key — then the file expresses no opinion and {@link resyncJunction}
     * keeps each surviving row's flag as it was. A name listed as code-only but not bundled under
     * `actions` is a warning, not a row.
     */
    private static resolveExposeToModel(
        frontmatter: SkillMarkdownFrontmatter,
        resolvedActionIDs: string[],
        warnings: string[]
    ): Map<string, boolean> | undefined {
        if (frontmatter.codeOnlyActions === undefined) {
            return undefined;
        }
        const bundled = new Set(resolvedActionIDs.map(id => id.toUpperCase()));
        const codeOnlyIDs = new Set<string>();
        // Resolve one name at a time so a warning can quote the name the author typed — the resolved
        // GUID is not something they can find in their file.
        for (const name of frontmatter.codeOnlyActions) {
            const [id] = this.resolveNames([name], ActionEngineServer.Instance.Actions, warnings, 'Code-only action');
            if (id === undefined) {
                continue; // resolveNames already warned that the name is unknown here
            }
            if (!bundled.has(id.toUpperCase())) {
                warnings.push(`codeOnlyActions names '${name}', which is not listed under actions; ignored`);
                continue;
            }
            codeOnlyIDs.add(id.toUpperCase());
        }
        return new Map(resolvedActionIDs.map(id => [id.toUpperCase(), !codeOnlyIDs.has(id.toUpperCase())]));
    }

    /**
     * Deletes existing junction rows for the skill and recreates them from the resolved ID set — the
     * simplest correct resync for a small bounded set of rows.
     *
     * Delete-and-recreate must not lose `AISkillAction.ExposeToModel` (#4226). When the SKILL.md says
     * (`codeOnlyActions`, → `exposeToModel`), the file is authoritative. When it does not — a file
     * exported before the key existed, or hand-written without it — rows that survive the resync (same
     * action before and after) keep the flag they had, so re-saving a skill's SKILL.md never turns a
     * code-only action model-callable; only a genuinely new row takes the column default.
     */
    private static async resyncJunction(
        skillId: string,
        entityName: 'MJ: AI Skill Actions' | 'MJ: AI Skill Sub Agents',
        resolvedIDs: string[],
        idFieldName: 'ActionID' | 'SubAgentID',
        contextUser: UserInfo,
        provider: IMetadataProvider,
        exposeToModel?: Map<string, boolean>
    ): Promise<void> {
        const rv = new RunView();
        const existing = await rv.RunView<MJAISkillActionEntity | MJAISkillSubAgentEntity>({
            EntityName: entityName,
            ExtraFilter: `SkillID='${skillId}'`,
            ResultType: 'entity_object'
        }, contextUser);

        const carried = new Map<string, boolean>();
        if (existing.Success) {
            for (const row of existing.Results) {
                if (entityName === 'MJ: AI Skill Actions') {
                    const actionRow = row as MJAISkillActionEntity;
                    carried.set(actionRow.ActionID.toUpperCase(), actionRow.ExposeToModel);
                }
                const deleted = await row.Delete();
                if (!deleted) {
                    throw new Error(`Failed to remove existing ${entityName} row during skill re-sync: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
            }
        }

        for (const id of resolvedIDs) {
            const junctionRow = await provider.GetEntityObject<MJAISkillActionEntity | MJAISkillSubAgentEntity>(entityName, contextUser);
            junctionRow.NewRecord();
            junctionRow.SkillID = skillId;
            (junctionRow as unknown as Record<string, string>)[idFieldName] = id;
            const flag = exposeToModel?.get(id.toUpperCase()) ?? carried.get(id.toUpperCase());
            if (flag !== undefined) {
                (junctionRow as MJAISkillActionEntity).ExposeToModel = flag;
            }
            const saved = await junctionRow.Save();
            if (!saved) {
                throw new Error(`Failed to create ${entityName} row during skill re-sync: ${junctionRow.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }
}
