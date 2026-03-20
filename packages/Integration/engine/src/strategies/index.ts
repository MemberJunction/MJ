/**
 * Strategy interfaces for the MemberJunction integration connector system.
 *
 * Each strategy defines a pluggable concern (auth, pagination, transforms, etc.)
 * that connectors compose to declare their behavior. The engine orchestrates
 * these strategies during sync, keeping connectors thin and focused.
 */

// Strategy interfaces
export * from './TransformStrategy.js';
export * from './PaginationStrategy.js';
export * from './BatchingStrategy.js';
export * from './AuthStrategy.js';
export * from './RateLimitStrategy.js';
export * from './WritebackStrategy.js';
export * from './EndpointTraversalStrategy.js';
export * from './IncrementalSyncStrategy.js';
export * from './LoggingPolicy.js';

// Built-in implementations
export * from './builtin/index.js';
