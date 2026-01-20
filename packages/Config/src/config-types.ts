/**
 * Configuration type definitions for MemberJunction.
 *
 * Note: This file provides type re-exports for convenience.
 * The actual type definitions and defaults live in their respective packages:
 * - @memberjunction/server (MJServerConfig)
 * - @memberjunction/codegen-lib (CodeGenConfig)
 * - @memberjunction/mcp-server (MCPServerConfig)
 * - @memberjunction/a2a-server (A2AServerConfig)
 * - @memberjunction/querygen (QueryGenConfig)
 */

/**
 * Generic configuration type for MemberJunction.
 * Each consuming package should define its own specific configuration type.
 */
export type MJConfig = Record<string, any>;

/**
 * Type guard to check if a value is a valid configuration object
 */
export function isValidConfig(value: unknown): value is MJConfig {
  return typeof value === 'object' && value !== null;
}
