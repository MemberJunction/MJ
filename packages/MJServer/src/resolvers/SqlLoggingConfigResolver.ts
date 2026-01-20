import { Arg, Ctx, Field, InputType, Mutation, ObjectType, Query, Int, Resolver } from 'type-graphql';
import { AppContext } from '../types.js';
import { Metadata, UserInfo } from '@memberjunction/core';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import { loadConfig } from '../config.js';
import { ResolverBase } from '../generic/ResolverBase.js';
import { GetReadOnlyProvider } from '../util.js';

/**
 * Configuration options for SQL logging sessions.
 * These options control how SQL statements are captured, formatted, and saved.
 */
@ObjectType()
export class SqlLoggingOptions {
  /** Whether to format SQL output as a database migration file with proper headers */
  @Field(() => Boolean, { nullable: true })
  formatAsMigration?: boolean;

  /** Optional description or notes for this logging configuration */
  @Field(() => String, { nullable: true })
  description?: string;

  /** Types of SQL statements to capture: 'queries', 'mutations', or 'both' */
  @Field(() => String, { nullable: true })
  statementTypes?: 'queries' | 'mutations' | 'both';

  /** String separator to use between SQL statements (e.g., 'GO' for SQL Server) */
  @Field(() => String, { nullable: true })
  batchSeparator?: string;

  /** Whether to format SQL with proper indentation and line breaks */
  @Field(() => Boolean, { nullable: true })
  prettyPrint?: boolean;

  /** Whether to include metadata about record changes in the log output */
  @Field(() => Boolean, { nullable: true })
  logRecordChangeMetadata?: boolean;

  /** Whether to keep log files even if they contain no SQL statements */
  @Field(() => Boolean, { nullable: true })
  retainEmptyLogFiles?: boolean;

  /** Email address to filter SQL statements by user (when filtering is enabled) */
  @Field(() => String, { nullable: true })
  filterByUserId?: string;

  /** Array of regex/wildcard patterns to filter SQL statements */
  @Field(() => [String], { nullable: true })
  filterPatterns?: string[];

  /** How to apply patterns: 'include' or 'exclude' (default: exclude) */
  @Field(() => String, { nullable: true })
  filterType?: 'include' | 'exclude';

  /** Whether to output verbose debug information to console */
  @Field(() => Boolean, { nullable: true })
  verboseOutput?: boolean;

  /** Default schema name for Flyway migration placeholder replacement */
  @Field(() => String, { nullable: true })
  defaultSchemaName?: string;

  /** Human-readable name for the logging session */
  @Field(() => String, { nullable: true })
  sessionName?: string;
}

@ObjectType()
export class SqlLoggingSession {
  /** Unique identifier for this logging session */
  @Field(() => String)
  id: string;

  /** Absolute file path where SQL statements are being logged */
  @Field(() => String)
  filePath: string;

  /** Timestamp when this logging session was started */
  @Field(() => Date)
  startTime: Date;

  /** Number of SQL statements captured so far in this session */
  @Field(() => Int)
  statementCount: number;

  /** Configuration options applied to this logging session */
  @Field(() => SqlLoggingOptions)
  options: SqlLoggingOptions;

  /** Human-readable name for this logging session */
  @Field(() => String, { nullable: true })
  sessionName?: string;

  /** Email address of user whose SQL is being filtered (if filtering enabled) */
  @Field(() => String, { nullable: true })
  filterByUserId?: string;
}

@InputType()
export class SqlLoggingOptionsInput {
  /** Whether to format SQL output as a database migration file with proper headers */
  @Field(() => Boolean, { nullable: true })
  formatAsMigration?: boolean;

  /** Optional description or notes for this logging configuration */
  @Field(() => String, { nullable: true })
  description?: string;

  /** Types of SQL statements to capture: 'queries', 'mutations', or 'both' */
  @Field(() => String, { nullable: true })
  statementTypes?: 'queries' | 'mutations' | 'both';

  /** String separator to use between SQL statements (e.g., 'GO' for SQL Server) */
  @Field(() => String, { nullable: true })
  batchSeparator?: string;

