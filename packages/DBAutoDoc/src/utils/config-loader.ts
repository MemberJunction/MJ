/**
 * Configuration loading utilities
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { DBAutoDocConfig } from '../types/config.js';

export class ConfigLoader {
  /**
   * Load configuration from file
   * Supports environment variable expansion using ${ENV_VAR} syntax
   */
  public static async load(configPath: string): Promise<DBAutoDocConfig> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');

      // Expand environment variables in the content
      const expandedContent = this.expandEnvVars(content);

      const config = JSON.parse(expandedContent) as DBAutoDocConfig;

      // Validate required fields
      this.validate(config);

      return config;
    } catch (error) {
      throw new Error(`Failed to load configuration: ${(error as Error).message}`);
    }
  }

  /**
   * Expand environment variables in string
   * Supports ${VAR_NAME} syntax
   */
  private static expandEnvVars(content: string): string {
    return content.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const value = process.env[varName];
      if (value === undefined) {
        throw new Error(`Environment variable ${varName} is not defined`);
      }
      return value;
    });
  }

  /**
   * Save configuration to file
   */
  public static async save(config: DBAutoDocConfig, configPath: string): Promise<void> {
    try {
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });

      const content = JSON.stringify(config, null, 2);
      await fs.writeFile(configPath, content, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save configuration: ${(error as Error).message}`);
    }
  }

  /**
   * Create default configuration
   */
  public static createDefault(): DBAutoDocConfig {
    return {
      version: '1.0.0',
      database: {
        server: 'localhost',
        port: 1433,
        database: '',
        user: '',
        password: '',
        encrypt: true,
        trustServerCertificate: false,
        connectionTimeout: 30000
      },
      ai: {
        provider: 'gemini',
        model: 'gemini-3-flash-preview',
        apiKey: '',
        temperature: 0.1,
        maxTokens: 4000
      },
      analysis: {
        cardinalityThreshold: 20,
        sampleSize: 10,
        includeStatistics: true,
        includePatternAnalysis: true,
        convergence: {
          maxIterations: 10,
          stabilityWindow: 2,
          confidenceThreshold: 0.85
        },
        backpropagation: {
          enabled: true,
          maxDepth: 3
        },
        sanityChecks: {
          dependencyLevel: true,
          schemaLevel: true,
          crossSchema: true
        }
      },
      output: {
        stateFile: './db-doc-state.json',
        sqlFile: './output/add-descriptions.sql',
        markdownFile: './output/database-documentation.md'
      },
      schemas: {
        include: [],
        exclude: ['sys', 'INFORMATION_SCHEMA']
      },
      tables: {
        exclude: ['sysdiagrams', '__MigrationHistory']
      }
    };
  }

  /**
   * Validate configuration
   */
  private static validate(config: DBAutoDocConfig): void {
    if (!config.database) {
      throw new Error('Missing database configuration');
    }

    if (!config.database.server) {
      throw new Error('Missing database.server');
    }

    if (!config.database.database) {
      throw new Error('Missing database.database');
    }

    if (!config.ai) {
      throw new Error('Missing AI configuration');
    }

    if (!config.ai.provider) {
      throw new Error('Missing ai.provider');
    }

    if (!config.ai.model) {
      throw new Error('Missing ai.model');
    }

    if (!config.ai.apiKey) {
      throw new Error('Missing ai.apiKey');
    }
  }
}
