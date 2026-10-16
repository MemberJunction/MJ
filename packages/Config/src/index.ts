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
  LoadMJConfig, loadMJConfig,
  LoadMJConfigSync, loadMJConfigSync,
  BuildMJConfig, buildMJConfig,
  type LoadConfigOptions,
  type LoadConfigResult
} from './config-loader';

export {
  MergeConfigs, mergeConfigs,
  ValidateConfigStructure, validateConfigStructure,
  type MergeOptions
} from './config-merger';

export {
  type MJConfig,
  IsValidConfig, isValidConfig
} from './config-types';

export {
  ParseBooleanEnv, parseBooleanEnv
} from './env-utils';