  /** Whether to format SQL with proper indentation and line breaks */
  @Field(() => Boolean, { nullable: true })
  prettyPrint?: boolean;

  /** Whether to include metadata about record changes in the log output */
  @Field(() => Boolean, { nullable: true })
  logRecordChangeMetadata?: boolean;

  /** Whether to keep log files even if they contain no SQL statements */
  @Field(() => Boolean, { nullable: true })
  retainEmptyLogFiles?: boolean;

  /** Email address to filter SQL statements by user (when filtering is enabled) */
  @Field(() => String, { nullable: true })
  filterByUserId?: string;

  /** Array of regex/wildcard patterns to filter SQL statements */
  @Field(() => [String], { nullable: true })
  filterPatterns?: string[];

  /** How to apply patterns: 'include' or 'exclude' (default: exclude) */
  @Field(() => String, { nullable: true })
  filterType?: 'include' | 'exclude';

  /** Whether to output verbose debug information to console */
  @Field(() => Boolean, { nullable: true })
  verboseOutput?: boolean;

  /** Default schema name for Flyway migration placeholder replacement */
  @Field(() => String, { nullable: true })
  defaultSchemaName?: string;

  /** Human-readable name for the logging session */
  @Field(() => String, { nullable: true })
  sessionName?: string;
}

@InputType()
export class StartSqlLoggingInput {
  /** Optional custom filename for the SQL log file (auto-generated if not provided) */
  @Field(() => String, { nullable: true })
  fileName?: string;

  /** Configuration options for the logging session (merged with server defaults) */
  @Field(() => SqlLoggingOptionsInput, { nullable: true })
  options?: SqlLoggingOptionsInput;

  /** Whether to filter SQL statements to only those from the current user */
  @Field(() => Boolean, { nullable: true })
  filterToCurrentUser?: boolean;
}

@ObjectType()
export class SqlLoggingConfig {
  /** Whether SQL logging is enabled in the server configuration */
  @Field(() => Boolean)
  enabled: boolean;

  /** Default logging options applied to new sessions (can be overridden) */
  @Field(() => SqlLoggingOptions)
  defaultOptions: SqlLoggingOptions;

  /** Directory path where SQL log files are allowed to be created */
  @Field(() => String)
  allowedLogDirectory: string;

  /** Maximum number of concurrent SQL logging sessions allowed */
  @Field(() => Int)
  maxActiveSessions: number;

  /** Whether to automatically delete log files that contain no SQL statements */
  @Field(() => Boolean)
  autoCleanupEmptyFiles: boolean;

  /** Timeout in milliseconds after which inactive sessions are automatically stopped */
  @Field(() => Int)
  sessionTimeout: number;

  /** Current number of active SQL logging sessions */
  @Field(() => Int)
  activeSessionCount: number;
}

/**
 * GraphQL resolver for SQL logging configuration and session management.
 * Provides queries and mutations for controlling SQL logging functionality.
 *
 * **Security**: All operations require Owner-level privileges.
 *
 * @example
 * ```typescript
 * // Start a new logging session
 * const session = await startSqlLogging({
 *   fileName: "my-session.sql",
 *   filterToCurrentUser: true,
 *   options: {
 *     prettyPrint: true,
 *     statementTypes: "both"
 *   }
 * });
 *
 * // Get current configuration
 * const config = await sqlLoggingConfig();
 *
 * // List active sessions
 * const sessions = await activeSqlLoggingSessions();
 *
 * // Stop a session
 * await stopSqlLogging(session.id);
 * ```
 */
@Resolver()
export class SqlLoggingConfigResolver extends ResolverBase {
  /** Default prefix for auto-generated SQL log filenames */
  private static readonly LOG_FILE_PREFIX = 'sql-log-';

