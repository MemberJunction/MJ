/**
 * MemberJunction API Keys Authorization Package
 *
 * This package provides the complete API Key management and authorization system:
 * - API key generation, creation, validation, and revocation
 * - Hierarchical scopes with pattern-based access control
 * - Application-level scope ceilings
 * - Usage logging and audit trails
 *
 * **Note**: This package requires Node.js and the crypto module. It is intended
 * for server-side use only.
 *
 * @module @memberjunction/api-keys
 */

// Main engine and singleton
export {
    APIKeyEngine,
    GetAPIKeyEngine,
    ResetAPIKeyEngine,
    KeyHashValidationResult
} from './APIKeyEngine';

// Scope evaluation
export { ScopeEvaluator } from './ScopeEvaluator';

// Pattern matching
export { PatternMatcher, PatternMatchResult } from './PatternMatcher';

// Usage logging
export { UsageLogger } from './UsageLogger';

// Interfaces - API Key Management
export {
    GeneratedAPIKey,
    CreateAPIKeyParams,
    CreateAPIKeyResult,
    APIKeyValidationOptions,
    APIKeyValidationResult
} from './interfaces';

// Interfaces - Authorization
export {
    AuthorizationRequest,
    AuthorizationResult,
    ScopeRuleMatch,
    EvaluatedRule,
    ScopeRule,
    ApplicationScopeRule,
    KeyScopeRule
} from './interfaces';

// Interfaces - Logging and Configuration
export {
    UsageLogEntry,
    APIKeyEngineConfig
} from './interfaces';
