/**
 * Configuration interfaces for VectorDatabase and VectorIndex provider settings.
 *
 * These are stored as JSON in the Configuration / ProviderConfig columns and
 * parsed at runtime. All fields are optional — NULL or missing means "use
 * provider/environment defaults."
 */

/* ------------------------------------------------------------------ */
/*  VectorDatabase Configuration                                       */
/* ------------------------------------------------------------------ */

/**
 * Provider-level configuration for a VectorDatabase record.
 * Stored in VectorDatabase.Configuration as JSON.
 *
 * Controls connection behavior, resilience, and throughput limits that
 * apply to every index managed by this database provider instance.
 */
export interface VectorDatabaseConfiguration {
    /** Connection settings — host overrides, timeouts, proxy */
    connection?: VectorDatabaseConnectionConfig;

    /** Retry / resilience behavior for transient failures */
    resilience?: VectorDatabaseResilienceConfig;

    /** Throughput caps that the provider should respect */
    throughput?: VectorDatabaseThroughputConfig;
}

export interface VectorDatabaseConnectionConfig {
    /**
     * Custom API host/endpoint URL. Overrides the default derived from
     * environment variables (e.g. PINECONE_HOST).
     * Useful for private endpoints, proxies, or region overrides.
     */
    hostUrl?: string;

    /**
     * Request timeout in milliseconds for individual API calls.
     * Default varies by provider (typically 30 000 ms).
     */
    requestTimeoutMs?: number;

    /**
     * Connection timeout in milliseconds — how long to wait for a
     * TCP connection to be established.
     */
    connectTimeoutMs?: number;

    /**
     * HTTP/SOCKS proxy URL (e.g. "http://proxy.corp:8080").
     * Only applies to providers that support proxy configuration.
     */
    proxyUrl?: string;
}

export interface VectorDatabaseResilienceConfig {
    /**
     * Maximum number of retries on transient failures (429, 5xx).
     * Set to 0 to disable retries. Default: 3.
     */
    maxRetries?: number;

    /**
     * Base delay in ms for exponential backoff between retries.
     * Actual delay = baseDelayMs * 2^(attempt). Default: 500.
     */
    retryBaseDelayMs?: number;

    /**
     * Maximum delay in ms between retries (caps the exponential
     * backoff). Default: 30 000.
     */
    retryMaxDelayMs?: number;
}

export interface VectorDatabaseThroughputConfig {
    /**
     * Maximum number of vectors in a single upsert batch.
     * Pinecone recommends ≤100; other providers may differ.
     */
    maxUpsertBatchSize?: number;

    /**
     * Maximum number of concurrent API requests to the provider.
     * Helps avoid rate-limit errors on shared-tier plans.
     */
    maxConcurrentRequests?: number;

    /**
     * Hard ceiling on requests per second. The client will
     * throttle to stay under this limit. 0 = unlimited.
     */
    maxRequestsPerSecond?: number;
}

/* ------------------------------------------------------------------ */
/*  VectorIndex ProviderConfig                                         */
/* ------------------------------------------------------------------ */

/**
 * Index-level provider configuration stored in VectorIndex.ProviderConfig
 * as JSON. Currently populated by the server entity hook when an index
 * is auto-provisioned, and may also be edited manually.
 *
 * Contains both read-back fields (ExternalID, Dimensions, Metric set by
 * the hook) and tunable settings.
 */
export interface VectorIndexProviderConfig {
    /**
     * The provider-assigned identifier for this index (e.g. Pinecone
     * index host URL or Weaviate class name). Written by the server
     * hook after provisioning.
     */
    ExternalID?: string;

    /**
     * Dimensionality of vectors stored in this index.
     * Written by the server hook from the embedding model.
     */
    Dimensions?: number;

    /**
     * Distance metric used for similarity search.
     * Written by the server hook from VectorIndex.DistanceMetric.
     */
    Metric?: string;

    /** Provisioning and capacity settings (provider-specific) */
    provisioning?: VectorIndexProvisioningConfig;

    /** Default query parameters applied when not overridden per-call */
    queryDefaults?: VectorIndexQueryDefaults;

    /** Namespace mapping strategy for multi-tenant or multi-entity indexes */
    namespaceStrategy?: VectorIndexNamespaceStrategy;

    /** Per-record metadata constraints */
    metadataLimits?: VectorIndexMetadataLimits;
}

export interface VectorIndexProvisioningConfig {
    /**
     * Deployment type. Pinecone supports "serverless" and "pod".
     * Other providers may use different terminology.
     */
    deploymentType?: 'serverless' | 'pod' | string;

    /** Cloud provider for serverless indexes (e.g. "aws", "gcp", "azure") */
    cloud?: string;

    /** Cloud region (e.g. "us-east-1", "us-west-2") */
    region?: string;

    /**
     * Pod type (e.g. "p1.x1", "s1.x2"). Only relevant for pod-based
     * deployments.
     */
    podType?: string;

    /** Number of replicas for high-availability. Pod-based only. */
    replicas?: number;

    /** Number of shards for horizontal scaling. Pod-based only. */
    shards?: number;
}

export interface VectorIndexQueryDefaults {
    /**
     * Default number of results to return. Overridden by explicit
     * topK in individual queries.
     */
    topK?: number;

    /** Whether to include metadata in query results by default */
    includeMetadata?: boolean;

    /** Whether to include vector values in query results by default */
    includeValues?: boolean;
}

export interface VectorIndexNamespaceStrategy {
    /**
     * How namespaces are assigned:
     * - "none": single flat namespace (default)
     * - "per-entity": one namespace per entity name
     * - "per-tenant": one namespace per organization/tenant ID
     * - "custom": driven by a custom function or template
     */
    mode?: 'none' | 'per-entity' | 'per-tenant' | 'custom';

    /**
     * Template string for custom namespace names.
     * Supports {{EntityName}}, {{TenantID}}, {{EntityDocumentID}}.
     * Only used when mode = "custom".
     */
    template?: string;
}

export interface VectorIndexMetadataLimits {
    /**
     * Maximum total metadata size in bytes per record.
     * Pinecone free tier: 40 KB. Paid: 40 KB default.
     * Records exceeding this will have large fields truncated.
     */
    maxMetadataBytesPerRecord?: number;

    /**
     * Maximum number of metadata fields per record.
     * Some providers cap this (e.g. Pinecone: no hard cap but
     * performance degrades past ~40 fields).
     */
    maxMetadataFields?: number;
}
