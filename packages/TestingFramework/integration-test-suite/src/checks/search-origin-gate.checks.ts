/**
 * search-origin-gate.checks.ts — the 'search-origin-gate' bundle (SOG1–SOG4): the search engine's
 * origin-record gate (`SearchEngine.VerifyOriginRecords`) against a live database.
 *
 * A content item or chunk is a row of its own entity, but it was DERIVED from another record — the one
 * its `MJ: Entity Record Documents` row names — and the right to read it belongs to that origin. The unit
 * tier (SearchEngine.originRecords.test.ts) pins the walk chunk → item (→ root) → document → origin
 * against a fake database; this bundle proves it against the real views (`vwContentItems.RootParentID`,
 * the document view's `Entity` join) and the origin entity's real permissions.
 *
 * TRANSPORT: SERVER. `filterByPermissions` is a protected server-side step of `SearchEngine.Search` with
 * no client surface; a test subclass exposes it (the keyhole pattern of agent-loop-standin). No model,
 * no embedding and no vector index is touched: the hits are built by hand, labelled as the vector lane
 * labels them.
 *
 * FIXTURES (own rows, tagged "(mj-integration-test — safe to delete)", created by Setup as ctx.User): a
 * content source type / file type / content type / content source, an INACTIVE entity document on
 * `MJ: AI Agents` (inactive so the scheduled vector sync never picks it up), and two chains of Entity
 * Record Document → Content Item → Content Item Chunk — one naming an existing agent (a readable
 * origin), one naming an agent id that is never minted (an origin that does not exist). Borrowed,
 * read-only: one vector index, template, entity document type, AI model and agent, plus the seeded
 * role-less user `it-nogrant@integration.test`. SOG4 deletes every fixture row and asserts it is gone;
 * the lifecycle Teardown is the best-effort backstop when a check fails first. Missing borrowed rows →
 * every check SKIPS-AS-PASS LOUDLY. Not RequiresMutation-gated, mirroring agent-loop-standin: it writes
 * only its own tagged rows and removes them.
 */
import { BaseEntity, RunView, UserInfo } from '@memberjunction/core';
import type { IMetadataProvider, RunViewParams } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type {
    MJContentFileTypeEntity,
    MJContentItemChunkEntity,
    MJContentItemEntity,
    MJContentSourceEntity,
    MJContentSourceTypeEntity,
    MJContentTypeEntity,
    MJEntityDocumentEntity,
    MJEntityRecordDocumentEntity
} from '@memberjunction/core-entities';
import { SearchEngine } from '@memberjunction/search-engine';
import type { SearchResultItem } from '@memberjunction/search-engine';
import { Assert, AssertEqual, IntegrationCheckRegistry, SEED_FIXTURES_COMMAND, SEEDED_NOGRANT_EMAIL } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const MARKER = '(mj-integration-test — safe to delete)';
const CHUNKS = 'MJ: Content Item Chunks';
const ITEMS = 'MJ: Content Items';
const DOCUMENTS = 'MJ: Entity Record Documents';
const ORIGIN_ENTITY = 'MJ: AI Agents';
/** Every entity the gate reads on the way from a chunk hit to its origin. */
const GATE_ENTITIES = [CHUNKS, ITEMS, DOCUMENTS, ORIGIN_ENTITY];
/** A syntactically valid agent id that is never minted: the origin of the "missing origin" chain. */
const MISSING_ORIGIN_ID = '00000000-0000-4000-8000-00000000506a';

/** The three rows of one derived-content chain. */
interface ContentChain {
    ChunkID: string;
    ItemID: string;
    DocumentID: string;
}

/** A fixture row, kept so it can be deleted and then looked for again. */
interface CreatedRow {
    EntityName: string;
    WhereClause: string;
    Row: BaseEntity;
    Deleted: boolean;
}

