/**
 * @fileoverview Orchestrates SKILL.md export/import against the database: resolves Action/Agent
 * names to IDs (import) and IDs back to names (export), and creates/updates the MJ: AI Skills +
 * junction entities. Builds on the pure {@link SkillMarkdownConverter} for the text<->data
 * transformation itself.
 *
 * @module @memberjunction/ai-agents
 */

import {
    DatabaseProviderBase,
    IEntityDataProvider,
    IMetadataProvider,
    Metadata,
    RunInEntityTransaction,
    RunView,
    UserInfo
} from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAISkillEntity, MJAISkillActionEntity, MJAISkillSubAgentEntity, MJAISkillFileEntity } from '@memberjunction/core-entities';
import { AIEngine } from '@memberjunction/aiengine';
import { ActionEngineServer } from '@memberjunction/actions';
import type { JSONObject, JSONValue } from '@memberjunction/ai';
import { SkillMarkdownConverter, type ParsedSkillMarkdown, type SkillMarkdownFrontmatter } from './SkillMarkdownConverter';
import {
    AssertStorableSkillFiles,
    ComputeSkillContentHash,
    DecideSkillUpdateStatus,
    FetchSkillBundle,
    MAX_SKILL_FILE_BYTES,
    ParseSkillSource,
    ResolveGitHubCommit,
    SkillSourceFromSkill,
    SkillSourceURL,
    ValidateSkillSource,
    type SkillBundle,
    type SkillBundleFile,
    type SkillSource
} from './SkillSources';

/**
 * Options for {@link SkillImportExportService.ImportSkill}.
 */
export interface ImportSkillOptions {
    /**
     * When provided, updates this existing skill instead of creating a new one. On an update, a
     * frontmatter key that is ABSENT keeps what the skill has: no `actions` key keeps the bundled
     * Actions, no `subAgents` key keeps the sub-agents, no `category` keeps the Category. A key that is
     * present replaces (an empty `actions:` removes every bundled Action). The caller is responsible for
     * confirming the current user is allowed to edit this skill (e.g. it's their own, per the "own
     * skills" RLS filter).
     */
    updateSkillId?: string;
}

/**
 * Options for {@link SkillImportExportService.ImportSkillFromSource}.
 */
export interface ImportSkillFromSourceOptions extends ImportSkillOptions {
    /**
     * The git ref for a GitHub source. When given it overrides the ref in the URL (re-importing a stored
     * SourceURL with the skill's SourceRef follows that ref); when omitted the URL's ref, or `HEAD`, is used.
     */
    ref?: string;
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

/** A name from the SKILL.md and the ID it resolved to. */
interface ResolvedName {
    Name: string;
    ID: string;
}

/** What `codeOnlyActions` says about `AISkillAction.ExposeToModel`, as {@link SkillImportExportService} applies it. */
interface ExposeToModelPlan {
    /** Per ActionID (upper-cased), the flag the file states. Wins over the row's current flag. */
    Stated: Map<string, boolean>;
    /** The flag for an action the file states nothing about and that has no row yet; undefined = the column default. */
    NewRowFlag?: boolean;
}

/** The junction rows an import writes. A null list keeps the skill's current rows of that kind. */
interface BundlePlan {
    ActionIDs: string[] | null;
    SubAgentIDs: string[] | null;
    Expose?: ExposeToModelPlan;
}

/** What an import from a source adds to the shared import: its columns and its files. */
interface SourcedImport {
    Apply: (skill: MJAISkillEntity, parsed: ParsedSkillMarkdown) => void;
    Files: SkillBundleFile[];
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

        const rv = RunView.FromMetadataProvider(md);
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
     * The skill row and its junction rows are written in one transaction.
     */
    public static async ImportSkill(
        markdownText: string,
        contextUser: UserInfo,
        options?: ImportSkillOptions,
        provider?: IMetadataProvider
    ): Promise<ImportSkillResult> {
        return this.importSkill(markdownText, contextUser, options, provider);
    }

