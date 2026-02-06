import { Component, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Metadata } from '@memberjunction/core';
import { SharedService, BaseDashboard } from '@memberjunction/ng-shared';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { RegisterClass } from '@memberjunction/global';
import { ResourceData } from '@memberjunction/core-entities';

/** Session options for SQL logging */
interface SqlLoggingSessionOptions {
  formatAsMigration: boolean;
  statementTypes: string;
  prettyPrint: boolean;
}

/** Represents an active SQL logging session */
interface SqlLoggingSession {
  id: string;
  filePath: string;
  startTime: string;
  statementCount: number;
  sessionName: string;
  filterByUserId?: string;
  options?: SqlLoggingSessionOptions;
}

/** SQL logging configuration from the server */
interface SqlLoggingConfig {
  enabled: boolean;
  allowedLogDirectory?: string;
  maxActiveSessions?: number;
  autoCleanupEmptyFiles?: boolean;
  sessionTimeout?: number;
  activeSessionCount?: number;
  defaultOptions?: SqlLoggingSessionOptions;
}

/**
 * Angular component for managing SQL logging sessions in MemberJunction.
 *
 * This component provides a user interface for:
 * - Viewing SQL logging configuration and status
 * - Starting and stopping SQL logging sessions
 * - Managing session options (filtering, formatting, etc.)
 * - Real-time monitoring of active sessions
 *
 * **Security**: Only users with 'Owner' type can access SQL logging features.
 *
 * @example
 * ```html
 * <mj-sql-logging></mj-sql-logging>
 * ```
 *
 * @requires Owner-level user privileges
 * @requires SQL logging enabled in server configuration
 */
@Component({
  standalone: false,
  selector: 'mj-sql-logging',
  templateUrl: './sql-logging.component.html',
  styleUrls: ['./sql-logging.component.css'],
})
@RegisterClass(BaseDashboard, 'SqlLogging')
export class SqlLoggingComponent extends BaseDashboard implements OnDestroy {
  private destroy$ = new Subject<void>();

  /** Whether the component is currently performing an async operation */
  loading = false;

  /** Current error message to display to the user, if any */
  error: string | null = null;

  /** Whether the current user has Owner privileges to access SQL logging */
  isOwner = false;

  /** Whether SQL logging is enabled in the server configuration */
  configEnabled = false;

  /** Current SQL logging configuration from the server */
  sqlLoggingConfig: SqlLoggingConfig | null = null;

  /** List of currently active SQL logging sessions */
  activeSessions: SqlLoggingSession[] = [];

  /** Currently selected session for viewing logs */
  selectedSession: SqlLoggingSession | null = null;

  /** Content of the currently viewed log file */
  logContent = '';

  /** Whether to automatically refresh session data */
  autoRefresh = false;

  /** Interval in milliseconds for auto-refresh functionality */
  refreshInterval = 5000; // 5 seconds

  /** Whether the start session dialog is currently visible */
  showStartSessionDialog = false;

  /** Whether to show the statistics cards section */
  showStats = false;

  /** Whether the log viewer is in expanded (fullscreen) mode */
  isLogViewerExpanded = false;

  /** Whether the start session dialog is in fullscreen mode */
  isStartDialogFullscreen = false;

  /** Whether the stop session confirmation dialog is visible */
  showStopConfirmDialog = false;

  /** Session pending stop confirmation (single session or null for all) */
  sessionToStop: SqlLoggingSession | null = null;

  /** Whether stopping all sessions (vs single session) */
  isStoppingAll = false;

  /** Options for creating a new SQL logging session */
  newSessionOptions = {
    /** Custom filename for the log file */
    fileName: '',
    /** Whether to filter SQL statements to current user only */
    filterToCurrentUser: true,
    /** Whether to format output as migration file */
    formatAsMigration: false,
    /** Types of SQL statements to capture */
    statementTypes: 'both' as 'queries' | 'mutations' | 'both',
    /** Whether to format SQL with proper indentation */
    prettyPrint: true,
    /** Human-readable name for the session */
    sessionName: '',
    /** Regex filter options */
    filterPatterns: '' as string, // Comma or newline separated patterns
    filterType: 'exclude' as 'include' | 'exclude',
    verboseOutput: false,
    defaultSchemaName: '__mj', // Default MJ schema
  };