/** Bundle state (module-level: IntegrationCheckContext has no slot for it and the framework is not modified). */
interface OriginGateFixture {
    Prefix: string;
    SkipReason?: string;
    /** In creation order; deleted in reverse. */
    Created: CreatedRow[];
    Readable?: ContentChain;
    Missing?: ContentChain;
    /** Set by SOG4 once every row is deleted and proven gone, so Teardown has nothing left to do. */
    Removed: boolean;
}
let fixture: OriginGateFixture | undefined;

/** The borrowed, read-only rows the fixtures point at. */
interface ContentScaffold {
    SourceID: string;
    ContentTypeID: string;
    SourceTypeID: string;
    FileTypeID: string;
    EntityDocumentID: string;
    VectorIndexID: string;
    OriginEntityID: string;
}

interface BorrowedSeeds {
    VectorIndexID: string;
    TemplateID: string;
    DocumentTypeID: string;
    AIModelID: string;
    OriginID: string;
    OriginEntityID: string;
}

/**
 * SearchEngine with its permission filter exposed. The engine reads metadata through `ProviderToUse`,
 * which this subclass binds to the run's provider instead of the engine base's cached one.
 */
class OriginGateProbe extends SearchEngine {
    private probeProvider: IMetadataProvider | undefined;

    public static For(provider: IMetadataProvider): OriginGateProbe {
        const probe = OriginGateProbe.getInstance<OriginGateProbe>();
        probe.probeProvider = provider;
        return probe;
    }

    protected override get ProviderToUse(): IMetadataProvider {
        if (!this.probeProvider) {
            throw new Error('OriginGateProbe used before For(provider)');
        }
        return this.probeProvider;
    }

