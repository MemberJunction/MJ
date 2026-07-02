/**
 * @memberjunction/context-crush — dependency-light token-optimization primitives.
 *
 * Several primitives are independent TypeScript re-implementations of concepts from
 * Headroom (https://github.com/chopratejas/headroom, Apache-2.0). See NOTICE and
 * plans/agent-token-optimization.md §0 for attribution.
 *
 * Note: AST-aware code reduction (CrushCode) is published under the `./code` subpath
 * (@memberjunction/context-crush/code) to keep this base entry point parser-free.
 */
export * from './crush-json';
export * from './partition-stable-prefix';
