import { BaseSingleton, MJEventType, MJGlobal } from '@memberjunction/global';
import { BaseEntity, BaseEntityEvent, IMetadataProvider, IStartupSink, RegisterForStartup, RunView, UserInfo } from '@memberjunction/core';
import { AIEngine, EmbeddingBackfill, EmbeddingVectorSlot } from '@memberjunction/aiengine';
import {
    ComponentMetadataEngine,
    MJComponentEntityExtended,
    MJComponentLibraryEntity,
    MJComponentLibraryLinkEntity,
    MJComponentRegistryEntity,
    MJComponentDependencyEntity
} from '@memberjunction/core-entities';

/**
 * Server-side Component Metadata Engine that wraps ComponentMetadataEngine and adds
 * the bulk-loaded Components array for server-only use cases like vector search,
 * embedding generation, and full-catalog operations.
 *
 * Uses composition (containment) rather than inheritance to avoid duplicate data
 * loading. Delegates all base functionality to ComponentMetadataEngine.Instance
 * while adding the `Components` property that bulk-loads all component records.
 *
 * The base ComponentMetadataEngine intentionally does NOT load `MJ: Components`
 * because the entity contains ~150+ MB of nvarchar(MAX) data (Specification,
 * vectors, prose fields) that would poison the browser-side cache and cause
 * 20+ second cold loads. This server class makes that data available where it's
 * needed (e.g., Skip-Brain's SkipComponentEngine) without impacting client-side
 * performance.
 *
 * At server startup ({@link HandleStartup}) it gives a vector to every component saved without one — that work
 * reads only the components lacking a vector, never the bulk list (see {@link EmbedMissingComponentVectors}).
 *
 * Follows the same pattern as AIEngine containing AIEngineBase and
 * QueryEngineServer containing QueryEngine.
 *
 * @description ONLY USE ON SERVER-SIDE. For metadata only, use the ComponentMetadataEngine class which can be used anywhere.
 */
@RegisterForStartup({
    deferred: true,
    deferredDelay: 15000,
    description: 'Server-side Component Metadata Engine: embeds components saved without vectors'
})
export class ComponentMetadataEngineServer extends BaseSingleton<ComponentMetadataEngineServer> implements IStartupSink {
    protected constructor() {
        super();
    }

    public static get Instance(): ComponentMetadataEngineServer {
        return super.getInstance<ComponentMetadataEngineServer>();
    }

    // --- Containment ---
    protected get Base(): ComponentMetadataEngine {
        return ComponentMetadataEngine.Instance;
    }

    private _components: MJComponentEntityExtended[] = [];
    private _componentsLoaded = false;
    private _startupUser: UserInfo | undefined;
    private _startupProvider: IMetadataProvider | undefined;
    private _saveListenerSetUp = false;

    /** The two vectors of a component, each computed from one text field, through the typed properties. */
    private static readonly vectorSlots: ReadonlyArray<EmbeddingVectorSlot<MJComponentEntityExtended>> = [
        {
            Text: c => c.FunctionalRequirements,
            Read: c => ({ Json: c.FunctionalRequirementsVector, Binary: c.FunctionalRequirementsVectorBinary, ModelID: c.FunctionalRequirementsVectorEmbeddingModelID }),
            Write: (c, v) => {
                c.FunctionalRequirementsVector = v.Json;
                c.FunctionalRequirementsVectorBinary = v.Binary;
                c.FunctionalRequirementsVectorEmbeddingModelID = v.ModelID;
            },
        },
        {
            Text: c => c.TechnicalDesign,
            Read: c => ({ Json: c.TechnicalDesignVector, Binary: c.TechnicalDesignVectorBinary, ModelID: c.TechnicalDesignVectorEmbeddingModelID }),
            Write: (c, v) => {
                c.TechnicalDesignVector = v.Json;
                c.TechnicalDesignVectorBinary = v.Binary;
                c.TechnicalDesignVectorEmbeddingModelID = v.ModelID;
            },
        },
    ];

    /**
     * The components with a non-empty text whose vector is missing (neither stored form). `<> ''` also excludes
     * all-blank text on SQL Server, which compares strings with trailing blanks ignored.
     */
    private static readonly missingVectorFilter =
        "(FunctionalRequirements IS NOT NULL AND FunctionalRequirements <> '' AND FunctionalRequirementsVector IS NULL AND FunctionalRequirementsVectorBinary IS NULL)"
        + " OR (TechnicalDesign IS NOT NULL AND TechnicalDesign <> '' AND TechnicalDesignVector IS NULL AND TechnicalDesignVectorBinary IS NULL)";

    /** Gives a vector to the components saved without one (see {@link EmbedMissingComponentVectors}). */
    private _backfill = new EmbeddingBackfill<MJComponentEntityExtended>({
        Name: 'ComponentMetadataEngineServer',
        Slots: ComponentMetadataEngineServer.vectorSlots,
        LoadCandidates: limit => this.LoadComponentsWithoutVectors(limit),
        EmbedText: (text, component) => AIEngine.EmbedTextLocalForEntity(component, text),
    });