    /** Both gates: entity-level ownership + row filters, then the origin-record gate. */
    public async FilterByPermissions(results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> {
        return this.filterByPermissions(results, contextUser);
    }

    /** The origin-record gate alone, for one entity's results — skipping the entity-level check before it. */
    public async VerifyOrigins(entityName: string, results: SearchResultItem[], contextUser: UserInfo): Promise<SearchResultItem[]> {
        const entity = this.ProviderToUse.EntityByName(entityName);
        Assert(!!entity, `'${entityName}' is not in metadata`);
        return this.VerifyOriginRecords(entity!, results, contextUser);
    }
}

function skipNote(checkId: string, reason: string): void {
    console.warn(`  ⚠ search-origin-gate.${checkId} SKIPPED — ${reason}`);
}

/** The gate entities `user` may NOT read at the entity level. */
function unreadableEntities(provider: IMetadataProvider, user: UserInfo): string[] {
    return GATE_ENTITIES.filter(name => !provider.EntityByName(name)?.GetUserPermisions(user)?.CanRead);
}

/** A hit as the vector lane labels a content result. */
function contentHit(entityName: string, recordID: string, label: string): SearchResultItem {
    return {
        ID: `sog-${label}-${recordID}`,
        EntityName: entityName,
        RecordID: recordID,
        SourceType: 'vector',
        Title: `${label} ${MARKER}`,
        Snippet: '',
        Score: 0.9,
        ScoreBreakdown: {},
        Tags: [],
        MatchedAt: new Date(),
        ResultType: 'content-item'
    };
}

/** The chunk hit and the item hit of one chain, in that order. */
function chainHits(chain: ContentChain, label: string): SearchResultItem[] {
    return [contentHit(CHUNKS, chain.ChunkID, `${label}-chunk`), contentHit(ITEMS, chain.ItemID, `${label}-item`)];
}

/** Hit ids, comma-joined in order — the order filterByPermissions preserves. */
function hitIDs(results: SearchResultItem[]): string {
    return results.map(r => r.ID).join(',');
}

/** Create one fixture row as ctx.User, recording it for deletion before anything else can throw. */
async function saveRow<T extends BaseEntity>(
    ctx: IntegrationCheckContext,
    fx: OriginGateFixture,
    entityName: string,
    fill: (row: T) => void
): Promise<T> {
    const row = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User);
    row.NewRecord();
    fill(row);
    const saved = await row.Save();
    Assert(saved, `${entityName} fixture save failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    fx.Created.push({ EntityName: entityName, WhereClause: row.PrimaryKey.ToWhereClause(), Row: row, Deleted: false });
    return row;
}

/** One existing row of each table the fixtures reference, in a single batch; a string names what is missing. */
async function borrowSeeds(ctx: IntegrationCheckContext): Promise<BorrowedSeeds | string> {
    const originEntity = ctx.Provider.EntityByName(ORIGIN_ENTITY);
    if (!originEntity) {
        return `'${ORIGIN_ENTITY}' is not in metadata`;
    }
    const names = ['MJ: Vector Indexes', 'MJ: Templates', 'MJ: Entity Document Types', 'MJ: AI Models', ORIGIN_ENTITY];
    const first = (EntityName: string): RunViewParams => ({ EntityName, Fields: ['ID'], OrderBy: 'ID', MaxRows: 1, ResultType: 'simple' });
    const results = await new RunView().RunViews<{ ID: string }>(names.map(first), ctx.User);
    const ids = results.map(r => (r.Success ? r.Results[0]?.ID : undefined));
    const absent = names.filter((_, i) => !ids[i]);
    if (absent.length > 0) {
        return `no row to borrow in ${absent.join(', ')}`;
    }
    const [VectorIndexID, TemplateID, DocumentTypeID, AIModelID, OriginID] = ids as string[];
    return { VectorIndexID, TemplateID, DocumentTypeID, AIModelID, OriginID, OriginEntityID: originEntity.ID };
}

/** The content source (and its types) and the inactive entity document both chains hang off. */
async function buildScaffold(ctx: IntegrationCheckContext, fx: OriginGateFixture, seeds: BorrowedSeeds): Promise<ContentScaffold> {
    const name = (label: string): string => `${fx.Prefix}-${label} ${MARKER}`;
    const sourceType = await saveRow<MJContentSourceTypeEntity>(ctx, fx, 'MJ: Content Source Types', r => { r.Name = name('source-type'); });
    const fileType = await saveRow<MJContentFileTypeEntity>(ctx, fx, 'MJ: Content File Types', r => { r.Name = name('file-type'); });
    const contentType = await saveRow<MJContentTypeEntity>(ctx, fx, 'MJ: Content Types', r => {
        r.Name = name('content-type'); r.AIModelID = seeds.AIModelID; r.MinTags = 1; r.MaxTags = 5;
    });
    const source = await saveRow<MJContentSourceEntity>(ctx, fx, 'MJ: Content Sources', r => {
        r.Name = name('source'); r.ContentTypeID = contentType.ID; r.ContentSourceTypeID = sourceType.ID;
        r.ContentFileTypeID = fileType.ID; r.URL = 'https://example.com/it-search-origin-gate';
    });
    const document = await saveRow<MJEntityDocumentEntity>(ctx, fx, 'MJ: Entity Documents', r => {
        r.Name = name('entity-document'); r.TypeID = seeds.DocumentTypeID; r.EntityID = seeds.OriginEntityID;
        r.TemplateID = seeds.TemplateID; r.Status = 'Inactive';
    });
    return {
        SourceID: source.ID, ContentTypeID: contentType.ID, SourceTypeID: sourceType.ID, FileTypeID: fileType.ID,
        EntityDocumentID: document.ID, VectorIndexID: seeds.VectorIndexID, OriginEntityID: seeds.OriginEntityID
    };
}

/** Entity Record Document naming `originRecordID` → a root Content Item carrying it → one chunk. */
async function buildChain(
    ctx: IntegrationCheckContext,
    fx: OriginGateFixture,
    base: ContentScaffold,
    originRecordID: string,
    label: string
): Promise<ContentChain> {
    const document = await saveRow<MJEntityRecordDocumentEntity>(ctx, fx, DOCUMENTS, r => {
        r.EntityID = base.OriginEntityID; r.RecordID = originRecordID; r.EntityDocumentID = base.EntityDocumentID;
        r.VectorIndexID = base.VectorIndexID; r.EntityRecordUpdatedAt = new Date(); r.DocumentText = MARKER;
    });
    // 'Skipped' keeps the embedding and tagging pipelines away from the fixture rows.
    const item = await saveRow<MJContentItemEntity>(ctx, fx, ITEMS, r => {
        r.Name = `${fx.Prefix}-${label}`; r.Description = MARKER; r.Text = `origin-gate fixture (${label})`;
        r.URL = `https://example.com/it-search-origin-gate/${label}`; r.ContentSourceID = base.SourceID;
        r.ContentTypeID = base.ContentTypeID; r.ContentSourceTypeID = base.SourceTypeID; r.ContentFileTypeID = base.FileTypeID;
        r.EntityRecordDocumentID = document.ID; r.EmbeddingStatus = 'Skipped'; r.TaggingStatus = 'Skipped';
    });
    const chunk = await saveRow<MJContentItemChunkEntity>(ctx, fx, CHUNKS, r => {
        r.ContentItemID = item.ID; r.Sequence = 0; r.Text = MARKER; r.EmbeddingStatus = 'Skipped'; r.TaggingStatus = 'Skipped';
    });
    return { ChunkID: chunk.ID, ItemID: item.ID, DocumentID: document.ID };
}

