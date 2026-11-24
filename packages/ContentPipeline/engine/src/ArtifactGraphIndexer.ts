/**
 * @fileoverview {@link ArtifactGraphIndexer} — puts artifacts (MJ Docs and any other text artifact
 * type) into the Content Pipeline, and through it into a semantic graph, as they are saved.
 *
 * Which artifacts go where is metadata: a push-only (`Upload`) Content Source whose
 * `Configuration.Artifacts.ArtifactTypes` names an artifact type receives the latest version of
 * every artifact of that type. Its `GraphID` and `GraphOverlay` decide which graph the document's
 * chunks feed, exactly as for any other source. Nothing here names a graph or an artifact type.
 *
 * - One Content Item per artifact per source, always the latest version. The item is linked to the
 *   `MJ: Artifacts` record through `MJ: Entity Record Documents`, so the graph's provenance access
 *   policies show the document, its chunks and the concepts synthesized from them only to people who
 *   can open the artifact.
 * - Saves are debounced per artifact (collaborative editing compacts versions often), and one
 *   artifact is never indexed twice at once.
 * - Durable record-mention tokens (`@{"_mode":"mention","type":"record","entityName":"...","name":"...","ID":"..."}`,
 *   created with {@link ConversationUtility.CreateRecordLink}) become `MJ: Record Links` rows
 *   (`LinkType = 'LinksTo'`) whose `TargetEntityID` and `TargetRecordID` come straight from the
 *   token. Name-to-ID resolution never happens on the server; plain `[[Name]]` text stays plain
 *   text. Target readability is not checked at index time — the graph engine hides endpoints a
 *   viewer cannot read. Links are reconciled on every index: a removed token removes its link.
 * - A deleted artifact, or one whose latest version has no text, is taken out of the index; the
 *   Delete stage retracts what the Graph stage inferred from it. A deleted artifact's links, to it
 *   and from it, are deleted too.
 *
 * Runs only in the process where the save happened (entity events are local), so several API
 * servers never index the same save twice. Indexing runs as the system user: it writes on behalf of
 * the platform, and who may READ the results is decided later, per viewer, by the access policies.
 *
 * @module @memberjunction/content-pipeline
 */