    /**
     * Initializes the engine. Configures the base ComponentMetadataEngine and
     * bulk-loads the Components array for server-side use, through the passed provider (else the base engine's).
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        // Configure the base engine (libraries, registries, dependencies, etc.)
        await this.Base.Config(forceRefresh, contextUser, provider);

        // Load the full Components array (server-only — too large for browser)
        if (!this._componentsLoaded || forceRefresh) {
            const rv = RunView.FromMetadataProvider(provider || this.Base.ProviderToUse);
            const result = await rv.RunView<MJComponentEntityExtended>({
                EntityName: 'MJ: Components',
                ExtraFilter: '',
                ResultType: 'entity_object'
            }, contextUser);

            if (result.Success) {
                this._components = result.Results;
                this._componentsLoaded = true;
            }
        }
    }

    /**
     * Server startup (`@RegisterForStartup`, deferred like AIEngine, full startup mode only — a CLI in task mode never
     * runs it, so `mj sync push` never loads the embedding model). Starts {@link EmbedMissingComponentVectors} without
     * waiting for it, and from then on runs it after every component save in this process that leaves a vector
     * missing. Does not bulk-load the component list: that stays the job of {@link Config}.
     */
    public async HandleStartup(contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        this._startupUser = contextUser;
        this._startupProvider = provider;
        this.listenForComponentSaves();
        this._backfill.Trigger();
    }

    /**
     * Embeds, with the local embedding model, every component vector whose source text is not empty but whose
     * vector is missing (both the JSON and the binary column empty), and saves the component. These are the
     * components saved with `SkipEmbeddings` — `mj sync push` sets it so a short-lived CLI never loads the model; the
     * component's save then clears a now-stale vector instead of computing it.
     *
     * The work is done by the shared {@link EmbeddingBackfill}: each pass reads at most
     * `EmbeddingBackfillSettings.BatchSize` (+1) components lacking a vector from the database, embeds and saves
     * them, and the rest continue in later passes; a component whose embedding or save fails is retried; nothing is
     * computed while the host has switched save-time embeddings off. Started by {@link HandleStartup}; call this to
     * run it and wait for it.
     * @returns how many components were saved with new vectors
     */
    public async EmbedMissingComponentVectors(): Promise<number> {
        return this._backfill.Run();
    }

    /**
     * Reads at most `limit` components that lack a vector ({@link missingVectorFilter}), as entity objects — the
     * backfill saves them, which needs the whole record. Uses the provider startup was given, else the base engine's.
     * @throws Error when the read fails
     */
    protected async LoadComponentsWithoutVectors(limit: number): Promise<MJComponentEntityExtended[]> {
        const provider = this._startupProvider || this.Base.ProviderToUse;
        const result = await RunView.FromMetadataProvider(provider).RunView<MJComponentEntityExtended>({
            EntityName: 'MJ: Components',
            ExtraFilter: ComponentMetadataEngineServer.missingVectorFilter,
            MaxRows: limit,
            ResultType: 'entity_object'
        }, this._startupUser);
        if (!result.Success) {
            throw new Error(`could not read the components without a vector: ${result.ErrorMessage || 'unknown error'}`);
        }
        return result.Results;
    }

    /**
     * Subscribes (once) to MJGlobal BaseEntity save events: when a component saved in this process still lacks a
     * vector, the backfill runs, so a component saved without vectors after startup gets them. The base
     * ComponentMetadataEngine does not load components, so it has no DataChange$ for them.
     */
    private listenForComponentSaves(): void {
        if (this._saveListenerSetUp) return;
        this._saveListenerSetUp = true;
        MJGlobal.Instance.GetEventListener(false).subscribe((event) => {
            if (event.event !== MJEventType.ComponentEvent || event.eventCode !== BaseEntity.BaseEventCode) return;
            const e = event.args as BaseEntityEvent;
            if (e?.type !== 'save' || e.baseEntity?.EntityInfo?.Name !== 'MJ: Components' || !(e.baseEntity instanceof MJComponentEntityExtended)) return;
            if (this._backfill.NeedsAnyVector(e.baseEntity)) {
                this._backfill.Trigger();
            }
        });
    }

    // --- Delegated base properties ---

    public get ComponentLibraries(): MJComponentLibraryEntity[] {
        return this.Base.ComponentLibraries;
    }

    public get ComponentLibraryLinks(): MJComponentLibraryLinkEntity[] {
        return this.Base.ComponentLibraryLinks;
    }

    public get ComponentRegistries(): MJComponentRegistryEntity[] {
        return this.Base.ComponentRegistries;
    }

    public get ComponentDependencies(): MJComponentDependencyEntity[] {
        return this.Base.ComponentDependencies;
    }

    // --- Server-only: bulk-loaded Components array ---

    /**
     * All component records bulk-loaded from the database, including heavy columns
     * (Specification, vectors, prose fields). Only available server-side.
     */
    public get Components(): MJComponentEntityExtended[] {
        return this._components;
    }

    // --- Delegated lookup methods ---

    /**
     * Finds a component by its primary key ID using the in-memory Components array.
     */
    public FindComponentByID(id: string): MJComponentEntityExtended | undefined {
        return this._components.find(c => c.ID.toLowerCase() === id.toLowerCase());
    }

    /**
     * Finds a component by name (case-insensitive), optionally filtered by namespace and registry.
     * Uses the in-memory Components array for instant lookups.
     */
    public FindComponent(name: string, namespace?: string, registry?: string): MJComponentEntityExtended | undefined {
        return this._components.find(c =>
            c.Name.trim().toLowerCase() === name.trim().toLowerCase() &&
            (!namespace || c.Namespace?.trim().toLowerCase() === namespace.trim().toLowerCase()) &&
            (!registry || c.SourceRegistry?.trim().toLowerCase() === registry.trim().toLowerCase())
        );
    }
}
