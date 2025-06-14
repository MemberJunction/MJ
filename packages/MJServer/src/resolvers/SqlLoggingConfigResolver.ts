import { Arg, Ctx, Field, InputType, Mutation, ObjectType, Query, Int } from 'type-graphql';
import { AppContext } from '../types.js';
import { Metadata } from '@memberjunction/core';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { RequireSystemUser } from '../directives/RequireSystemUser.js';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { loadConfig } from '../config.js';

@ObjectType()
export class SqlLoggingOptions {
  @Field(() => Boolean, { nullable: true })
  formatAsMigration?: boolean;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  statementTypes?: 'queries' | 'mutations' | 'both';

  @Field(() => String, { nullable: true })
  batchSeparator?: string;

  @Field(() => Boolean, { nullable: true })
  prettyPrint?: boolean;

  @Field(() => Boolean, { nullable: true })
  logRecordChangeMetadata?: boolean;

  @Field(() => Boolean, { nullable: true })
  retainEmptyLogFiles?: boolean;

  @Field(() => String, { nullable: true })
  filterByUserId?: string;

  @Field(() => String, { nullable: true })
  sessionName?: string;
}

@ObjectType()
export class SqlLoggingSession {
  @Field(() => String)
  id: string;

  @Field(() => String)
  filePath: string;

  @Field(() => Date)
  startTime: Date;

  @Field(() => Int)
  statementCount: number;

  @Field(() => SqlLoggingOptions)
  options: SqlLoggingOptions;

  @Field(() => String, { nullable: true })
  sessionName?: string;

  @Field(() => String, { nullable: true })
  filterByUserId?: string;
}

@InputType()
export class SqlLoggingOptionsInput {
  @Field(() => Boolean, { nullable: true })
  formatAsMigration?: boolean;

  @Field(() => String, { nullable: true })
  description?: string;

  @Field(() => String, { nullable: true })
  statementTypes?: 'queries' | 'mutations' | 'both';

  @Field(() => String, { nullable: true })
  batchSeparator?: string;

  @Field(() => Boolean, { nullable: true })
  prettyPrint?: boolean;

  @Field(() => Boolean, { nullable: true })
  logRecordChangeMetadata?: boolean;

  @Field(() => Boolean, { nullable: true })
  retainEmptyLogFiles?: boolean;

  @Field(() => String, { nullable: true })
  filterByUserId?: string;

  @Field(() => String, { nullable: true })
  sessionName?: string;
}

@InputType()
export class StartSqlLoggingInput {
  @Field(() => String, { nullable: true })
  fileName?: string;

  @Field(() => SqlLoggingOptionsInput, { nullable: true })
  options?: SqlLoggingOptionsInput;

  @Field(() => Boolean, { nullable: true })
  filterToCurrentUser?: boolean;
}

@ObjectType()
export class SqlLoggingConfig {
  @Field(() => Boolean)
  enabled: boolean;

  @Field(() => SqlLoggingOptions)
  defaultOptions: SqlLoggingOptions;

  @Field(() => String)
  allowedLogDirectory: string;

  @Field(() => Int)
  maxActiveSessions: number;

  @Field(() => Boolean)
  autoCleanupEmptyFiles: boolean;

  @Field(() => Int)
  sessionTimeout: number;

  @Field(() => Int)
  activeSessionCount: number;
}

export class SqlLoggingConfigResolver {
  private static readonly LOG_FILE_PREFIX = 'sql-log-';
  
  /**
   * Get the current SQL logging configuration
   */
  @RequireSystemUser()
  @Query(() => SqlLoggingConfig)
  async sqlLoggingConfig(@Ctx() context: AppContext): Promise<SqlLoggingConfig> {
    const config = await loadConfig();
    const provider = Metadata.Provider as SQLServerDataProvider;
    const activeSessions = provider.getActiveSqlLoggingSessions();

    return {
      enabled: config.sqlLogging?.enabled ?? false,
      defaultOptions: config.sqlLogging?.defaultOptions ?? {
        formatAsMigration: false,
        statementTypes: 'both',
        batchSeparator: 'GO',
        prettyPrint: true,
        logRecordChangeMetadata: false,
        retainEmptyLogFiles: false
      },
      allowedLogDirectory: config.sqlLogging?.allowedLogDirectory ?? './logs/sql',
      maxActiveSessions: config.sqlLogging?.maxActiveSessions ?? 5,
      autoCleanupEmptyFiles: config.sqlLogging?.autoCleanupEmptyFiles ?? true,
      sessionTimeout: config.sqlLogging?.sessionTimeout ?? 3600000,
      activeSessionCount: activeSessions.length
    };
  }

