/**
 * IntegrationDocEnhancer — Pluggable interface for enhancing integration schema metadata.
 *
 * This interface defines the contract between the integration engine and an optional
 * documentation enhancer (e.g., DBAutoDoc) that can discover missing PKs, FKs, and
 * descriptions for integration tables.
 *
 * The integration engine does NOT depend on any specific enhancer implementation.
 * It only knows this interface. The actual implementation lives in the enhancer package
 * (e.g., DBAutoDoc) and is loaded dynamically when enabled.
 *
 * Activation: Set environment variable DBAUTODOC_INTEGRATION_ENABLED=true
 * If not set, the integration pipeline works exactly as before with zero behavioral change.
 */

// ─── Input Types ──────────────────────────────────────────────────────────

/** Known constraint from connector overlay or API discovery */
export interface KnownPrimaryKey {
    /** Table name in the integration schema */
    Table: string;
    /** Column(s) forming the primary key */
    Columns: string[];
    /** Where this PK info came from */
    Source: 'api' | 'overlay' | 'database';
}

/** Known FK relationship from connector overlay or API discovery */
export interface KnownForeignKey {
    /** Source table containing the FK column */
    Table: string;
    /** Column in the source table */
    Column: string;
    /** Target table being referenced */
    TargetTable: string;
    /** Column in the target table (usually PK) */
    TargetColumn: string;
    /** Where this FK info came from */
    Source: 'api' | 'overlay' | 'database';
}

/** Context passed to the enhancer — everything the connector already knows */
export interface EnhancerContext {
    /** Integration name (e.g., "HubSpot", "Mailchimp") */
    IntegrationName: string;
    /** SQL schema name for this integration's tables (e.g., "hubspot", "mailchimp") */
    SchemaName: string;
    /** List of all integration object names (table names) */
    ObjectNames: string[];
    /** PKs already known from the connector overlay or API */
    KnownPrimaryKeys: KnownPrimaryKey[];
    /** FKs already known from the connector overlay or API */
    KnownForeignKeys: KnownForeignKey[];
    /** Existing descriptions (key = "table" or "table.column") */
    KnownDescriptions: Record<string, string>;
}

// ─── Output Types ─────────────────────────────────────────────────────────

/** A discovered primary key with confidence score */
export interface DiscoveredPrimaryKey {
    Table: string;
    Columns: string[];
    /** 0-100 confidence score from the discovery engine */
    Confidence: number;
}

/** A discovered foreign key with confidence score */
export interface DiscoveredForeignKey {
    Table: string;
    Column: string;
    TargetTable: string;
    TargetColumn: string;
    /** 0-100 confidence score from the discovery engine */
    Confidence: number;
}

/** Results from the enhancer — only NEW discoveries, not re-confirmations of existing */
export interface EnhancementResult {
    /** Newly discovered PKs (not already in KnownPrimaryKeys) */
    DiscoveredPrimaryKeys: DiscoveredPrimaryKey[];
    /** Newly discovered FKs (not already in KnownForeignKeys) */
    DiscoveredForeignKeys: DiscoveredForeignKey[];
    /** Newly discovered descriptions (key = "table" or "table.column") — only for previously empty */
    DiscoveredDescriptions: Record<string, string>;
    /** Summary statistics */
    Summary: {
        TablesAnalyzed: number;
        TablesSkipped: number;
        PKsDiscovered: number;
        FKsDiscovered: number;
        DescriptionsGenerated: number;
    };
}

// ─── Plugin Interface ─────────────────────────────────────────────────────

/**
 * Interface that documentation enhancers must implement.
 *
 * The integration engine calls this after SchemaBuilder creates/updates tables,
 * but ONLY when DBAUTODOC_INTEGRATION_ENABLED=true.
 *
 * Implementations should:
 * 1. Accept known constraints as ground truth (don't re-discover them)
 * 2. Only analyze tables/columns with missing metadata
 * 3. Return ONLY new discoveries (not confirmations of existing)
 * 4. Never modify the database directly — return results for the caller to apply
 */
export interface IntegrationDocEnhancer {
    /**
     * Enhance schema metadata for an integration's tables.
     * Called after sync or schema build when the env var is enabled.
     *
     * @param context - Everything the connector already knows (PKs, FKs, descriptions)
     * @returns New discoveries to merge into the integration metadata
     */
    EnhanceSchema(context: EnhancerContext): Promise<EnhancementResult>;

    /**
     * Quick check: does this integration have any gaps worth analyzing?
     * Used to skip the (potentially expensive) EnhanceSchema call when everything is already documented.
     *
     * @param context - Same context as EnhanceSchema
     * @returns true if there are gaps to fill, false if fully documented
     */
    HasGaps(context: EnhancerContext): boolean;
}

// ─── Loader ───────────────────────────────────────────────────────────────

/**
 * Dynamically loads the doc enhancer if enabled via environment variable.
 * Returns null if not enabled or if the enhancer package is not available.
 *
 * The integration engine calls this — it never directly imports the enhancer package.
 */
export async function LoadDocEnhancer(): Promise<IntegrationDocEnhancer | null> {
    if (process.env.DBAUTODOC_INTEGRATION_ENABLED !== 'true') {
        return null;
    }

    try {
        // Dynamic import — the enhancer package is optional.
        // Use string variable to prevent TypeScript from resolving the module at compile time.
        const packageName = '@memberjunction/dbautodoc-integration-enhancer';
        const module = await (Function('specifier', 'return import(specifier)')(packageName)) as {
            CreateEnhancer?: () => IntegrationDocEnhancer;
        };
        if (module.CreateEnhancer) {
            return module.CreateEnhancer();
        }
        console.warn('[IntegrationDocEnhancer] Package found but CreateEnhancer() not exported');
        return null;
    } catch {
        // Package not installed — that's fine, it's optional
        return null;
    }
}
