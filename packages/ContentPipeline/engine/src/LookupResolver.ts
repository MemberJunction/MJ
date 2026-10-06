/**
 * @fileoverview {@link LookupResolver} — turning a well-known field's *name* into the row id a
 * column wants.
 *
 * A working record carries `FileType` as `'html'`, because that is what a stage can reason about.
 * The entity stores `ContentFileTypeID`, a foreign key. Something has to bridge the two, and it has
 * to be explicit about what happens when the name matches nothing — silently dropping the value
 * loses a stage's finding, and silently creating a row grows a controlled vocabulary behind
 * everyone's back.
 *
 * @module @memberjunction/content-pipeline
 */

import { BaseEntity, IMetadataProvider, LogError, LogStatus, RunView, UserInfo } from '@memberjunction/core';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';

/** What to do when a proposed name matches no row. */
export type UnresolvedLookupPolicy =
    /** Leave the column alone and log. The value survives in FieldConfidence as a proposal. */
    | 'Skip'
    /** Create the row. Only for a vocabulary a deployment is happy to let the pipeline grow. */
    | 'Create'
    /** Treat it as a failure, so the record is not committed with a silently missing type. */
    | 'Fail';

/** Raised under the `Fail` policy. */
export class UnresolvedLookupError extends Error {
    constructor(entityName: string, name: string) {
        super(`No '${entityName}' row named '${name}', and the unresolved-lookup policy is 'Fail'`);
        this.name = 'UnresolvedLookupError';
    }
}

/**
 * Resolves lookup names to row ids, caching per entity for the life of a run.
 *
 * The cache matters: every record in a page proposes the same handful of type names, and resolving
 * each one per record would turn a type lookup into a per-record query.
 */
export class LookupResolver {
    /** entity name → (lowercased row name → id). */
    private readonly cache = new Map<string, Promise<Map<string, string>>>();

    constructor(
        private readonly provider: IMetadataProvider,
        private readonly contextUser?: UserInfo,
        private readonly policy: UnresolvedLookupPolicy = 'Skip',
    ) {}

    /**
     * The row id for a name, or `null` when nothing matches and the policy allows carrying on.
     *
     * @throws {UnresolvedLookupError} under the `Fail` policy.
     */
    public async Resolve(entityName: string, name: string, contextUser?: UserInfo): Promise<string | null> {
        const user = contextUser ?? this.contextUser;
        if (!user || !name || name.trim().length === 0) {
            return null;
        }
        const key = name.trim().toLowerCase();
        const byName = await this.load(entityName, user);
        const existing = byName.get(key);
        if (existing) {
            return existing;
        }

        if (this.policy === 'Fail') {
            throw new UnresolvedLookupError(entityName, name);
        }
        if (this.policy === 'Skip') {
            LogStatus(
                `LookupResolver: no '${entityName}' row named '${name}'; leaving the column unset. ` +
                    `The value is still recorded as a proposal in FieldConfidence.`,
            );
            return null;
        }
        return this.create(entityName, name, user, byName);
    }

    /** Every row's name → id, read once per entity per run. */
    private load(entityName: string, contextUser: UserInfo): Promise<Map<string, string>> {
        const existing = this.cache.get(entityName);
        if (existing) {
            return existing;
        }
        const promise = this.read(entityName, contextUser).catch((error: unknown) => {
            this.cache.delete(entityName);
            throw error;
        });
        this.cache.set(entityName, promise);
        return promise;
    }

    /** The rows backing a lookup, from the engine where it caches them. */
    private async rows(entityName: string, contextUser: UserInfo): Promise<readonly { ID: string; Name: string }[]> {
        const engine = KnowledgeHubMetadataEngine.Instance;
        await engine.Config(false, contextUser, this.provider);
        switch (entityName) {
            case 'MJ: Content Types':
                return engine.ContentTypes;
            case 'MJ: Content Source Types':
                return engine.ContentSourceTypes;
            case 'MJ: Content File Types':
                return engine.ContentFileTypes;
        }
        const rv = RunView.FromMetadataProvider(this.provider);
        const result = await rv.RunView<{ ID: string; Name: string }>({ EntityName: entityName }, contextUser);
        if (!result.Success) {
            throw new Error(`Could not read '${entityName}' to resolve lookups`);
        }
        return result.Results;
    }

    /**
     * Read the lookup table.
     *
     * The three content lookups this resolver serves are already cached by
     * {@link KnowledgeHubMetadataEngine}; reading them from there keeps one copy in the process
     * rather than a second one per resolver. Anything else falls back to a RunView.
     */
    private async read(entityName: string, contextUser: UserInfo): Promise<Map<string, string>> {
        const rows = await this.rows(entityName, contextUser);
        const map = new Map<string, string>();
        for (const row of rows) {
            if (typeof row.Name === 'string') {
                map.set(row.Name.trim().toLowerCase(), row.ID);
            }
        }
        return map;
    }

    /** Add a row for an unseen name, under the `Create` policy. */
    private async create(
        entityName: string,
        name: string,
        contextUser: UserInfo,
        byName: Map<string, string>,
    ): Promise<string | null> {
        const entityObject = await this.provider.GetEntityObject<BaseEntity>(entityName, contextUser);
        entityObject.NewRecord();
        entityObject.Set('Name', name);
        if (entityObject.Fields.some((f) => f.Name === 'Description')) {
            entityObject.Set('Description', `Created by the content pipeline for '${name}'.`);
        }
        if (!(await entityObject.Save())) {
            LogError(`LookupResolver: could not create '${entityName}' row '${name}'`);
            return null;
        }
        const id = entityObject.Get('ID') as string;
        byName.set(name.trim().toLowerCase(), id);
        return id;
    }
}
