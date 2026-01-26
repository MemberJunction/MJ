/**
 * API Key Authorization Interfaces
 * @module @memberjunction/api-keys
 */

// =========================================================================
// API KEY GENERATION AND MANAGEMENT INTERFACES
// =========================================================================

/**
 * Result of generating a new API key
 */
export interface GeneratedAPIKey {
    /** The raw API key (show to user once, never store) */
    Raw: string;
    /** SHA-256 hash of the key (store in database) */
    Hash: string;
}

/**
 * Parameters for creating a new API key
 */
export interface CreateAPIKeyParams {
    /** User ID the key belongs to */
    UserId: string;
    /** Label for identifying the key */
    Label: string;
    /** Optional description */
    Description?: string;
    /** Optional expiration date */
    ExpiresAt?: Date;
}

/**
 * Result of creating a new API key
 */
export interface CreateAPIKeyResult {
    /** Whether creation succeeded */
    Success: boolean;
    /** The raw API key (only returned on success, show to user once) */
    RawKey?: string;
    /** The database ID of the created API key */
    APIKeyId?: string;
    /** Error message if creation failed */
    Error?: string;
}

/**
 * Options for validating an API key
 */
export interface APIKeyValidationOptions {
    /** The raw API key to validate */
    RawKey: string;
    /** Optional endpoint for logging */
    Endpoint?: string;
    /** Optional HTTP method for logging */
    Method?: string;
    /** Optional operation name for logging */
    Operation?: string;
    /** Optional status code for logging */
    StatusCode?: number;
    /** Optional response time in ms for logging */
    ResponseTimeMs?: number;
    /** Optional client IP address for logging */
    IPAddress?: string;
    /** Optional client user agent for logging */
    UserAgent?: string;
}

/**
 * Result of validating an API key
 */
export interface APIKeyValidationResult {
    /** Whether the key is valid */
    IsValid: boolean;
    /** The user context if valid */
    User?: import('@memberjunction/core').UserInfo;
    /** The API key ID if valid */
    APIKeyId?: string;
    /** Error message if invalid */
    Error?: string;
}

// =========================================================================
// AUTHORIZATION INTERFACES
// =========================================================================

/**
 * Request for authorization evaluation
 */
export interface AuthorizationRequest {
    /** The API key ID (from validated key) */
    APIKeyId: string;
    /** The user ID associated with the API key */
    UserId: string;
    /** The application ID making the request */
    ApplicationId: string;
    /** The scope path being requested (e.g., 'view:run', 'agent:execute') */
    ScopePath: string;
    /** The specific resource being accessed (e.g., entity name, agent name) */
    Resource: string;
    /** Optional additional context */
    Context?: Record<string, unknown>;
}

/**
 * Result of authorization evaluation
 */
export interface AuthorizationResult {
    /** Whether access is allowed */
    Allowed: boolean;
    /** Human-readable reason for the decision */
    Reason: string;
    /** The app-level rule that matched (if any) */
    MatchedAppRule?: ScopeRuleMatch;
    /** The key-level rule that matched (if any) */
    MatchedKeyRule?: ScopeRuleMatch;
    /** All rules evaluated during the check */
    EvaluatedRules: EvaluatedRule[];
}

/**
 * A matched scope rule
 */
export interface ScopeRuleMatch {
    /** Rule ID */
    Id: string;
    /** Scope ID */
    ScopeId: string;
    /** Scope full path */
    ScopePath: string;
    /** Resource pattern that matched */
    Pattern: string | null;
    /** Pattern type */
    PatternType: 'Include' | 'Exclude';
    /** Whether this is a deny rule */
    IsDeny: boolean;
    /** Rule priority */
    Priority: number;
}

/**
 * Details of a rule evaluation
 */
export interface EvaluatedRule {
    /** Which level this rule came from */
    Level: 'application' | 'key';
    /** The rule that was evaluated */
    Rule: ScopeRuleMatch;
    /** Whether the pattern matched the resource */
    Matched: boolean;
    /** The specific pattern that matched (from comma-separated list) */
    PatternMatched: string | null;
    /** Result of this rule evaluation */
    Result: 'Allowed' | 'Denied' | 'NoMatch';
}

/**
 * Scope rule from database (app or key level)
 */
export interface ScopeRule {
    /** Rule ID */
    ID: string;
    /** Scope ID */
    ScopeID: string;
    /** Scope full path */
    FullPath: string;
    /** Resource pattern (glob) */
    ResourcePattern: string | null;
    /** Pattern type */
    PatternType: 'Include' | 'Exclude';
    /** Is this a deny rule */
    IsDeny: boolean;
    /** Priority (higher = evaluated first) */
    Priority: number;
}

/**
 * Application scope ceiling rule
 */
export interface ApplicationScopeRule extends ScopeRule {
    /** Application ID */
    ApplicationID: string;
}

/**
 * API key scope rule
 */
export interface KeyScopeRule extends ScopeRule {
    /** API Key ID */
    APIKeyID: string;
}

// =========================================================================
// USAGE LOGGING INTERFACES
// =========================================================================

/**
 * Usage log entry for audit trail
 */
export interface UsageLogEntry {
    /** API Key ID */
    APIKeyId: string;
    /** Application ID */
    ApplicationId: string | null;
    /** Endpoint accessed */
    Endpoint: string;
    /** Operation performed */
    Operation: string | null;
    /** HTTP method */
    Method: string;
    /** HTTP status code */
    StatusCode: number;
    /** Response time in ms */
    ResponseTimeMs: number | null;
    /** Client IP address */
    IPAddress: string | null;
    /** Client user agent */
    UserAgent: string | null;
    /** Resource that was requested */
    RequestedResource: string | null;
    /** Scopes that were evaluated */
    ScopesEvaluated: EvaluatedRule[];
    /** Authorization result */
    AuthorizationResult: 'Allowed' | 'Denied' | 'NoScopesRequired';
    /** Reason for denial (if denied) */
    DeniedReason: string | null;
}

// =========================================================================
// CONFIGURATION INTERFACES
// =========================================================================

/**
 * Configuration for the API Key Engine
 */
export interface APIKeyEngineConfig {
    /** Whether scope enforcement is enabled (default: true) */
    enforcementEnabled?: boolean;
    /** Whether to log all requests (default: true) */
    loggingEnabled?: boolean;
    /** Default behavior when key has no scopes (default: 'allow') */
    defaultBehaviorNoScopes?: 'allow' | 'deny';
    /** Cache TTL in milliseconds for scope rules (default: 60000) */
    scopeCacheTTLMs?: number;
}