    /**
     * Imports a skill from its upstream: a SKILL.md at an https URL, or a skill folder in a GitHub
     * repository (`https://github.com/<owner>/<repo>[/tree/<ref>/<path>]`, or a {@link SkillSource}).
     * Records the source on the skill (`SourceType`, `SourceURL`, `SourceRef`, `SourceVersion` from
     * `metadata.version`, `SourceContentHash`, `LastSyncedAt`) and, for GitHub, stores every other text
     * file in the folder as an `MJ: AI Skill Files` row. The skill, its junction rows and its files are
     * written in one transaction.
     *
     * For GitHub, the ref is first resolved to a commit and every file is read at that commit.
     * `SourceRef` keeps the ref that was asked for (what the update check follows), and `SourceURL`
     * links the folder at the imported commit, so pinning a skill to exactly what was imported is a
     * matter of copying that SHA into `SourceRef`.
     *
     * Re-importing a skill (`updateSkillId`) is how an admin accepts an upstream change: a `Pending`
     * skill becomes `Active` again. The update keeps the skill's local Name (upstream's `name` is
     * upstream's identifier; an admin may have renamed the skill here), and, as for any update, keeps
     * its bundled Actions, sub-agents and Category unless the SKILL.md has those keys.
     */
    public static async ImportSkillFromSource(
        source: SkillSource | string,
        contextUser: UserInfo,
        options?: ImportSkillFromSourceOptions,
        provider?: IMetadataProvider
    ): Promise<ImportSkillResult> {
        const tracked = ValidateSkillSource(typeof source === 'string' ? ParseSkillSource(source, options?.ref) : source);
        const pinned = tracked.SourceType === 'GitHub' ? { ...tracked, Ref: await ResolveGitHubCommit(tracked) } : tracked;
        const bundle = await FetchSkillBundle(pinned);
        AssertStorableSkillFiles(bundle.Files);
        const result = await this.importSkill(bundle.Markdown, contextUser, options, provider, {
            Apply: (skill, parsed) => this.applySource(skill, tracked, pinned, bundle, parsed),
            Files: bundle.Files
        });
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
     *
     * The check runs every time, so a skill that follows a moving ref is flagged again for as long as
     * upstream differs from what was imported. Setting it back to Active does not keep the current
     * version; pinning `SourceRef` to the imported commit (or clearing `SourceType`) does.
     */
    public static async CheckSkillForUpdate(skill: MJAISkillEntity): Promise<boolean> {
        const source = SkillSourceFromSkill(skill);
        if (!source || skill.Status !== 'Active') {
            return false;
        }
        const sourceBefore = this.sourceKey(skill);
        const upstreamHash = ComputeSkillContentHash(await FetchSkillBundle(source));
        if (!DecideSkillUpdateStatus(skill, upstreamHash)) {
            return false;
        }
        // The fetch took a while. Decide again on a fresh copy of the row, so a re-import (new content,
        // new hash) or a re-pin that landed meanwhile is neither overwritten by this stale copy nor flagged.
        if (!(await skill.Load(skill.ID))) {
            throw new Error(`Skill '${skill.Name}' could not be re-read before marking it Pending: ${skill.LatestResult?.CompleteMessage ?? 'not found'}`);
        }
        const status = this.sourceKey(skill) === sourceBefore ? DecideSkillUpdateStatus(skill, upstreamHash) : null;
        if (!status) {
            return false;
        }
        skill.Status = status;
        if (!(await skill.Save())) {
            throw new Error(`Failed to mark skill '${skill.Name}' Pending: ${skill.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
        return true;
    }

    /** The source columns, as one comparable string. */
    private static sourceKey(skill: Pick<MJAISkillEntity, 'SourceType' | 'SourceURL' | 'SourceRef'>): string {
        return [skill.SourceType, skill.SourceURL, skill.SourceRef].join('\n');
    }

    /**
     * Shared by both imports: parse and resolve names, then — in one transaction — create or load the
     * skill, apply the file, save, and resync its bundle (and, for a sourced import, its files).
     */
    private static async importSkill(
        markdownText: string,
        contextUser: UserInfo,
        options: ImportSkillOptions | undefined,
        provider: IMetadataProvider | undefined,
        sourced?: SourcedImport
    ): Promise<ImportSkillResult> {
        const parsed = SkillMarkdownConverter.Parse(markdownText);
        const warnings: string[] = [];
        // Name→ID resolution reads the AI/Action engine caches — ensure they're loaded (idempotent).
        // Without this, every bundled Action/sub-agent name would falsely resolve to a "not found"
        // warning on a cold server.
        await this.ensureEnginesConfigured(contextUser, provider ?? Metadata.Provider);
        const isUpdate = !!options?.updateSkillId;
        const plan = this.planBundle(parsed.frontmatter, isUpdate, warnings);

        const skill = await this.runAtomically(provider, async tx => {
            const row = await this.loadOrCreateSkill(options?.updateSkillId, contextUser, tx);
            this.applyParsed(row, parsed, isUpdate, !!sourced);
            sourced?.Apply(row, parsed);
            if (!(await row.Save())) {
                throw new Error(`Failed to save imported skill: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            if (plan.ActionIDs) {
                await this.resyncJunction(row.ID, 'MJ: AI Skill Actions', plan.ActionIDs, 'ActionID', contextUser, tx, plan.Expose);
            }
            if (plan.SubAgentIDs) {
                await this.resyncJunction(row.ID, 'MJ: AI Skill Sub Agents', plan.SubAgentIDs, 'SubAgentID', contextUser, tx);
            }
            if (sourced) {
                await this.resyncFiles(row.ID, sourced.Files, contextUser, tx);
            }
            return row;
        });
        return { skill, warnings };
    }

    /**
     * Runs the import's writes in one transaction on the caller's provider. With no provider, or the
     * process-global one, they run on an independent instance (shared pool, own transaction) instead:
     * a transaction left open on the shared global provider captures every other caller's writes
     * until it settles (#5059).
     */
    private static async runAtomically<T>(provider: IMetadataProvider | undefined, work: (tx: IMetadataProvider) => Promise<T>): Promise<T> {
        const shared = Metadata.Provider; // global-provider-ok: identified so the import never opens a transaction on it; only forked, or used when no transaction exists (#5059)
        if (provider && provider !== shared) {
            return RunInEntityTransaction(this.transactable(provider), () => work(provider));
        }
        if (!(shared instanceof DatabaseProviderBase)) {
            return work(shared); // a client-tier provider has no transaction to open; the import runs as before
        }
        const independent = await shared.CreateIndependentInstance();
        try {
            return await RunInEntityTransaction(independent, () => work(independent));
        } finally {
            await independent.ReleaseIndependentInstance();
        }
    }

    /** Transactions are an IEntityDataProvider capability; the metadata provider is also the data provider. */
    private static transactable(provider: IMetadataProvider): Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'> {
        return provider as unknown as Pick<IEntityDataProvider, 'SupportsEntityTransactions' | 'BeginEntityTransaction'>;
    }