  /**
   * Get all active SQL logging sessions
   */
  @RequireSystemUser()
  @Query(() => [SqlLoggingSession])
  async activeSqlLoggingSessions(@Ctx() context: AppContext): Promise<SqlLoggingSession[]> {
    const provider = Metadata.Provider as SQLServerDataProvider;
    const sessions = provider.getActiveSqlLoggingSessions();

    return sessions.map(session => ({
      id: session.id,
      filePath: session.filePath,
      startTime: session.startTime,
      statementCount: session.statementCount,
      options: session.options,
      sessionName: session.options.sessionName,
      filterByUserId: session.options.filterByUserId
    }));
  }

  /**
   * Start a new SQL logging session
   */
  @RequireSystemUser()
  @Mutation(() => SqlLoggingSession)
  async startSqlLogging(
    @Arg('input', () => StartSqlLoggingInput) input: StartSqlLoggingInput,
    @Ctx() context: AppContext
  ): Promise<SqlLoggingSession> {
    const config = await loadConfig();
    
    // Check if SQL logging is enabled
    if (!config.sqlLogging?.enabled) {
      throw new Error('SQL logging is not enabled in the server configuration');
    }

    // Check max active sessions
    const provider = Metadata.Provider as SQLServerDataProvider;
    const activeSessions = provider.getActiveSqlLoggingSessions();
    if (activeSessions.length >= (config.sqlLogging.maxActiveSessions ?? 5)) {
      throw new Error(`Maximum number of active SQL logging sessions (${config.sqlLogging.maxActiveSessions}) reached`);
    }

    // Prepare file path
    const allowedDir = path.resolve(config.sqlLogging.allowedLogDirectory ?? './logs/sql');
    await this.ensureDirectoryExists(allowedDir);
    
    const fileName = input.fileName || `${SqlLoggingConfigResolver.LOG_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    const filePath = path.join(allowedDir, fileName);

    // Validate file path is within allowed directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(allowedDir)) {
      throw new Error('Invalid file path - must be within allowed log directory');
    }

    // Merge options with defaults
    const defaultOptions = config.sqlLogging.defaultOptions || {};
    const sessionOptions = {
      ...defaultOptions,
      ...input.options,
      sessionName: input.options?.sessionName || `Session started by ${context.userPayload.email}`,
      filterByUserId: input.filterToCurrentUser ? context.userPayload.email : input.options?.filterByUserId
    };

    // Create the logging session
    const session = await provider.createSqlLogger(filePath, sessionOptions);

    // Set up auto-cleanup after timeout
    if (config.sqlLogging.sessionTimeout > 0) {
      setTimeout(async () => {
        try {
          await session.dispose();
        } catch (e) {
          // Session might already be disposed
        }
      }, config.sqlLogging.sessionTimeout);
    }

    return {
      id: session.id,
      filePath: session.filePath,
      startTime: session.startTime,
      statementCount: session.statementCount,
      options: session.options,
      sessionName: session.options.sessionName,
      filterByUserId: session.options.filterByUserId
    };
  }

  /**
   * Stop a specific SQL logging session
   */
  @RequireSystemUser()
  @Mutation(() => Boolean)
  async stopSqlLogging(
    @Arg('sessionId', () => String) sessionId: string,
    @Ctx() context: AppContext
  ): Promise<boolean> {
    const provider = Metadata.Provider as SQLServerDataProvider;
    
    // Get the actual session from the private map to call dispose
    const sessionMap = (provider as any)._sqlLoggingSessions as Map<string, any>;
    const session = sessionMap.get(sessionId);
    
    if (!session) {
      throw new Error(`SQL logging session ${sessionId} not found`);
    }

    await session.dispose();
    return true;
  }

  /**
   * Stop all active SQL logging sessions
   */
  @RequireSystemUser()
  @Mutation(() => Boolean)
  async stopAllSqlLogging(@Ctx() context: AppContext): Promise<boolean> {
    const provider = Metadata.Provider as SQLServerDataProvider;
    await provider.disposeAllSqlLoggingSessions();
    return true;
  }

  /**
   * Update default SQL logging options
   */
  @RequireSystemUser()
  @Mutation(() => SqlLoggingOptions)
  async updateSqlLoggingDefaults(
    @Arg('options', () => SqlLoggingOptionsInput) options: SqlLoggingOptionsInput,
    @Ctx() context: AppContext
  ): Promise<SqlLoggingOptions> {
    // Note: This updates the runtime configuration only, not the file
    // In a production system, you might want to persist this to a database
    const config = await loadConfig();
    if (!config.sqlLogging) {
      throw new Error('SQL logging configuration not found');
    }

    config.sqlLogging.defaultOptions = {
      ...config.sqlLogging.defaultOptions,
      ...options
    };

    return config.sqlLogging.defaultOptions;
  }

  /**
   * Ensure the log directory exists
   */
  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }
}