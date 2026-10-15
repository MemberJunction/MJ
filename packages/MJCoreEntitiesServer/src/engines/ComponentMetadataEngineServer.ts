import { BaseSingleton } from '@memberjunction/global';
import { IMetadataProvider, RunView, UserInfo } from '@memberjunction/core';
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
 * Follows the same pattern as AIEngine containing AIEngineBase and
 * QueryEngineServer containing QueryEngine.
 *
 * @description ONLY USE ON SERVER-SIDE. For metadata only, use the ComponentMetadataEngine class which can be used anywhere.
 */
export class ComponentMetadataEngineServer extends BaseSingleton<ComponentMetadataEngineServer> {
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

    /**
     * Initializes the engine. Configures the base ComponentMetadataEngine and
     * bulk-loads the Components array for server-side use.
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        // Configure the base engine (libraries, registries, dependencies, etc.)
        await this.Base.Config(forceRefresh, contextUser, provider);

        // Load the full Components array (server-only — too large for browser)
        if (!this._componentsLoaded || forceRefresh) {
            const rv = new RunView();
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
