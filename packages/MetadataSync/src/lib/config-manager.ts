/**
 * @fileoverview Shared configuration manager for MetadataSync commands
 * @module lib/config-manager
 *
 * This module provides a centralized configuration management system that handles
 * loading MJ config from the original working directory, regardless of any
 * directory changes made during command execution.
 */

import { cosmiconfigSync } from 'cosmiconfig';
import { mergeConfigs, parseBooleanEnv } from '@memberjunction/config';
import { BaseSingleton, resolveDbPlatformFromEnv } from '@memberjunction/global';
import { MJConfig } from '../config';

const ENV_DB_PLATFORM = resolveDbPlatformFromEnv();

/**
 * Default configuration for MetadataSync
 *
 * Provides database connection settings from environment variables,
 * matching the pattern used by MJServer's DEFAULT_SERVER_CONFIG and
 * MJCLI's DEFAULT_CLI_CONFIG. This ensures consistent behavior with the
 * rest of the MJ ecosystem — without `dbPlatform` resolved here, `mj sync
 * push` against a PG .env silently constructs a SqlServerDataProvider and
 * fails with `socket hang up` when its tedious driver tries to talk to
 * postgres on port 5432.
 */
const DEFAULT_SYNC_CONFIG: Partial<MJConfig> = {
  // Database connection settings (environment-driven with defaults)
  dbPlatform: ENV_DB_PLATFORM ?? 'sqlserver',
  dbHost: process.env.DB_HOST ?? 'localhost',
  dbPort: process.env.DB_PORT
    ? parseInt(process.env.DB_PORT, 10)
    : (ENV_DB_PLATFORM === 'postgresql' ? 5432 : 1433),
  dbDatabase: process.env.DB_DATABASE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbTrustServerCertificate: parseBooleanEnv(process.env.DB_TRUST_SERVER_CERTIFICATE) ? 'Y' : 'N',
  dbEncrypt: process.env.DB_ENCRYPT ?? undefined,
  dbInstanceName: process.env.DB_INSTANCE_NAME,
  mjCoreSchema: process.env.MJ_CORE_SCHEMA ?? '__mj',
};

/**
 * Configuration manager singleton for handling MJ configuration
 * 
 * Stores the original working directory and MJ configuration to ensure
 * consistent access across all commands, even when the current working
 * directory changes during execution.
 */
export class ConfigManager extends BaseSingleton<ConfigManager> {
  private originalCwd: string | null = null;
  private mjConfig: MJConfig | null = null;
  private configLoaded = false;

  public constructor() {
    super();
  }

  /**
   * Get the singleton instance of ConfigManager
   */
  public static get Instance(): ConfigManager {
    return ConfigManager.getInstance<ConfigManager>();
  }

  /**
   * Get the original working directory from when the process started
   * 
   * @returns The original working directory path
   */
  getOriginalCwd(): string {
    if (!this.originalCwd) {
      // Capture on first access
      this.originalCwd = process.cwd();
    }
    return this.originalCwd;
  }
  
  /**
   * Set the original working directory (for testing or special cases)
   * 
   * @param cwd - The working directory to use as original
   */
  setOriginalCwd(cwd: string): void {
    this.originalCwd = cwd;
  }

  /**
   * Load MemberJunction configuration
   * 
   * Searches for mj.config.cjs starting from the original working directory
   * and walking up the directory tree. Caches the result for subsequent calls.
   * 
   * @param forceReload - Force reload the configuration even if cached
   * @returns MJConfig object if found, null if not found or invalid
   */
  loadMJConfig(forceReload = false): MJConfig | null {
    if (this.configLoaded && !forceReload) {
      return this.mjConfig;
    }

    try {
      const explorer = cosmiconfigSync('mj');
      // Always search from the original working directory
      const searchPath = this.getOriginalCwd();
      const result = explorer.search(searchPath);

      // Merge user config with DEFAULT_SYNC_CONFIG (user config takes precedence)
      // This ensures environment variables are used for database settings
      // when not explicitly set in the config file
      const userConfig = result?.config ?? {};
      this.mjConfig = mergeConfigs(DEFAULT_SYNC_CONFIG, userConfig) as MJConfig;
      this.configLoaded = true;
      return this.mjConfig;
    } catch (error) {
      console.error('Error loading MJ config:', error);
      this.mjConfig = null;
      this.configLoaded = true;
      return null;
    }
  }

  /**
   * Get the cached MJ configuration
   * 
   * @returns The cached MJConfig or null if not loaded
   */
  getMJConfig(): MJConfig | null {
    if (!this.configLoaded) {
      return this.loadMJConfig();
    }
    return this.mjConfig;
  }
}

// Export singleton instance for convenience
export const configManager = ConfigManager.Instance;