/** Setup: publish the accumulator first (so Teardown sees partial work), then build both chains. */
async function createFixture(ctx: IntegrationCheckContext): Promise<void> {
    const fx: OriginGateFixture = { Prefix: `it-sog-${Date.now()}`, Created: [], Removed: false };
    fixture = fx;
    const unreadable = unreadableEntities(ctx.Provider, ctx.User);
    if (unreadable.length > 0) {
        fx.SkipReason = `the run user cannot read ${unreadable.join(', ')}, so it cannot be the user who is shown these hits`;
        return;
    }
    const seeds = await borrowSeeds(ctx);
    if (typeof seeds === 'string') {
        fx.SkipReason = seeds;
        return;
    }
    const base = await buildScaffold(ctx, fx, seeds);
    fx.Readable = await buildChain(ctx, fx, base, seeds.OriginID, 'readable-origin');
    fx.Missing = await buildChain(ctx, fx, base, MISSING_ORIGIN_ID, 'missing-origin');
}

/** Both chains, or undefined after a loud skip note. */
function usableChains(checkId: string): { Readable: ContentChain; Missing: ContentChain } | undefined {
    const fx = fixture;
    if (!fx?.Readable || !fx.Missing) {
        skipNote(checkId, fx?.SkipReason ?? 'the fixtures were not created');
        return undefined;
    }
    return { Readable: fx.Readable, Missing: fx.Missing };
}

/** How many of a chain's chunk and item rows `ctx.User` can read (0–2), straight from the views. */
async function visibleContentRows(ctx: IntegrationCheckContext, chain: ContentChain): Promise<number> {
    const byID = (EntityName: string, id: string): RunViewParams =>
        ({ EntityName, ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true });
    const results = await new RunView().RunViews<{ ID: string }>([byID(CHUNKS, chain.ChunkID), byID(ITEMS, chain.ItemID)], ctx.User);
    for (const r of results) {
        Assert(r.Success, `content row lookup failed: ${r.ErrorMessage ?? 'unknown error'}`);
    }
    return results.reduce((n, r) => n + r.Results.length, 0);
}

/**
 * The seeded role-less user, rebuilt from `MJ: Users` + `MJ: User Roles` (the ai-permissions pattern).
 * Undefined when the seed is absent, or when it holds a role: "dropped" would then say something about
 * that role's grants rather than about having none.
 */