  /** Track active session timeouts for proper cleanup when sessions are manually stopped */
  private static sessionTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Validates that the current user has Owner-level privileges required for SQL logging operations.
   *
   * This method performs authentication and authorization checks:
   * - Verifies user is authenticated (has email in context)
   * - Looks up user in UserCache by email (case-insensitive)
   * - Checks that user Type field equals 'Owner' (trimmed for nchar padding)
   *
   * @param context - The GraphQL application context containing user authentication data
   * @returns Promise resolving to the authenticated UserInfo object
   * @throws Error if user is not authenticated, not found, or lacks Owner privileges
   *
   * @private
   */
  private async checkOwnerAccess(context: AppContext): Promise<UserInfo> {
    const userEmail = context.userPayload?.email;
    if (!userEmail) {
      throw new Error('User not authenticated');
    }

    // Get the user from cache
    const users = UserCache.Instance.Users;
    const user = users.find((u) => u.Email.toLowerCase() === userEmail.toLowerCase());
    if (!user) {
      throw new Error('User not found');
    }

    // Debug logging
    console.log('SQL Logging access check:', {
      email: user.Email,
      type: user.Type,
      typeLength: user.Type?.length,
      typeTrimmed: user.Type?.trim(),
      isOwner: user.Type?.trim().toLowerCase() === 'owner',
    });

    // Check if user has Type = 'Owner' (trim and case-insensitive for nchar fields)
    if (user.Type?.trim().toLowerCase() !== 'owner') {
      throw new Error('Access denied. This feature requires Owner privileges.');
    }

    return user;
  }

