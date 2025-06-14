import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { DialogsModule } from '@progress/kendo-angular-dialog';
import { InputsModule, CheckBoxModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { LabelModule } from '@progress/kendo-angular-label';
import { Metadata } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { MJNotificationService } from '@memberjunction/ng-notifications';

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
  selector: 'mj-sql-logging',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonsModule,
    DialogsModule,
    InputsModule,
    DropDownsModule,
    LabelModule,
    CheckBoxModule
  ],
  templateUrl: './sql-logging.component.html',
  styleUrls: ['./sql-logging.component.scss']
})
export class SqlLoggingComponent implements OnInit, OnDestroy {
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
  sqlLoggingConfig: any = null;
  
  /** List of currently active SQL logging sessions */
  activeSessions: any[] = [];
  
  /** Currently selected session for viewing logs */
  selectedSession: any = null;
  
  /** Content of the currently viewed log file */
  logContent = '';
  
  /** Whether to automatically refresh session data */
  autoRefresh = false;
  
  /** Interval in milliseconds for auto-refresh functionality */
  refreshInterval = 5000; // 5 seconds
  
  /** Whether the start session dialog is currently visible */
  showStartSessionDialog = false;
  
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
    sessionName: ''
  };
  
  /** Available options for SQL statement type filtering */
  statementTypeOptions = [
    { text: 'Both Queries and Mutations', value: 'both' },
    { text: 'Queries Only', value: 'queries' },
    { text: 'Mutations Only', value: 'mutations' }
  ];

  constructor(private sharedService: SharedService) {}

  /**
   * Component initialization.
   * Checks user permissions and loads initial data if authorized.
   */
  async ngOnInit() {
    await this.checkUserPermissions();
    if (this.isOwner) {
      await this.loadSqlLoggingConfig();
      await this.loadActiveSessions();
      this.startAutoRefresh();
    }
  }

  /**
   * Component cleanup.
   * Stops auto-refresh and cleans up subscriptions.
   */
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
        id: currentUser?.ID
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
            sessionName: this.newSessionOptions.sessionName
          }
        }
      };
      
      const result = await dataProvider.ExecuteGQL(mutation, variables);
      
      if (result.errors) {
        throw new Error(result.errors[0].message);
      }
      
      const newSession = result?.startSqlLogging;
      
      if (!newSession) {
        throw new Error('Failed to start SQL logging session - no session data returned');
      }
      
      MJNotificationService.Instance.CreateSimpleNotification(
        `SQL logging session started: ${newSession.sessionName}`,
        'success',
        5000
      );
      
      this.showStartSessionDialog = false;
      await this.loadActiveSessions();
      this.selectSession(newSession);
      
    } catch (error: any) {
      console.error('Error starting SQL logging session:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        `Error: ${error.message || 'Failed to start SQL logging session'}`,
        'error',
        5000
      );
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Stops a specific SQL logging session.
   * 
   * @param session - The session object to stop
   * @param event - Optional event to stop propagation
   */
  async stopSession(session: any, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    if (!confirm(`Stop SQL logging session "${session.sessionName}"?`)) {
      return;
    }
    
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
      
      MJNotificationService.Instance.CreateSimpleNotification(
        'SQL logging session stopped',
        'success',
        3000
      );
      
      if (this.selectedSession?.id === session.id) {
        this.selectedSession = null;
        this.logContent = '';
      }
      
      await this.loadActiveSessions();
      
    } catch (error: any) {
      console.error('Error stopping SQL logging session:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        `Error: ${error.message || 'Failed to stop SQL logging session'}`,
        'error',
        5000
      );
    } finally {
      this.loading = false;
    }
  }
  
  /**
   * Stops all currently active SQL logging sessions.
   * Prompts for confirmation before proceeding.
   */
  async stopAllSessions() {
    if (!confirm('Stop ALL active SQL logging sessions?')) {
      return;
    }
    
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
      
      MJNotificationService.Instance.CreateSimpleNotification(
        'All SQL logging sessions stopped',
        'success',
        3000
      );
      
      this.selectedSession = null;
      this.logContent = '';
      await this.loadActiveSessions();
      
    } catch (error: any) {
      console.error('Error stopping all SQL logging sessions:', error);
      MJNotificationService.Instance.CreateSimpleNotification(
        `Error: ${error.message || 'Failed to stop all SQL logging sessions'}`,
        'error',
        5000
      );
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
   * Loads the log file content for a specific session.
   * Currently shows placeholder content; full implementation would read actual file.
   * 
   * @param session - The session whose log to load
   */
  async loadSessionLog(session: any) {
    try {
      // For now, show the file path. In a full implementation,
      // you would read the file contents from the server
      this.logContent = `-- SQL Log File: ${session.filePath}\n-- Session: ${session.sessionName}\n-- Started: ${new Date(session.startTime).toLocaleString()}\n-- Statements: ${session.statementCount}\n\n-- Log contents would appear here...\n-- This requires file reading capability on the server`;
    } catch (error) {
      console.error('Error loading session log:', error);
      this.logContent = 'Error loading log file';
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
      
      // Update selected session if it still exists
      if (this.selectedSession) {
        const stillExists = this.activeSessions.find(s => s.id === this.selectedSession.id);
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
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Re-check permissions
      await this.checkUserPermissions();
      
      console.log('Permissions refreshed');
    } catch (error) {
      console.error('Error refreshing permissions:', error);
    } finally {
      this.loading = false;
    }
  }
}