async function loadSeededNoGrantUser(ctx: IntegrationCheckContext): Promise<UserInfo | undefined> {
    const rv = new RunView();
    const users = await rv.RunView<{ ID: string; Name: string; Email: string; Type: string; IsActive: boolean }>({
        EntityName: 'MJ: Users',
        ExtraFilter: `Email='${EscapeSQLString(SEEDED_NOGRANT_EMAIL)}'`,
        Fields: ['ID', 'Name', 'Email', 'Type', 'IsActive'],
        ResultType: 'simple'
    }, ctx.User);
    Assert(users.Success, `Users lookup failed: ${users.ErrorMessage ?? 'unknown error'}`);
    const row = users.Results[0];
    if (!row) {
        return undefined;
    }
    const roles = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: User Roles', ExtraFilter: `UserID='${EscapeSQLString(row.ID)}'`, Fields: ['ID'], ResultType: 'simple'
    }, ctx.User);
    Assert(roles.Success, `User Roles lookup failed: ${roles.ErrorMessage ?? 'unknown error'}`);
    return roles.Results.length === 0 ? new UserInfo(ctx.Provider, { ...row, UserRoles: [] }) : undefined;
}

/** Delete every not-yet-deleted fixture row, children first. Returns one message per failure. */
async function deleteFixtures(fx: OriginGateFixture): Promise<string[]> {
    const failures: string[] = [];
    for (const created of [...fx.Created].reverse()) {
        if (created.Deleted) {
            continue;
        }
        try {
            created.Deleted = await created.Row.Delete();
            if (!created.Deleted) {
                failures.push(`${created.EntityName} ${created.WhereClause}: ${created.Row.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
        } catch (e) {
            failures.push(`${created.EntityName} ${created.WhereClause}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    return failures;
}

/** Fixture rows still in the database, one message per entity that has any (or whose lookup failed). */
async function remainingFixtureRows(ctx: IntegrationCheckContext, fx: OriginGateFixture): Promise<string[]> {
    const byEntity = new Map<string, string[]>();
    for (const created of fx.Created) {
        byEntity.set(created.EntityName, [...(byEntity.get(created.EntityName) ?? []), `(${created.WhereClause})`]);
    }
    const names = Array.from(byEntity.keys());
    const params = names.map((EntityName): RunViewParams =>
        ({ EntityName, ExtraFilter: (byEntity.get(EntityName) ?? []).join(' OR '), ResultType: 'simple', BypassCache: true }));
    const results = await new RunView().RunViews<Record<string, unknown>>(params, ctx.User);
    return results.flatMap((r, i) => {
        if (!r.Success) {
            return [`${names[i]}: lookup failed (${r.ErrorMessage ?? 'unknown error'})`];
        }
        return r.Results.length > 0 ? [`${names[i]}: ${r.Results.length} row(s)`] : [];
    });
}

export const SearchOriginGateChecks: NamedCheck[] = [
    {
        Id: 'search-origin-gate.SOG1',
        Name: 'SOG1: a chunk hit and an item hit derived from a record the user may read are kept',
        Fn: async (ctx): Promise<void> => {
            const chains = usableChains('SOG1');
            if (!chains) { return; }
            const hits = chainHits(chains.Readable, 'readable');
            const kept = await OriginGateProbe.For(ctx.Provider).FilterByPermissions(hits, ctx.User);
            AssertEqual(hitIDs(kept), hitIDs(hits), 'both hits of the readable-origin chain survive both gates for the run user');
            console.log('      → chunk → item → document → agent resolved through the real views; both hits kept');
        }
    },
    {
        Id: 'search-origin-gate.SOG2',
        Name: 'SOG2: the origin gate drops hits whose Entity Record Document names a record that does not exist, and only those',
        Fn: async (ctx): Promise<void> => {
            const chains = usableChains('SOG2');
            if (!chains) { return; }
            // Anti-vacuity: the missing-origin chunk and item are real rows the run user can read, so the
            // entity-level check admits them — the origin is the only thing left to drop them.
            AssertEqual(await visibleContentRows(ctx, chains.Missing), 2,
                'precondition: the missing-origin chain\'s chunk and item are readable rows of their own entities');
            const readable = chainHits(chains.Readable, 'readable');
            const missing = chainHits(chains.Missing, 'missing');
            const kept = await OriginGateProbe.For(ctx.Provider).FilterByPermissions([...missing, ...readable], ctx.User);
            AssertEqual(hitIDs(kept), hitIDs(readable), 'only the readable-origin hits survive; the missing-origin hits are dropped');
            console.log('      → an unresolvable origin drops its chunk and item hits; the readable chain in the same call is kept');
        }
    },
    {
        Id: 'search-origin-gate.SOG3',
        Name: `SOG3: the role-less user (${SEEDED_NOGRANT_EMAIL}) is shown none of the hits, through either gate`,
        Fn: async (ctx): Promise<void> => {
            const chains = usableChains('SOG3');
            if (!chains) { return; }
            const noGrant = await loadSeededNoGrantUser(ctx);
            if (!noGrant) {
                skipNote('SOG3', `seeded user '${SEEDED_NOGRANT_EMAIL}' not found or holds a role — seed with: ${SEED_FIXTURES_COMMAND}`);
                return;
            }
            AssertEqual(unreadableEntities(ctx.Provider, noGrant).length, GATE_ENTITIES.length,
                `fixture invalid: the role-less user can read one of ${GATE_ENTITIES.join(', ')}`);
            const probe = OriginGateProbe.For(ctx.Provider);
            const hits = [...chainHits(chains.Readable, 'readable'), ...chainHits(chains.Missing, 'missing')];
            // Through both gates: the entity-level check stops this user before the origin gate runs.
            AssertEqual((await probe.FilterByPermissions(hits, noGrant)).length, 0, 'the role-less user is shown no content hit');
            // The origin gate on its own: every lookup runs as the user, so it fails closed for this one too.
            const viaGate = [
                ...await probe.VerifyOrigins(CHUNKS, hits.filter(h => h.EntityName === CHUNKS), noGrant),
                ...await probe.VerifyOrigins(ITEMS, hits.filter(h => h.EntityName === ITEMS), noGrant)
            ];
            AssertEqual(viaGate.length, 0, 'called directly, the origin gate keeps nothing for a user who cannot read the chain');
            console.log('      → role-less user: 0 hits through both gates, 0 through the origin gate alone');
        }
    },
    {
        Id: 'search-origin-gate.SOG4',
        Name: 'SOG4: every fixture row is deleted and gone',
        Fn: async (ctx): Promise<void> => {
            const fx = fixture;
            if (!fx || fx.Created.length === 0) {
                skipNote('SOG4', fx?.SkipReason ?? 'no fixture rows were created');
                return;
            }
            const failures = await deleteFixtures(fx);
            AssertEqual(failures.join('; '), '', 'every fixture row deletes');
            const remaining = await remainingFixtureRows(ctx, fx);
            AssertEqual(remaining.join('; '), '', 'no fixture row is left in the database');
            fx.Removed = true;
            console.log(`      → ${fx.Created.length} fixture row(s) deleted and confirmed gone`);
        }
    }
];

for (const check of SearchOriginGateChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// Setup creates the fixtures (publishing the accumulator first); Teardown deletes whatever SOG4 did not.
IntegrationCheckRegistry.Instance.RegisterLifecycle('search-origin-gate', {
    Setup: async (ctx: IntegrationCheckContext) => {
        await createFixture(ctx);
    },
    Teardown: async () => {
        const fx = fixture;
        if (fx && !fx.Removed) {
            for (const failure of await deleteFixtures(fx)) {
                console.error(`search-origin-gate teardown: ${failure}`);
            }
        }
        fixture = undefined;
    }
});
