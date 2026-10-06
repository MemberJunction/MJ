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
import { MJAISkillEntity, MJAISkillActionEntity, MJAISkillSubAgentEntity, MJAISkillFileEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import type { JSONObject, JSONValue } from '@memberjunction/ai';
import { SkillMarkdownConverter, type ParsedSkillMarkdown, type SkillMarkdownFrontmatter } from './SkillMarkdownConverter';
import {
    ComputeSkillContentHash,
    DecideSkillUpdateStatus,
    FetchSkillBundle,
    MAX_SKILL_FILE_BYTES,
    ParseSkillSource,
    SkillSourceFromSkill,
    SkillSourceURL,
    type SkillBundle,
    type SkillBundleFile,
    type SkillSource
} from './SkillSources';

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
 * Options for {@link SkillImportExportService.ImportSkillFromSource}.
 */
export interface ImportSkillFromSourceOptions extends ImportSkillOptions {
    /** The git ref when the source is a GitHub URL without one, or with a ref that contains slashes. */
    ref?: string;
    /** Fetch implementation; defaults to the global `fetch`. Injectable for tests. */
    fetchFn?: typeof fetch;
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
            extraFrontmatter: this.parseFrontmatterColumn(skill.Frontmatter),
            instructions: skill.Instructions
        });

        return { markdown, skillName: skill.Name };
    }

    /**
     * Imports a SKILL.md document, resolving Action/sub-agent names against the current instance's
     * catalog (unresolvable names are dropped and reported as warnings, not fatal errors — a skill
     * authored against a different MJ instance may reference actions that don't exist here yet).
     * Frontmatter keys MJ does not model are stored in `AISkill.Frontmatter` so export writes them back.
     */
    public static async ImportSkill(
        markdownText: string,
        contextUser: UserInfo,
        options?: ImportSkillOptions,
        provider?: IMetadataProvider
    ): Promise<ImportSkillResult> {
        return this.importSkill(markdownText, contextUser, options, provider ?? Metadata.Provider);
    }

    /**
     * Imports a skill from its upstream: a SKILL.md at an https URL, or a skill folder in a GitHub
     * repository (`https://github.com/<owner>/<repo>[/tree/<ref>/<path>]`, or a {@link SkillSource}).
     * Records the source on the skill (`SourceType`, `SourceURL`, `SourceRef`, `SourceVersion` from
     * `metadata.version`, `SourceContentHash`, `LastSyncedAt`) and, for GitHub, stores every other text
     * file in the folder as an `MJ: AI Skill Files` row. Re-importing a skill (`updateSkillId`) is how an
     * admin accepts an upstream change: a `Pending` skill becomes `Active` again.
     */
    public static async ImportSkillFromSource(
        source: SkillSource | string,
        contextUser: UserInfo,
        options?: ImportSkillFromSourceOptions,
        provider?: IMetadataProvider
    ): Promise<ImportSkillResult> {
        const md = provider ?? Metadata.Provider;
        const resolved = typeof source === 'string' ? ParseSkillSource(source, options?.ref) : source;
        const bundle = await FetchSkillBundle(resolved, options?.fetchFn);
        const result = await this.importSkill(bundle.Markdown, contextUser, options, md,
            (skill, parsed) => this.applySource(skill, resolved, bundle, parsed));
        await this.resyncFiles(result.skill.ID, bundle.Files, contextUser, md);
        for (const path of bundle.Skipped) {
            result.warnings.push(`File '${path}' is binary or larger than ${MAX_SKILL_FILE_BYTES} bytes — not imported`);
        }
        return result;
    }

    /**
     * The scheduled update check for one sourced skill: re-fetches its source and compares the content
     * hash. When an Active skill's upstream changed, the skill is set to `Pending` for admin review —
     * its content is NOT overwritten, so nothing upstream reaches an agent's prompt unreviewed. Returns
     * whether the skill was set to Pending. A skill with no source, or not Active, is left alone.
     */
    public static async CheckSkillForUpdate(skill: MJAISkillEntity, fetchFn?: typeof fetch): Promise<boolean> {
        const source = SkillSourceFromSkill(skill);
        if (!source || skill.Status !== 'Active') {
            return false;
        }
        const upstreamHash = ComputeSkillContentHash(await FetchSkillBundle(source, fetchFn));
        const status = DecideSkillUpdateStatus(skill, upstreamHash);
        if (!status) {
            return false;
        }
        skill.Status = status;
        if (!(await skill.Save())) {
            throw new Error(`Failed to mark skill '${skill.Name}' Pending: ${skill.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return true;
    }

    /** Shared by both imports: resolve names, create or load the skill, apply, save, resync the bundle. */
    private static async importSkill(
        markdownText: string,
        contextUser: UserInfo,
        options: ImportSkillOptions | undefined,
        md: IMetadataProvider,
        applyExtra?: (skill: MJAISkillEntity, parsed: ParsedSkillMarkdown) => void
    ): Promise<ImportSkillResult> {
        const parsed = SkillMarkdownConverter.Parse(markdownText);
        const warnings: string[] = [];
        // Name→ID resolution below reads the AI/Action engine caches — ensure they're loaded
        // (idempotent). Without this, every bundled Action/sub-agent name would falsely resolve to a
        // "not found" warning on a cold server.
        await this.ensureEnginesConfigured(contextUser, md);
        const actionIDs = this.resolveNames(parsed.frontmatter.actions ?? [], ActionEngineServer.Instance.Actions, warnings, 'Action');
        const subAgentIDs = this.resolveNames(parsed.frontmatter.subAgents ?? [], AIEngine.Instance.Agents, warnings, 'Sub-agent');
        const exposeToModel = this.resolveExposeToModel(parsed.frontmatter, actionIDs, warnings);

        const skill = await this.loadOrCreateSkill(options?.updateSkillId, contextUser, md);
        skill.Name = parsed.frontmatter.name;
        skill.Description = parsed.frontmatter.description ?? null;
        skill.Category = parsed.frontmatter.category ?? null;
        skill.Instructions = parsed.instructions;
        skill.Frontmatter = parsed.frontmatter.extra ? JSON.stringify(parsed.frontmatter.extra) : null;
        applyExtra?.(skill, parsed);
        if (!(await skill.Save())) {
            throw new Error(`Failed to save imported skill: ${skill.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }

        await this.resyncJunction(skill.ID, 'MJ: AI Skill Actions', actionIDs, 'ActionID', contextUser, md, exposeToModel);
        await this.resyncJunction(skill.ID, 'MJ: AI Skill Sub Agents', subAgentIDs, 'SubAgentID', contextUser, md);
        return { skill, warnings };
    }

    /** Loads the skill being updated, or starts a new Active one owned by the context user. */
    private static async loadOrCreateSkill(updateSkillId: string | undefined, contextUser: UserInfo, md: IMetadataProvider): Promise<MJAISkillEntity> {
        const skill = await md.GetEntityObject<MJAISkillEntity>('MJ: AI Skills', contextUser);
        if (updateSkillId) {
            if (!(await skill.Load(updateSkillId))) {
                throw new Error(`Skill ${updateSkillId} not found for update`);
            }
        } else {
            skill.NewRecord();
            skill.CreatedByUserID = contextUser.ID;
            skill.Status = 'Active';
        }
        return skill;
    }

    /** Stamps the source columns from a fetched bundle; a reviewed re-import clears `Pending`. */
    private static applySource(skill: MJAISkillEntity, source: SkillSource, bundle: SkillBundle, parsed: ParsedSkillMarkdown): void {
        skill.SourceType = source.SourceType;
        skill.SourceURL = SkillSourceURL(source);
        skill.SourceRef = source.SourceType === 'GitHub' ? source.Ref : null;
        skill.SourceVersion = parsed.frontmatter.version ?? null;
        skill.SourceContentHash = ComputeSkillContentHash(bundle);
        skill.LastSyncedAt = new Date();
        if (skill.Status === 'Pending') {
            skill.Status = 'Active';
        }
    }

    /** `AISkill.Frontmatter` as an object for export; anything unreadable is dropped rather than failing the export. */
    private static parseFrontmatterColumn(json: string | null): JSONObject | undefined {
        if (!json) {
            return undefined;
        }
        try {
            const value = JSON.parse(json) as JSONValue;
            return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
        } catch {
            return undefined;
        }
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

    /**
     * Replaces the skill's `MJ: AI Skill Files` rows with the fetched set (delete-and-recreate, like
     * {@link resyncJunction}): the upstream folder is authoritative, so a file it dropped goes too.
     */
    private static async resyncFiles(
        skillId: string,
        files: SkillBundleFile[],
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<void> {
        const rv = new RunView();
        const existing = await rv.RunView<MJAISkillFileEntity>({
            EntityName: 'MJ: AI Skill Files',
            ExtraFilter: `SkillID='${skillId}'`,
            ResultType: 'entity_object'
        }, contextUser);
        if (!existing.Success) {
            throw new Error(`Failed to read existing skill files: ${existing.ErrorMessage}`);
        }
        for (const row of existing.Results) {
            if (!(await row.Delete())) {
                throw new Error(`Failed to remove skill file '${row.Path}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
        for (const file of files) {
            const row = await provider.GetEntityObject<MJAISkillFileEntity>('MJ: AI Skill Files', contextUser);
            row.NewRecord();
            row.SkillID = skillId;
            row.Path = file.Path;
            row.Content = file.Content;
            if (!(await row.Save())) {
                throw new Error(`Failed to save skill file '${file.Path}': ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }
}