  /**
   * Retrieves the current SQL logging configuration and status information.
   *
   * Returns comprehensive configuration details including:
   * - Whether SQL logging is enabled in server config
   * - Default logging options (formatting, statement types, etc.)
   * - File system settings (log directory, cleanup options)
   * - Session limits and timeout settings
   * - Count of currently active logging sessions
   *
   * @param context - GraphQL context (requires Owner privileges)
   * @returns Promise resolving to complete SQL logging configuration
   * @throws Error if user lacks Owner privileges
   *
   * @example
   * ```graphql
   * query {
   *   sqlLoggingConfig {
   *     enabled
   *     activeSessionCount
   *     maxActiveSessions
   *     allowedLogDirectory
   *     defaultOptions {
   *       prettyPrint
   *       statementTypes
   *     }
   *   }
   * }
   * ```
   */
  @Query(() => SqlLoggingConfig)
  async sqlLoggingConfig(@Ctx() context: AppContext): Promise<SqlLoggingConfig> {
    await this.checkOwnerAccess(context);
    const config = await loadConfig();
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true }) as SQLServerDataProvider;
    const activeSessions = provider.GetActiveSqlLoggingSessions();

    return {
      enabled: config.sqlLogging?.enabled ?? false,
      defaultOptions: config.sqlLogging?.defaultOptions ?? {
        formatAsMigration: false,
        statementTypes: 'both',
        batchSeparator: 'GO',
        prettyPrint: true,
        logRecordChangeMetadata: false,
        retainEmptyLogFiles: false,
      },
      allowedLogDirectory: config.sqlLogging?.allowedLogDirectory ?? './logs/sql',
      maxActiveSessions: config.sqlLogging?.maxActiveSessions ?? 5,
      autoCleanupEmptyFiles: config.sqlLogging?.autoCleanupEmptyFiles ?? true,
      sessionTimeout: config.sqlLogging?.sessionTimeout ?? 3600000,
      activeSessionCount: activeSessions.length,
    };
  }

  /**
   * Retrieves a list of all currently active SQL logging sessions.
   *
   * Returns detailed information for each active session including:
   * - Unique session identifier and file path
   * - Start time and statement count
   * - Session configuration options
   * - User filtering settings
   *
   * @param context - GraphQL context (requires Owner privileges)
   * @returns Promise resolving to array of active SqlLoggingSession objects
   * @throws Error if user lacks Owner privileges
   *
   * @example
   * ```graphql
   * query {
   *   activeSqlLoggingSessions {
   *     id
   *     sessionName
   *     filePath
   *     startTime
   *     statementCount
   *     filterByUserId
   *     options {
   *       prettyPrint
   *       statementTypes
   *     }
   *   }
   * }
   * ```
   */
  @Query(() => [SqlLoggingSession])
  async activeSqlLoggingSessions(@Ctx() context: AppContext): Promise<SqlLoggingSession[]> {
    await this.checkOwnerAccess(context);
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true }) as SQLServerDataProvider;
    const sessions = provider.GetActiveSqlLoggingSessions();

    return sessions.map((session) => ({
      id: session.id,
      filePath: session.filePath,
      startTime: session.startTime,
      statementCount: session.statementCount,
      options: this.convertOptionsToGraphQL(session.options),
      sessionName: session.options.sessionName,
      filterByUserId: session.options.filterByUserId,
    }));
  }

  /**
   * Creates and starts a new SQL logging session with specified configuration.
   *
   * This mutation:
   * - Validates SQL logging is enabled and session limits
   * - Creates a secure file path within the allowed log directory
   * - Configures session options (filtering, formatting, etc.)
   * - Starts the logging session in SQLServerDataProvider
   * - Sets up automatic cleanup after session timeout
   *
   * @param input - Configuration for the new logging session
   * @param input.fileName - Optional custom filename for the log file
   * @param input.filterToCurrentUser - Whether to filter SQL to current user only
   * @param input.options - Logging options (formatting, statement types, etc.)
   * @param context - GraphQL context (requires Owner privileges)
   * @returns Promise resolving to the created SqlLoggingSession object
   * @throws Error if logging disabled, session limit reached, or invalid file path
   *
   * @example
   * ```graphql
   * mutation {
   *   startSqlLogging(input: {
   *     fileName: "debug-session.sql"
   *     filterToCurrentUser: true
   *     options: {
   *       prettyPrint: true
   *       statementTypes: "both"
   *       sessionName: "Debug Session"
   *     }
   *   }) {
   *     id
   *     filePath
   *     sessionName
   *   }
   * }
   * ```
   */
  @Mutation(() => SqlLoggingSession)
  async startSqlLogging(@Arg('input', () => StartSqlLoggingInput) input: StartSqlLoggingInput, @Ctx() context: AppContext): Promise<SqlLoggingSession> {
    await this.checkOwnerAccess(context);
    const config = await loadConfig();

    // Check if SQL logging is enabled
    if (!config.sqlLogging?.enabled) {
      throw new Error('SQL logging is not enabled in the server configuration');
    }

    // Check max active sessions
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true }) as SQLServerDataProvider;
    const activeSessions = provider.GetActiveSqlLoggingSessions();
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
    const userInfo = input.filterToCurrentUser ? this.GetUserFromPayload(context.userPayload) : undefined;
    const sessionOptions = {
      ...defaultOptions,
      ...input.options,
      sessionName: input.options?.sessionName || `Session started by ${context.userPayload.email}`,
      filterByUserId: input.filterToCurrentUser ? userInfo?.ID : input.options?.filterByUserId,
    };

    // Create the logging session
    const session = await provider.CreateSqlLogger(filePath, sessionOptions);

    // Set up auto-cleanup after timeout with proper tracking
    if (config.sqlLogging.sessionTimeout > 0) {
      const timeoutId = setTimeout(async () => {
        try {
          await session.dispose();
          SqlLoggingConfigResolver.sessionTimeouts.delete(session.id);
        } catch (e) {
          // Session might already be disposed - log for debugging
          console.warn(`Auto-cleanup failed for SQL logging session ${session.id}:`, e);
        }
      }, config.sqlLogging.sessionTimeout);

      // Track the timeout so we can cancel it if session is manually stopped
      SqlLoggingConfigResolver.sessionTimeouts.set(session.id, timeoutId);
    }

    return {
      id: session.id,
      filePath: session.filePath,
      startTime: session.startTime,
      statementCount: session.statementCount,
      options: this.convertOptionsToGraphQL(session.options),
      sessionName: session.options.sessionName,
      filterByUserId: session.options.filterByUserId,
    };
  }

  /**
   * Stops and disposes of a specific SQL logging session.
   *
   * This mutation:
   * - Validates the session exists and user has access
   * - Calls dispose() on the session to close file handles
   * - Removes the session from the active sessions map
   * - Performs any configured cleanup operations
   *
   * @param sessionId - Unique identifier of the session to stop
   * @param context - GraphQL context (requires Owner privileges)
   * @returns Promise resolving to true if session was successfully stopped
   * @throws Error if session not found or user lacks Owner privileges
   *
   * @example
   * ```graphql
   * mutation {
   *   stopSqlLogging(sessionId: "session-123-456")
   * }
   * ```
   */
  @Mutation(() => Boolean)
  async stopSqlLogging(@Arg('sessionId', () => String) sessionId: string, @Ctx() context: AppContext): Promise<boolean> {
    await this.checkOwnerAccess(context);
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true }) as SQLServerDataProvider;

    // Use the public method to get and dispose the session
    const session = provider.GetSqlLoggingSessionById(sessionId);

    if (!session) {
      throw new Error(`SQL logging session ${sessionId} not found`);
    }

    // Clear any scheduled timeout for this session
    const timeoutId = SqlLoggingConfigResolver.sessionTimeouts.get(sessionId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      SqlLoggingConfigResolver.sessionTimeouts.delete(sessionId);
    }

    await session.dispose();
    return true;
  }

  /**
   * Stops and disposes of all currently active SQL logging sessions.
   *
   * This is a convenience method that:
   * - Calls DisposeAllSqlLoggingSessions() on the data provider
   * - Ensures all file handles are properly closed
   * - Clears the active sessions map
   * - Performs cleanup for all sessions at once
   *
   * @param context - GraphQL context (requires Owner privileges)
   * @returns Promise resolving to true if all sessions were successfully stopped
   * @throws Error if user lacks Owner privileges
   *
   * @example
   * ```graphql
   * mutation {
   *   stopAllSqlLogging
   * }
   * ```
   */
  @Mutation(() => Boolean)
  async stopAllSqlLogging(@Ctx() context: AppContext): Promise<boolean> {
    await this.checkOwnerAccess(context);
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true }) as SQLServerDataProvider;
    await provider.DisposeAllSqlLoggingSessions();
    return true;
  }

  /**
   * Updates the default SQL logging options for new sessions.
   *
   * **Note**: This updates runtime configuration only, not the static config file.
   * Changes apply to new sessions but do not persist across server restarts.
   * In a production system, consider persisting changes to a database.
   *
   * @param options - New default options to apply (partial update supported)
   * @param context - GraphQL context (requires Owner privileges)
   * @returns Promise resolving to the updated SqlLoggingOptions object
   * @throws Error if SQL logging not configured or user lacks Owner privileges
   *
   * @example
   * ```graphql
   * mutation {
   *   updateSqlLoggingDefaults(options: {
   *     prettyPrint: true
   *     statementTypes: "both"
   *     logRecordChangeMetadata: false
   *   }) {
   *     prettyPrint
   *     statementTypes
   *     formatAsMigration
   *   }
   * }
   * ```
   */
  @Mutation(() => SqlLoggingOptions)
  async updateSqlLoggingDefaults(
    @Arg('options', () => SqlLoggingOptionsInput) options: SqlLoggingOptionsInput,
    @Ctx() context: AppContext,
  ): Promise<SqlLoggingOptions> {
    await this.checkOwnerAccess(context);
    // Note: This updates the runtime configuration only, not the file
    // In a production system, you might want to persist this to a database
    const config = await loadConfig();
    if (!config.sqlLogging) {
      throw new Error('SQL logging configuration not found');
    }

    config.sqlLogging.defaultOptions = {
      ...config.sqlLogging.defaultOptions,
      ...options,
    };

    return config.sqlLogging.defaultOptions;
  }

  /**
   * Reads the contents of a specific SQL log file.
   *
   * This method:
   * - Validates the session exists and user has access
   * - Ensures the file path is within the allowed log directory
   * - Reads the file content with optional line limits
   * - Returns the content as a string
   *
   * @param sessionId - Unique identifier of the logging session
   * @param maxLines - Maximum number of lines to read (optional, defaults to all)
   * @param context - GraphQL context (requires Owner privileges)
   * @returns Promise resolving to the log file content
   * @throws Error if session not found, file not accessible, or user lacks privileges
   *
   * @example
   * ```graphql
   * query {
   *   readSqlLogFile(sessionId: "session-123", maxLines: 100)
   * }
   * ```
   */
  @Query(() => String)
  async readSqlLogFile(
    @Arg('sessionId', () => String) sessionId: string,
    @Arg('maxLines', () => Int, { nullable: true }) maxLines: number | null,
    @Ctx() context: AppContext,
  ): Promise<string> {
    await this.checkOwnerAccess(context);
    const config = await loadConfig();

    // Check if SQL logging is enabled
    if (!config.sqlLogging?.enabled) {
      throw new Error('SQL logging is not enabled in the server configuration');
    }

    // Find the session
    const provider = GetReadOnlyProvider(context.providers, { allowFallbackToReadWrite: true }) as SQLServerDataProvider;
    const sessions = provider.GetActiveSqlLoggingSessions();
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      throw new Error(`SQL logging session ${sessionId} not found`);
    }

    // Validate file path is within allowed directory
    const allowedDir = path.resolve(config.sqlLogging.allowedLogDirectory ?? './logs/sql');
    const resolvedPath = path.resolve(session.filePath);
    if (!resolvedPath.startsWith(allowedDir)) {
      throw new Error('Access denied - file path outside allowed directory');
    }

    try {
      // Check if file exists
      await fs.access(session.filePath);

      // Read file content
      const content = await fs.readFile(session.filePath, 'utf-8');

      // Apply line limit if specified
      if (maxLines && maxLines > 0) {
        const lines = content.split('\n');
        if (lines.length > maxLines) {
          // Return the last N lines
          return lines.slice(-maxLines).join('\n');
        }
      }

      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return '-- Log file not yet created or is empty --';
      }
      throw new Error(`Failed to read log file: ${error.message}`);
    }
  }

  /**
   * Debug query to check what the current user email is in the SQL provider.
   * This helps diagnose user filtering issues when SQL statements aren't being captured.
   *
   * Returns a comparison of the user email stored in the SQLServerDataProvider
   * versus the user email from the GraphQL context, which helps identify mismatches
   * that could prevent SQL filtering from working correctly.
   *
   * @param context - GraphQL context containing user information
   * @returns Formatted string showing both email values and whether they match
   * @throws Error if user doesn't have Owner privileges
   */
  @Query(() => String)
  async debugCurrentUserEmail(@Ctx() context: AppContext): Promise<string> {
    await this.checkOwnerAccess(context);

    const contextUserEmail = context.userPayload?.email || 'NOT_SET';

    return `Context User Email: "${contextUserEmail}" | Note: Provider no longer stores user email - uses contextUser parameter for SQL logging`;
  }

  /**
   * Ensures the specified log directory exists, creating it if necessary.
   *
   * This method:
   * - Attempts to access the directory to check if it exists
   * - Creates the directory recursively if it doesn't exist
   * - Handles permission and file system errors gracefully
   *
   * @param dir - Absolute path to the directory to ensure exists
   * @throws Error if directory cannot be created due to permissions or other issues
   *
   * @private
   */
  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Converts SqlLoggingOptions from the provider to the GraphQL-compatible type.
   * The provider's filterPatterns can contain RegExp objects, but GraphQL only supports strings.
   *
   * @param options - Options from SQLServerDataProvider
   * @returns GraphQL-compatible SqlLoggingOptions
   * @private
   */
  private convertOptionsToGraphQL(options: import('@memberjunction/sqlserver-dataprovider').SqlLoggingOptions): SqlLoggingOptions {
    return {
      formatAsMigration: options.formatAsMigration,
      description: options.description,
      statementTypes: options.statementTypes,
      batchSeparator: options.batchSeparator,
      prettyPrint: options.prettyPrint,
      logRecordChangeMetadata: options.logRecordChangeMetadata,
      retainEmptyLogFiles: options.retainEmptyLogFiles,
      filterByUserId: options.filterByUserId,
      sessionName: options.sessionName,
      verboseOutput: options.verboseOutput,
      defaultSchemaName: options.defaultSchemaName,
      // Convert RegExp objects to their string representation
      filterPatterns: options.filterPatterns?.map((p) => (p instanceof RegExp ? p.toString() : String(p))),
      filterType: options.filterType,
    };
  }
}