    /**
     * Resolves the bundle the file asks for. On an update, an ABSENT `actions` or `subAgents` key keeps
     * the skill's current rows: an Anthropic-style SKILL.md has no MJ keys, and accepting its upstream
     * change must not drop the Actions and sub-agents bundled here. A present key, even empty, replaces.
     */
    private static planBundle(fm: SkillMarkdownFrontmatter, isUpdate: boolean, warnings: string[]): BundlePlan {
        const keepActions = isUpdate && fm.actions === undefined;
        const keepSubAgents = isUpdate && fm.subAgents === undefined;
        const actions = keepActions ? null : this.resolveNames(fm.actions ?? [], ActionEngineServer.Instance.Actions, warnings, 'Action');
        const subAgents = keepSubAgents ? null : this.resolveNames(fm.subAgents ?? [], AIEngine.Instance.Agents, warnings, 'Sub-agent');
        if (keepActions && fm.codeOnlyActions !== undefined) {
            warnings.push('codeOnlyActions ignored: the file has no actions key, so the bundled actions and their flags are kept as they are');
        }
        return {
            ActionIDs: actions ? actions.map(a => a.ID) : null,
            SubAgentIDs: subAgents ? subAgents.map(a => a.ID) : null,
            Expose: actions ? this.resolveExposeToModel(fm, actions, warnings) : undefined
        };
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

    /**
     * Copies the parsed SKILL.md onto the row. On an update, an absent `category` keeps the current one;
     * on an update from a source, the local Name is kept (see {@link ImportSkillFromSource}).
     */
    private static applyParsed(skill: MJAISkillEntity, parsed: ParsedSkillMarkdown, isUpdate: boolean, sourced: boolean): void {
        const fm = parsed.frontmatter;
        if (!(isUpdate && sourced)) {
            skill.Name = fm.name;
        }
        if (!isUpdate || fm.category !== undefined) {
            skill.Category = fm.category ?? null;
        }
        skill.Description = fm.description ?? null;
        skill.Instructions = parsed.instructions;
        skill.Frontmatter = fm.extra ? JSON.stringify(fm.extra) : null;
    }

    /**
     * Stamps the source columns from a fetched bundle; a reviewed re-import clears `Pending`. `tracked`
     * is the source as asked for (its ref is what the update check follows); `fetched` is what was read,
     * which for GitHub is the same folder at the resolved commit.
     */
    private static applySource(skill: MJAISkillEntity, tracked: SkillSource, fetched: SkillSource, bundle: SkillBundle, parsed: ParsedSkillMarkdown): void {
        skill.SourceType = tracked.SourceType;
        skill.SourceURL = SkillSourceURL(fetched);
        skill.SourceRef = tracked.SourceType === 'GitHub' ? tracked.Ref : null;
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

    /** Resolves names against a cached entity array (case-insensitively), collecting a warning for each miss. */
    private static resolveNames(
        names: string[],
        catalog: Array<{ ID: string; Name: string }>,
        warnings: string[],
        kindLabel: string
    ): ResolvedName[] {
        const resolved: ResolvedName[] = [];
        for (const name of names) {
            const match = catalog.find(c => normalizeName(c.Name) === normalizeName(name));
            if (match) {
                resolved.push({ Name: name, ID: match.ID });
            } else {
                warnings.push(`${kindLabel} '${name}' not found in this instance — skipped`);
            }
        }
        return resolved;
    }

    /**
     * Turns the frontmatter's `codeOnlyActions` into the ExposeToModel plan {@link resyncJunction} applies,
     * or `undefined` when the file has no such key — then the file expresses no opinion and each
     * surviving row keeps its flag.
     *
     * Every code-only name must also be listed under `actions`. One that is not (a typo, or a whole
     * `A, B` line read as one name by an older reader) means the list cannot be trusted, so it is not
     * applied: no action is made model-callable, a newly bundled action is code-only, and the names that
     * do match are still made code-only. Failing closed matters because "every other bundled action is
     * exposed" is exactly what a broken list would otherwise say.
     */
    private static resolveExposeToModel(
        frontmatter: SkillMarkdownFrontmatter,
        bundled: ResolvedName[],
        warnings: string[]
    ): ExposeToModelPlan | undefined {
        if (frontmatter.codeOnlyActions === undefined) {
            return undefined;
        }
        const listed = new Set((frontmatter.actions ?? []).map(normalizeName));
        const codeOnly = new Set(frontmatter.codeOnlyActions.map(normalizeName));
        const stated = new Map<string, boolean>();
        for (const action of bundled) {
            if (codeOnly.has(normalizeName(action.Name))) stated.set(action.ID.toUpperCase(), false);
        }
        const strays = frontmatter.codeOnlyActions.filter(name => !listed.has(normalizeName(name)));
        if (strays.length > 0) {
            warnings.push(`codeOnlyActions names ${strays.map(n => `'${n}'`).join(', ')}, which ${strays.length === 1 ? 'is' : 'are'} not listed under actions. ` +
                'The list was not applied: no action was made model-callable, and a newly bundled action is code-only. Fix the names and import again.');
            return { Stated: stated, NewRowFlag: false };
        }
        for (const action of bundled) {
            if (!stated.has(action.ID.toUpperCase())) stated.set(action.ID.toUpperCase(), true);
        }
        return { Stated: stated };
    }

    /**
     * Deletes existing junction rows for the skill and recreates them from the resolved ID set — the
     * simplest correct resync for a small bounded set of rows. Runs inside the import's transaction.
     *
     * Delete-and-recreate must not lose `AISkillAction.ExposeToModel` (#4226). A flag the SKILL.md
     * states (`codeOnlyActions`, → `expose.Stated`) wins. Otherwise a row that survives the resync (same
     * action before and after) keeps the flag it had, so re-saving a skill's SKILL.md never turns a
     * code-only action model-callable; only a genuinely new row takes `expose.NewRowFlag`, or the
     * column default.
     */
    private static async resyncJunction(
        skillId: string,
        entityName: 'MJ: AI Skill Actions' | 'MJ: AI Skill Sub Agents',
        resolvedIDs: string[],
        idFieldName: 'ActionID' | 'SubAgentID',
        contextUser: UserInfo,
        provider: IMetadataProvider,
        expose?: ExposeToModelPlan
    ): Promise<void> {
        const existing = await RunView.FromMetadataProvider(provider).RunView<MJAISkillActionEntity | MJAISkillSubAgentEntity>({
            EntityName: entityName,
            ExtraFilter: `SkillID='${skillId}'`,
            ResultType: 'entity_object',
            BypassCache: true // see resyncFiles
        }, contextUser);
        if (!existing.Success) {
            throw new Error(`Failed to read existing ${entityName} rows: ${existing.ErrorMessage}`);
        }

        const carried = new Map<string, boolean>();
        for (const row of existing.Results) {
            if (entityName === 'MJ: AI Skill Actions') {
                const actionRow = row as MJAISkillActionEntity;
                carried.set(actionRow.ActionID.toUpperCase(), actionRow.ExposeToModel);
            }
            if (!(await row.Delete())) {
                throw new Error(`Failed to remove existing ${entityName} row during skill re-sync: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }

        for (const id of resolvedIDs) {
            const junctionRow = await provider.GetEntityObject<MJAISkillActionEntity | MJAISkillSubAgentEntity>(entityName, contextUser);
            junctionRow.NewRecord();
            junctionRow.SkillID = skillId;
            (junctionRow as unknown as Record<string, string>)[idFieldName] = id;
            const key = id.toUpperCase();
            const flag = expose?.Stated.get(key) ?? carried.get(key) ?? expose?.NewRowFlag;
            if (flag !== undefined) {
                (junctionRow as MJAISkillActionEntity).ExposeToModel = flag;
            }
            if (!(await junctionRow.Save())) {
                throw new Error(`Failed to create ${entityName} row during skill re-sync: ${junctionRow.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        }
    }

    /**
     * Replaces the skill's `MJ: AI Skill Files` rows with the fetched set (delete-and-recreate, like
     * {@link resyncJunction}): the upstream folder is authoritative, so a file it dropped goes too. Runs
     * inside the import's transaction, after {@link AssertStorableSkillFiles} vetted the paths.
     */
    private static async resyncFiles(
        skillId: string,
        files: SkillBundleFile[],
        contextUser: UserInfo,
        provider: IMetadataProvider
    ): Promise<void> {
        const existing = await RunView.FromMetadataProvider(provider).RunView<MJAISkillFileEntity>({
            EntityName: 'MJ: AI Skill Files',
            ExtraFilter: `SkillID='${skillId}'`,
            ResultType: 'entity_object',
            // Read the database, not the server's view cache: entity events update that cache as rows
            // are deleted, and a rolled-back import leaves it saying the rows are gone when they are not.
            BypassCache: true
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

/** How a SKILL.md name is compared with a catalog name, and with another SKILL.md name. */
function normalizeName(name: string): string {
    return name.trim().toLowerCase();
}
