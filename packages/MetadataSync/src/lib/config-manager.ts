/**
 * @fileoverview Shared configuration manager for MetadataSync commands
 * @module lib/config-manager
 * 
 * This module provides a centralized configuration management system that handles
 * loading MJ config from the original working directory, regardless of any
 * directory changes made during command execution.
 */

import { cosmiconfigSync } from 'cosmiconfig';
import { MJConfig } from '../config';

/**
 * Configuration manager singleton for handling MJ configuration
 * 
 * Stores the original working directory and MJ configuration to ensure
 * consistent access across all commands, even when the current working
 * directory changes during execution.
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private originalCwd: string | null = null;
  private mjConfig: MJConfig | null = null;
  private configLoaded = false;

  private constructor() {
    // Original cwd will be set on first access
  }

  /**
   * Get the singleton instance of ConfigManager
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
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
      
      if (!result || !result.config) {
        throw new Error('No mj.config.cjs found');
      }
      
      this.mjConfig = result.config;
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
export const configManager = ConfigManager.getInstance();