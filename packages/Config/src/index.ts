/**
 * @memberjunction/config
 *
 * Central configuration utilities for MemberJunction framework.
 * Provides utilities for loading and merging user overrides with package defaults.
 *
 * Architecture:
 * - Each package (server, codegen-lib, etc.) exports its own DEFAULT_CONFIG
 * - This package provides utilities to discover, load, and merge configurations
 * - User's mj.config.cjs file overrides package defaults
 * - Environment variables override everything
 */

export {
  loadMJConfig,
  loadMJConfigSync,
  buildMJConfig,
  type LoadConfigOptions,
  type LoadConfigResult
} from './config-loader';

export {
  mergeConfigs,
  validateConfigStructure,
  type MergeOptions
} from './config-merger';

export {
  type MJConfig,
  isValidConfig
} from './config-types';

export {
  parseBooleanEnv
} from './env-utils';