  /** Available options for SQL statement type filtering */
  statementTypeOptions = [
    { text: 'Both Queries and Mutations', value: 'both' },
    { text: 'Queries Only', value: 'queries' },
    { text: 'Mutations Only', value: 'mutations' },
  ];

  /** Options for Regex filter */
  filterTypeOptions = [
    { text: 'Exclude Matching (default)', value: 'exclude' },
    { text: 'Include Matching Only', value: 'include' },
  ];

  constructor(
    private sharedService: SharedService,
    private cdr: ChangeDetectorRef
  ) {
    super();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'SQL Logging';
  }

  protected initDashboard(): void {
    this.startAutoRefresh();
  }

  protected async loadData(): Promise<void> {
    await this.checkUserPermissions();
    if (this.isOwner) {
      await this.loadSqlLoggingConfig();
      await this.loadActiveSessions();
    }
  }

  override ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    super.ngOnDestroy();
  }

  /**
   * Starts the auto-refresh timer for session data.
   * Only refreshes when autoRefresh is enabled and user is Owner.
   *
   * @private
   */
  private startAutoRefresh() {
    interval(this.refreshInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.autoRefresh && this.isOwner) {
          this.loadActiveSessions();
          if (this.selectedSession) {
            this.loadSessionLog(this.selectedSession);
          }
        }
      });
  }

  /**
   * Checks if the current user has Owner privileges required for SQL logging.
   * Updates the isOwner flag and handles error states.
   *
   * @private
   */
  private async checkUserPermissions() {
    try {
      // Try multiple ways to get the current user
      const md = new Metadata();
      const currentUser = md.CurrentUser;

      console.log('Method 1 - Metadata.CurrentUser:', {
        email: currentUser?.Email,
        type: currentUser?.Type,
        name: currentUser?.Name,
        id: currentUser?.ID,
      });

      // Use the current user from Metadata
      const userToCheck = currentUser;

      if (userToCheck && userToCheck.Type?.trim().toLowerCase() === 'owner') {
        this.isOwner = true;
        console.log('User is an Owner - SQL logging features enabled');
      } else {
        this.isOwner = false;
        this.error = 'SQL logging requires Owner privileges';
        console.log('User is NOT an Owner. Type:', userToCheck?.Type);

        // Also check if it's a string comparison issue
        if (userToCheck) {
          console.log('Type value (raw):', JSON.stringify(userToCheck.Type));
          console.log('Type trimmed:', JSON.stringify(userToCheck.Type?.trim()));
          console.log('Type comparison:', userToCheck.Type?.trim().toLowerCase(), '===', 'owner', ':', userToCheck.Type?.trim().toLowerCase() === 'owner');
        }
      }
    } catch (error) {
      console.error('Error checking user permissions:', error);
      this.isOwner = false;
      this.error = 'Error checking permissions';
    }
  }

  /**
   * Opens the dialog for creating a new SQL logging session.
   * Sets default values for session name and filename.
   */
  openStartSessionDialog() {
    // Set default session name
    const currentUser = new Metadata().CurrentUser;
    this.newSessionOptions.sessionName = `SQL Logging - ${currentUser?.Name || currentUser?.Email || 'Unknown'} - ${new Date().toLocaleString()}`;
    this.newSessionOptions.fileName = `sql-log-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
    this.showStartSessionDialog = true;
  }

  /**
   * Creates and starts a new SQL logging session with the configured options.
   * Shows success/error notifications and refreshes the sessions list.
   */
  async startNewSession() {
    try {
      this.loading = true;

      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const mutation = `
        mutation StartSqlLogging($input: StartSqlLoggingInput!) {
          startSqlLogging(input: $input) {
            id
            filePath
            startTime
            statementCount
            sessionName
            filterByUserId
            options {
              formatAsMigration
              statementTypes
              prettyPrint
            }
          }
        }
      `;

      const variables = {
        input: {
          fileName: this.newSessionOptions.fileName,
          filterToCurrentUser: this.newSessionOptions.filterToCurrentUser,
          options: {
            formatAsMigration: this.newSessionOptions.formatAsMigration,
            statementTypes: this.newSessionOptions.statementTypes,
            prettyPrint: this.newSessionOptions.prettyPrint,
            sessionName: this.newSessionOptions.sessionName,
            // Regex Filter Option
            filterPatterns: this.parseFilterPatterns(this.newSessionOptions.filterPatterns),
            filterType: this.newSessionOptions.filterType,
            verboseOutput: this.newSessionOptions.verboseOutput,
            defaultSchemaName: this.newSessionOptions.defaultSchemaName,
          },
        },
      };

      const result = await dataProvider.ExecuteGQL(mutation, variables);

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const newSession = result?.startSqlLogging;

      if (!newSession) {
        throw new Error('Failed to start SQL logging session - no session data returned');
      }

      MJNotificationService.Instance.CreateSimpleNotification(`SQL logging session started: ${newSession.sessionName}`, 'success', 5000);

      this.showStartSessionDialog = false;
      await this.loadActiveSessions();
      this.selectSession(newSession);
    } catch (error: any) {
      console.error('Error starting SQL logging session:', error);
      MJNotificationService.Instance.CreateSimpleNotification(`Error: ${error.message || 'Failed to start SQL logging session'}`, 'error', 5000);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Executes the stop operation for a specific SQL logging session.
   * Called after user confirms via the confirmation dialog.
   *
   * @param session - The session object to stop
   */
  private async executeStopSession(session: SqlLoggingSession) {
    try {
      this.loading = true;

      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const mutation = `
        mutation StopSqlLogging($sessionId: String!) {
          stopSqlLogging(sessionId: $sessionId)
        }
      `;

      const result = await dataProvider.ExecuteGQL(mutation, { sessionId: session.id });

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      MJNotificationService.Instance.CreateSimpleNotification('SQL logging session stopped', 'success', 3000);

      if (this.selectedSession?.id === session.id) {
        this.selectedSession = null;
        this.logContent = '';
      }

      await this.loadActiveSessions();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop SQL logging session';
      console.error('Error stopping SQL logging session:', error);
      MJNotificationService.Instance.CreateSimpleNotification(`Error: ${errorMessage}`, 'error', 5000);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Executes the stop operation for all active SQL logging sessions.
   * Called after user confirms via the confirmation dialog.
   */
  private async executeStopAllSessions() {
    try {
      this.loading = true;

      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const mutation = `
        mutation StopAllSqlLogging {
          stopAllSqlLogging
        }
      `;

      const result = await dataProvider.ExecuteGQL(mutation, {});

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      MJNotificationService.Instance.CreateSimpleNotification('All SQL logging sessions stopped', 'success', 3000);

      this.selectedSession = null;
      this.logContent = '';
      await this.loadActiveSessions();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop all SQL logging sessions';
      console.error('Error stopping all SQL logging sessions:', error);
      MJNotificationService.Instance.CreateSimpleNotification(`Error: ${errorMessage}`, 'error', 5000);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Selects a session for viewing and loads its log content.
   *
   * @param session - The session to select
   */
  selectSession(session: any) {
    this.selectedSession = session;
    this.loadSessionLog(session);
  }

  /**
   * Loads the log file content for a specific session using real-time GraphQL query.
   * Reads actual SQL statements from the log file on the server.
   *
   * @param session - The session whose log to load
   */
  async loadSessionLog(session: any) {
    try {
      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const query = `
        query ReadSqlLogFile($sessionId: String!, $maxLines: Int) {
          readSqlLogFile(sessionId: $sessionId, maxLines: $maxLines)
        }
      `;

      const variables = {
        sessionId: session.id,
        maxLines: 1000, // Limit to last 1000 lines for performance
      };

      const result = await dataProvider.ExecuteGQL(query, variables);

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const logContent = result?.readSqlLogFile || '';

      // Add session header information (show only filename for security)
      const fileName = session.filePath ? session.filePath.split(/[\\\/]/).pop() : 'unknown';
      const header =
        `-- =====================================================\n` +
        `-- SQL Log File: ${fileName}\n` +
        `-- Session: ${session.sessionName}\n` +
        `-- Started: ${new Date(session.startTime).toLocaleString()}\n` +
        `-- Statements Captured: ${session.statementCount}\n` +
        `-- User Filter: ${session.filterByUserId || 'All Users'}\n` +
        `-- Statement Types: ${session.options?.statementTypes || 'both'}\n` +
        `-- Pretty Print: ${session.options?.prettyPrint ? 'Yes' : 'No'}\n` +
        `-- Migration Format: ${session.options?.formatAsMigration ? 'Yes' : 'No'}\n` +
        `-- =====================================================\n\n`;

      this.logContent = header + (logContent || '-- No SQL statements captured yet --');
    } catch (error: any) {
      console.error('Error loading session log:', error);
      this.logContent =
        `-- Error loading log file --\n-- ${error.message || 'Unknown error occurred'} --\n\n` +
        `-- Session Info --\n` +
        `-- File: ${session.filePath}\n` +
        `-- Session: ${session.sessionName}\n` +
        `-- Started: ${new Date(session.startTime).toLocaleString()}\n`;
    }
  }

  /**
   * Loads the SQL logging configuration from the server.
   * Updates component state with current settings and capabilities.
   *
   * @private
   */
  async loadSqlLoggingConfig() {
    try {
      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const query = `
        query SqlLoggingConfig {
          sqlLoggingConfig {
            enabled
            allowedLogDirectory
            maxActiveSessions
            autoCleanupEmptyFiles
            sessionTimeout
            activeSessionCount
            defaultOptions {
              formatAsMigration
              statementTypes
              batchSeparator
              prettyPrint
              logRecordChangeMetadata
              retainEmptyLogFiles
            }
          }
        }
      `;

      const result = await dataProvider.ExecuteGQL(query, {});

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Debug logging to understand the response structure
      console.log('SQL Logging Config Result:', result);
      console.log('Result keys:', Object.keys(result || {}));
      console.log('Direct result.sqlLoggingConfig:', result?.sqlLoggingConfig);

      // Access the data directly from the result, matching AI prompt pattern
      const configData = result?.sqlLoggingConfig;
      console.log('Extracted config data:', configData);

      this.sqlLoggingConfig = configData || null;
      this.configEnabled = this.sqlLoggingConfig?.enabled || false;
      this.cdr.detectChanges();

      console.log('Component state after update:');
      console.log('  this.sqlLoggingConfig:', this.sqlLoggingConfig);
      console.log('  this.configEnabled:', this.configEnabled);
      console.log('  this.isOwner:', this.isOwner);
    } catch (error: any) {
      console.error('Error loading SQL logging config:', error);
      this.error = error.message || 'Failed to load SQL logging configuration';
    }
  }

  /**
   * Loads the list of currently active SQL logging sessions.
   * Updates the activeSessions array and handles session selection state.
   *
   * @private
   */
  async loadActiveSessions() {
    try {
      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const query = `
        query ActiveSqlLoggingSessions {
          activeSqlLoggingSessions {
            id
            filePath
            startTime
            statementCount
            sessionName
            filterByUserId
            options {
              formatAsMigration
              statementTypes
              prettyPrint
            }
          }
        }
      `;

      const result = await dataProvider.ExecuteGQL(query, {});

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      // Debug logging to understand the response structure
      console.log('Active Sessions Result:', result);
      console.log('Result keys:', Object.keys(result || {}));

      // Access the data directly from the result, matching AI prompt pattern
      const sessionsData = result?.activeSqlLoggingSessions;
      console.log('Extracted sessions data:', sessionsData);

      this.activeSessions = sessionsData || [];
      this.cdr.detectChanges();

      // Update selected session if it still exists
      if (this.selectedSession) {
        const selectedId = this.selectedSession.id;
        const stillExists = this.activeSessions.find((s) => s.id === selectedId);
        if (stillExists) {
          this.selectedSession = stillExists;
        } else {
          this.selectedSession = null;
          this.logContent = '';
        }
      }
    } catch (error: any) {
      console.error('Error loading active sessions:', error);
    }
  }

  /**
   * Calculates and formats the duration of a logging session.
   *
   * @param startTime - ISO string of when the session started
   * @returns Formatted duration string (e.g., "2h 30m", "45m 23s", "12s")
   */
  getSessionDuration(startTime: string): string {
    const start = new Date(startTime);
    const now = new Date();
    const diff = now.getTime() - start.getTime();

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Refreshes user data and re-checks permissions.
   * Useful when user privileges have been updated.
   */
  async refreshUserPermissions() {
    console.log('Refreshing user permissions...');
    this.loading = true;

    try {
      // Try to refresh SharedService data
      await SharedService.RefreshData(false);

      // Wait a moment for data to propagate
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Re-check permissions
      await this.checkUserPermissions();

      console.log('Permissions refreshed');
    } catch (error) {
      console.error('Error refreshing permissions:', error);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Extracts the filename from a full file path for security purposes.
   * Only shows the filename, not the full server path.
   *
   * @param filePath - Full file path from server
   * @returns Just the filename portion
   */
  getFileName(filePath: string): string {
    if (!filePath) return 'unknown';
    return filePath.split(/[\\\/]/).pop() || 'unknown';
  }

  /**
   * Calculates the total number of SQL statements across all active sessions.
   * @returns Total statement count
   */
  getTotalStatementCount(): number {
    return this.activeSessions.reduce((sum, session) => sum + (session.statementCount || 0), 0);
  }

  /**
   * Parses a string of filter patterns (comma or newline separated) into an array
   * @param patternsString - Comma or newline separated patterns
   * @returns Array of pattern strings, or undefined if empty
   */
  private parseFilterPatterns(patternsString: string): string[] | undefined {
    if (!patternsString || !patternsString.trim()) {
      return undefined;
    }

    /** Split by comma or newline, trim whitespace, filter empty */
    return patternsString
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * Toggles the log viewer between normal and expanded (fullscreen) mode.
   */
  toggleLogViewerExpand() {
    this.isLogViewerExpanded = !this.isLogViewerExpanded;
  }

  /**
   * Toggles the start session dialog between normal and fullscreen mode.
   */
  toggleStartDialogFullscreen() {
    this.isStartDialogFullscreen = !this.isStartDialogFullscreen;
  }

  /**
   * Handles keyboard events for the component.
   * Closes expanded log viewer or confirmation dialog when Escape is pressed.
   */
  @HostListener('document:keydown.escape')
  onEscapeKey() {
    if (this.showStopConfirmDialog) {
      this.cancelStopConfirm();
    } else if (this.isLogViewerExpanded) {
      this.isLogViewerExpanded = false;
    } else if (this.isStartDialogFullscreen) {
      this.isStartDialogFullscreen = false;
    } else if (this.showStartSessionDialog) {
      this.showStartSessionDialog = false;
    }
  }

  /**
   * Opens the confirmation dialog for stopping a single session.
   *
   * @param session - The session to stop
   * @param event - Optional event to stop propagation
   */
  openStopSessionConfirm(session: SqlLoggingSession, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    this.sessionToStop = session;
    this.isStoppingAll = false;
    this.showStopConfirmDialog = true;
  }

  /**
   * Opens the confirmation dialog for stopping all sessions.
   */
  openStopAllSessionsConfirm() {
    this.sessionToStop = null;
    this.isStoppingAll = true;
    this.showStopConfirmDialog = true;
  }

  /**
   * Closes the stop confirmation dialog without taking action.
   */
  cancelStopConfirm() {
    this.showStopConfirmDialog = false;
    this.sessionToStop = null;
    this.isStoppingAll = false;
  }

  /**
   * Confirms and executes the stop action (single session or all sessions).
   */
  async confirmStopSession() {
    if (this.isStoppingAll) {
      await this.executeStopAllSessions();
    } else if (this.sessionToStop) {
      await this.executeStopSession(this.sessionToStop);
    }
    this.cancelStopConfirm();
  }

  /**
   * Debug method to test contextUser flow for SQL filtering.
   * This shows how the new architecture handles user context without storing email in provider.
   */
  async debugUserEmail() {
    try {
      this.loading = true;

      const dataProvider = Metadata.Provider as GraphQLDataProvider;
      const query = `
        query DebugCurrentUserEmail {
          debugCurrentUserEmail
        }
      `;

      const result = await dataProvider.ExecuteGQL(query, {});

      if (result.errors) {
        throw new Error(result.errors[0].message);
      }

      const debugInfo = result?.debugCurrentUserEmail || 'No debug info returned';

      alert(`Context User Info:\n\n${debugInfo}\n\nThe system now passes user context through method calls instead of storing it in the provider.`);
    } catch (error: any) {
      console.error('Error getting context user info:', error);
      alert(`Error: ${error.message || 'Failed to get debug info'}`);
    } finally {
      this.loading = false;
    }
  }
}