import { ConversationUtility, type MentionContent } from '@memberjunction/ai-core-plus';
import {
    BaseEntity,
    BaseEntityEvent,
    IMetadataProvider,
    LogError,
    LogStatusEx,
    Metadata,
    RunView,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import { KnowledgeHubMetadataEngine, MJArtifactEntity, MJArtifactVersionEntity, MJRecordLinkEntity } from '@memberjunction/core-entities';
import { BaseSingleton, EscapeSQLString, MJEvent, MJEventType, MJGlobal, NormalizeUUID, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { ContentUploadIngestor } from './ContentUploadIngestor.js';

const ARTIFACTS_ENTITY = 'MJ: Artifacts';
const ARTIFACT_VERSIONS_ENTITY = 'MJ: Artifact Versions';
const RECORD_LINKS_ENTITY = 'MJ: Record Links';
/** `MJ: Record Links.LinkType` for a durable record-mention link; also the graph edge type it projects as. */
export const ARTIFACT_LINK_TYPE = 'LinksTo';
const DEFAULT_DEBOUNCE_MS = 10_000;
/** Most record-link tokens one document may turn into links; past it the rest are ignored (and logged). */
const MAX_LINKS_PER_ARTIFACT = 200;

/** One Content Source that indexes artifacts, read from its `Configuration.Artifacts`. */
export interface ArtifactIndexTarget {
    ContentSourceID: string;
    /** Lower-cased artifact type names. */
    ArtifactTypes: ReadonlySet<string>;
    DebounceMs: number;
}

/** What indexing one artifact did in one source. */
export interface ArtifactIndexOutcome {
    ContentSourceID: string;
    Status: 'Indexed' | 'Unchanged' | 'Removed' | 'NotIndexed' | 'Failed';
    ContentItemID?: string;
    Message?: string;
}

/** Result of {@link ArtifactGraphIndexer.IndexArtifact}. */
export interface ArtifactIndexResult {
    ArtifactID: string;
    Outcomes: ArtifactIndexOutcome[];
    /**
     * Record links created and removed; `null` when the artifact is not indexed anywhere.
     * For a deleted artifact, the links to and from it that were removed.
     */
    Links: ArtifactLinkResult | null;
}

/** What reconciling one artifact's durable record links changed. */
export interface ArtifactLinkResult {
    Created: number;
    Removed: number;
    /** Entity names or token descriptions skipped because the entity is unknown or PK fields are missing. */
    Skipped: string[];
}

/** A parsed record-mention token extracted from document text. */
export interface ParsedRecordLinkToken {
    EntityName: string;
    Label: string;
    Content: MentionContent;
    RawToken: string;
}

interface ResolvedLinkTarget {
    TargetEntityID: string;
    TargetRecordID: string;
    LinkText: string;
    DedupKey: string;
}

type ArtifactRow = Pick<MJArtifactEntity, 'ID' | 'Name' | 'Description' | 'Type'>;
type VersionRow = Pick<MJArtifactVersionEntity, 'ID' | 'Content' | 'VersionNumber'>;

/**
 * Indexes artifacts into push-only Content Sources as they are saved. Process-wide singleton;
 * {@link Start} subscribes it to entity events, {@link IndexArtifact} indexes one artifact now.
 */
export class ArtifactGraphIndexer extends BaseSingleton<ArtifactGraphIndexer> {
    private subscription: { unsubscribe(): void } | null = null;
    private readonly timers = new UUIDMap<ReturnType<typeof setTimeout>>();
    private readonly running = new UUIDSet();
    private readonly rerun = new UUIDSet();

    protected constructor() {
        super();
    }

    public static get Instance(): ArtifactGraphIndexer {
        return super.getInstance<ArtifactGraphIndexer>();
    }

    /** Subscribe to entity events. Idempotent. */
    public Start(): void {
        if (this.subscription) {
            return;
        }
        this.subscription = MJGlobal.Instance.GetEventListener(false).subscribe((event) => this.HandleEvent(event));
    }

    /** Unsubscribe and drop every pending index. For shutdown and tests. */
    public Stop(): void {
        this.subscription?.unsubscribe();
        this.subscription = null;
        for (const [, timer] of this.timers) {
            clearTimeout(timer);
        }
        this.timers.Clear();
    }

    /** Schedules indexing for a saved artifact version, or a saved or deleted artifact. Public so tests can drive it. */
    public HandleEvent(event: MJEvent): void {
        if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode || !event.args) {
            return;
        }
        const entityEvent = event.args as BaseEntityEvent;
        if ((entityEvent.type !== 'save' && entityEvent.type !== 'delete') || !entityEvent.baseEntity) {
            return;
        }
        const artifactID = this.artifactIDOf(entityEvent);
        if (!artifactID) {
            return;
        }
        const provider = entityEvent.provider ?? AsMetadataProvider(entityEvent.baseEntity.ProviderToUse) ?? Metadata.Provider;
        const targets = this.loadedTargets();
        if (targets && targets.length === 0) {
            return; // Nothing configured to index artifacts: no timer, no work.
        }
        this.schedule(artifactID, provider, maxDebounce(targets));
    }

    /**
     * Index one artifact now in every Content Source configured for its type: push its latest text,
     * or remove it when it is gone or empty, then reconcile its record-mention links.
     */
    public async IndexArtifact(artifactID: string, provider: IMetadataProvider, contextUser?: UserInfo): Promise<ArtifactIndexResult> {
        const user = contextUser ?? (await WellKnownUserSource.Instance.GetSystemUser(provider));
        if (!user) {
            throw new Error('ArtifactGraphIndexer: no system user is available to index artifacts');
        }
        const targets = await this.ResolveTargets(user, provider);
        const result: ArtifactIndexResult = { ArtifactID: artifactID, Outcomes: [], Links: null };
        if (targets.length === 0) {
            return result;
        }
        const artifact = await this.loadArtifact(artifactID, provider, user);
        const version = artifact ? await this.loadLatestVersion(artifactID, provider, user) : null;
        const text = version?.Content?.trim() ? version.Content : null;
        const typeName = artifact?.Type?.trim().toLowerCase() ?? '';
        const doc = artifact && text ? { artifact, text } : null;
        for (const target of targets) {
            const wanted = doc && target.ArtifactTypes.has(typeName) ? doc : null;
            result.Outcomes.push(await this.indexInSource(target, artifactID, wanted, provider, user));
        }
        if (!artifact) {
            result.Links = await this.removeAllLinks(artifactID, provider, user);
        } else if (targets.some((t) => t.ArtifactTypes.has(typeName))) {
            result.Links = await this.reconcileLinks(artifact, text ?? '', provider, user);
        }
        return result;
    }

    /** Content Sources whose configuration indexes artifacts. */
    public async ResolveTargets(user: UserInfo, provider: IMetadataProvider): Promise<ArtifactIndexTarget[]> {
        await KnowledgeHubMetadataEngine.Instance.Config(false, user, provider);
        return this.loadedTargets() ?? [];
    }

    /** Targets from the already-loaded Knowledge Hub cache, or `null` when it is not loaded yet. */
    private loadedTargets(): ArtifactIndexTarget[] | null {
        const engine = KnowledgeHubMetadataEngine.Instance;
        if (!engine.Loaded) {
            return null;
        }
        const targets: ArtifactIndexTarget[] = [];
        for (const source of engine.ContentSources) {
            const config = source.ConfigurationObject?.Artifacts;
            const types = (config?.ArtifactTypes ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
            if (!config || config.Enabled === false || types.length === 0) {
                continue;
            }
            const debounce = typeof config.DebounceMs === 'number' && config.DebounceMs >= 0 ? config.DebounceMs : DEFAULT_DEBOUNCE_MS;
            targets.push({ ContentSourceID: source.ID, ArtifactTypes: new Set(types), DebounceMs: debounce });
        }
        return targets;
    }

    private artifactIDOf(event: BaseEntityEvent): string | null {
        const entity = event.baseEntity;
        const name = (entity?.EntityInfo?.Name ?? event.entityName ?? '').trim().toLowerCase();
        if (!entity) {
            return null;
        }
        if (name === ARTIFACT_VERSIONS_ENTITY.toLowerCase()) {
            return (entity as MJArtifactVersionEntity).ArtifactID ?? null;
        }
        if (name === ARTIFACTS_ENTITY.toLowerCase()) {
            return (entity as MJArtifactEntity).ID ?? null;
        }
        return null;
    }

    /** Debounce per artifact; a save during a run asks for one more run after it. */
    private schedule(artifactID: string, provider: IMetadataProvider, delayMs: number): void {
        const existing = this.timers.Get(artifactID);
        if (existing) {
            clearTimeout(existing);
        }
        const timer = setTimeout(() => {
            this.timers.Delete(artifactID);
            void this.runScheduled(artifactID, provider);
        }, delayMs);
        // A pending index must not keep a CLI process alive.
        (timer as { unref?: () => void }).unref?.();
        this.timers.Set(artifactID, timer);
    }

    private async runScheduled(artifactID: string, provider: IMetadataProvider): Promise<void> {
        if (this.running.Has(artifactID)) {
            this.rerun.Add(artifactID);
            return;
        }
        this.running.Add(artifactID);
        try {
            const result = await this.IndexArtifact(artifactID, provider);
            const failed = result.Outcomes.filter((o) => o.Status === 'Failed');
            if (failed.length > 0) {
                LogError(`ArtifactGraphIndexer: artifact ${artifactID}: ${failed.map((f) => `${f.ContentSourceID}: ${f.Message}`).join('; ')}`);
            }
            LogStatusEx({ message: `ArtifactGraphIndexer: indexed artifact ${artifactID}: ${result.Outcomes.map((o) => o.Status).join(', ') || 'no source'}`, verboseOnly: true });
        } catch (error) {
            LogError(`ArtifactGraphIndexer: indexing artifact ${artifactID} failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.running.Delete(artifactID);
            if (this.rerun.Delete(artifactID)) {
                this.schedule(artifactID, provider, 0);
            }
        }
    }

    /** Push the text into one source, or remove it from that source when `doc` is null. */
    private async indexInSource(
        target: ArtifactIndexTarget,
        artifactID: string,
        doc: { artifact: ArtifactRow; text: string } | null,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<ArtifactIndexOutcome> {
        const origin = { EntityName: ARTIFACTS_ENTITY, RecordID: artifactID };
        try {
            if (!doc) {
                const removed = await ContentUploadIngestor.RemoveText({ ContentSourceID: target.ContentSourceID, Origin: origin, RunNow: true, ContextUser: user, Provider: provider });
                return { ContentSourceID: target.ContentSourceID, Status: removed ? 'Removed' : 'NotIndexed' };
            }
            const pushed = await ContentUploadIngestor.IngestText({
                ContentSourceID: target.ContentSourceID,
                Origin: origin,
                Name: doc.artifact.Name,
                Description: doc.artifact.Description,
                Text: doc.text,
                RunNow: true,
                ContextUser: user,
                Provider: provider,
            });
            return { ContentSourceID: target.ContentSourceID, Status: pushed.Unchanged ? 'Unchanged' : 'Indexed', ContentItemID: pushed.ContentItemID };
        } catch (error) {
            return { ContentSourceID: target.ContentSourceID, Status: 'Failed', Message: error instanceof Error ? error.message : String(error) };
        }
    }

    private async loadArtifact(artifactID: string, provider: IMetadataProvider, user: UserInfo): Promise<ArtifactRow | null> {
        const result = await RunView.FromMetadataProvider(provider).RunView<ArtifactRow>(
            {
                EntityName: ARTIFACTS_ENTITY,
                Fields: ['ID', 'Name', 'Description', 'Type'],
                ExtraFilter: `[ID] = '${EscapeSQLString(artifactID)}'`,
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!result.Success) {
            throw new Error(`could not read artifact ${artifactID}: ${result.ErrorMessage}`);
        }
        return result.Results[0] ?? null;
    }

    private async loadLatestVersion(artifactID: string, provider: IMetadataProvider, user: UserInfo): Promise<VersionRow | null> {
        const result = await RunView.FromMetadataProvider(provider).RunView<VersionRow>(
            {
                EntityName: ARTIFACT_VERSIONS_ENTITY,
                Fields: ['ID', 'Content', 'VersionNumber'],
                ExtraFilter: `[ArtifactID] = '${EscapeSQLString(artifactID)}'`,
                OrderBy: '[VersionNumber] DESC',
                MaxRows: 1,
                ResultType: 'simple',
                BypassCache: true,
            },
            user,
        );
        if (!result.Success) {
            throw new Error(`could not read the versions of artifact ${artifactID}: ${result.ErrorMessage}`);
        }
        return result.Results[0] ?? null;
    }

    /**
     * Make the artifact's `LinksTo` record links match the durable record-mention tokens in its
     * text. Every target entity and primary key comes straight from the token — no name lookup
     * and no target readability check at index time. Unknown entities and malformed tokens are
     * logged and skipped.
     */
    private async reconcileLinks(artifact: ArtifactRow, text: string, provider: IMetadataProvider, user: UserInfo): Promise<ArtifactLinkResult> {
        const artifactEntity = provider.EntityByName(ARTIFACTS_ENTITY);
        if (!artifactEntity) {
            throw new Error(`entity '${ARTIFACTS_ENTITY}' is not in metadata`);
        }
        const { Targets, Skipped } = this.resolveTokensToTargets(artifact.ID, artifactEntity.ID, text, provider);
        const desiredKeys = new Set(Targets.map((t) => t.DedupKey));
        const existing = await this.loadLinks(artifact.ID, 'outgoing', provider, user);
        let removed = 0;
        const presentKeys = new Set<string>();
        for (const link of existing) {
            const key = recordLinkDedupKey(link.TargetEntityID, link.TargetRecordID);
            if (!desiredKeys.has(key)) {
                if (!(await link.Delete())) {
                    throw new Error(`could not remove record link ${link.ID}: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
                }
                removed++;
            } else {
                presentKeys.add(key);
            }
        }
        let created = 0;
        let sequence = 0;
        for (const target of Targets) {
            sequence++;
            if (presentKeys.has(target.DedupKey)) {
                continue;
            }
            await this.createLink(artifact.ID, artifactEntity.ID, target.TargetEntityID, target.TargetRecordID, target.LinkText, sequence, provider, user);
            created++;
        }
        return { Created: created, Removed: removed, Skipped };
    }

    /** Convert parsed record-mention tokens to distinct `(TargetEntityID, TargetRecordID)` targets. */
    private resolveTokensToTargets(
        artifactID: string,
        artifactEntityID: string,
        text: string,
        provider: IMetadataProvider,
    ): { Targets: ResolvedLinkTarget[]; Skipped: string[] } {
        const tokens = ParseRecordLinkTokens(text);
        const targets: ResolvedLinkTarget[] = [];
        const skipped: string[] = [];
        const seen = new Set<string>();
        for (const token of tokens) {
            const targetEntity = provider.EntityByName(token.EntityName);
            if (!targetEntity) {
                LogError(`ArtifactGraphIndexer: skipping record link in artifact ${artifactID} — unknown entity '${token.EntityName}'`);
                skipped.push(token.EntityName);
                continue;
            }
            const pkNames = targetEntity.PrimaryKeys.map((pk) => pk.Name);
            const compositeKey = ConversationUtility.CompositeKeyFromRecordLink(token.Content, pkNames);
            if (!compositeKey) {
                LogError(`ArtifactGraphIndexer: skipping malformed record link in artifact ${artifactID} for entity '${token.EntityName}' — missing primary key field(s)`);
                skipped.push(token.EntityName);
                continue;
            }
            const targetRecordID = compositeKey.ToCompactURLSegment();
            if (UUIDsEqual(targetEntity.ID, artifactEntityID) && UUIDsEqual(targetRecordID, artifactID)) {
                continue;
            }
            const dedupKey = recordLinkDedupKey(targetEntity.ID, targetRecordID);
            if (seen.has(dedupKey)) {
                continue;
            }
            if (targets.length >= MAX_LINKS_PER_ARTIFACT) {
                LogStatusEx({ message: `ArtifactGraphIndexer: more than ${MAX_LINKS_PER_ARTIFACT} record links in artifact ${artifactID}; the rest are ignored.`, verboseOnly: true });
                break;
            }
            seen.add(dedupKey);
            targets.push({
                TargetEntityID: targetEntity.ID,
                TargetRecordID: targetRecordID,
                LinkText: token.Label,
                DedupKey: dedupKey,
            });
        }
        return { Targets: targets, Skipped: skipped };
    }

    /** A deleted artifact takes its `LinksTo` rows with it, both the ones it made and the ones pointing at it. */
    private async removeAllLinks(artifactID: string, provider: IMetadataProvider, user: UserInfo): Promise<ArtifactLinkResult> {
        let removed = 0;
        for (const link of await this.loadLinks(artifactID, 'both', provider, user)) {
            if (!(await link.Delete())) {
                throw new Error(`could not remove record link ${link.ID}: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
            removed++;
        }
        return { Created: 0, Removed: removed, Skipped: [] };
    }

    /** The artifact's `LinksTo` record links: the ones it makes, or those plus the ones pointing at it. */
    private async loadLinks(artifactID: string, direction: 'outgoing' | 'both', provider: IMetadataProvider, user: UserInfo): Promise<MJRecordLinkEntity[]> {
        const entityID = EscapeSQLString(provider.EntityByName(ARTIFACTS_ENTITY)?.ID ?? '');
        const id = EscapeSQLString(artifactID);
        const outgoing = `[SourceEntityID] = '${entityID}' AND [SourceRecordID] = '${id}'`;
        const ends = direction === 'outgoing' ? outgoing : `((${outgoing}) OR ([TargetEntityID] = '${entityID}' AND [TargetRecordID] = '${id}'))`;
        const result = await RunView.FromMetadataProvider(provider).RunView<MJRecordLinkEntity>(
            {
                EntityName: RECORD_LINKS_ENTITY,
                ExtraFilter: `${ends} AND [LinkType] = '${ARTIFACT_LINK_TYPE}'`,
                ResultType: 'entity_object',
                IgnoreMaxRows: true,
                BypassCache: true,
            },
            user,
        );
        if (!result.Success) {
            throw new Error(`could not read record links of artifact ${artifactID}: ${result.ErrorMessage}`);
        }
        return result.Results;
    }

    private async createLink(
        sourceID: string,
        sourceEntityID: string,
        targetEntityID: string,
        targetRecordID: string,
        linkText: string,
        sequence: number,
        provider: IMetadataProvider,
        user: UserInfo,
    ): Promise<void> {
        const link = await provider.GetEntityObject<MJRecordLinkEntity>(RECORD_LINKS_ENTITY, user);
        link.NewRecord();
        link.SourceEntityID = sourceEntityID;
        link.SourceRecordID = sourceID;
        link.TargetEntityID = targetEntityID;
        link.TargetRecordID = targetRecordID;
        link.LinkType = ARTIFACT_LINK_TYPE;
        link.Sequence = sequence;
        link.Metadata = JSON.stringify({ LinkText: linkText, CreatedBy: 'ArtifactGraphIndexer' });
        if (!(await link.Save())) {
            throw new Error(`could not create record link to ${targetRecordID}: ${link.LatestResult?.CompleteMessage ?? 'unknown error'}`);
        }
    }
}

/**
 * Extracts all record-mention tokens (`@{"_mode":"mention","type":"record",...}`) from `text`
 * in order of appearance, reusing {@link ConversationUtility.ParseSpecialContent}.
 */
export function ParseRecordLinkTokens(text: string): ParsedRecordLinkToken[] {
    if (!text) {
        return [];
    }
    const tokens = ConversationUtility.ParseSpecialContent(text);
    const out: ParsedRecordLinkToken[] = [];
    for (const token of tokens) {
        if (token.mode !== 'mention') {
            continue;
        }
        const content = token.content as MentionContent;
        if (content.type !== 'record' || !content.entityName) {
            continue;
        }
        const entityName = content.entityName.trim();
        if (!entityName) {
            continue;
        }
        const label = (content.name ?? '').trim() || entityName;
        out.push({
            EntityName: entityName,
            Label: label,
            Content: content,
            RawToken: token.originalText,
        });
    }
    return out;
}

/** Case-normalized key for de-duplicating and reconciling `(TargetEntityID, TargetRecordID)` pairs. */
function recordLinkDedupKey(entityID: string, recordID: string): string {
    return `${NormalizeUUID(entityID)}|${recordID.trim().toLowerCase()}`;
}

/** The entity's provider when it is also a metadata provider (it is, on a server), else `null`. */
function AsMetadataProvider(provider: object | null | undefined): IMetadataProvider | null {
    return provider && 'EntityByName' in provider && 'GetEntityObject' in provider ? (provider as IMetadataProvider) : null;
}

/** The longest debounce among targets, or the default when they are not loaded yet. */
function maxDebounce(targets: ArtifactIndexTarget[] | null): number {
    if (!targets || targets.length === 0) {
        return DEFAULT_DEBOUNCE_MS;
    }
    return Math.max(...targets.map((t) => t.DebounceMs));
}
