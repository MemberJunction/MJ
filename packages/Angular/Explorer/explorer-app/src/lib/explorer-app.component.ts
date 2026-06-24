/**
 * MemberJunction Explorer Application Component
 *
 * Complete branded entry point for Explorer-style applications.
 * Provides login screen with MJ branding and wraps mj-shell for authenticated users.
 *
 * Usage:
 *   <mj-explorer-app></mj-explorer-app>
 */

import { Component, OnInit, OnDestroy, Inject, Optional, ViewEncapsulation, ChangeDetectorRef, ViewContainerRef, ComponentRef, Type, EnvironmentInjector } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, take, takeUntil } from 'rxjs/operators';
import { CompositeKey, LogError, Metadata, SetProductionStatus } from '@memberjunction/core';
import { MJAuthBase, StandardUserInfo, AuthErrorType } from '@memberjunction/ng-auth-services';
import { WorkspaceInitializerService } from '@memberjunction/ng-workspace-initializer';
import { MJEnvironmentConfig, MJ_ENVIRONMENT } from '@memberjunction/ng-bootstrap';
import { SystemValidationService, ServerConnectivityService } from '@memberjunction/ng-explorer-core';
import { NavigationService, AgentContextUpdate } from '@memberjunction/ng-shared';
import { AgentClientService } from '@memberjunction/ng-agent-client';
import { ClientToolResultEvent } from '@memberjunction/ai-agent-client';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationBridgeService } from '@memberjunction/ng-conversations';
import { ApplicationManager, WorkspaceStateManager } from '@memberjunction/ng-base-application';
import { AppContextSnapshot } from '@memberjunction/ai-core-plus';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJ_PRE_SHELL_GUARD, PreShellGuard } from './pre-shell-guard';
@Component({
  standalone: false,
  selector: 'mj-explorer-app',
  templateUrl: './explorer-app.component.html',
  styleUrls: ['./explorer-app.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class MJExplorerAppComponent extends BaseAngularComponent implements OnInit, OnDestroy {
  /**
   * Unified theme storage key. Same value the inline pre-paint script in
   * index.html and ThemeService both read/write. Single source of truth so
   * the login-screen toggle, the post-login ThemeService, and the inline
   * first-paint script all stay in sync.
   */
  private static readonly THEME_STORAGE_KEY = 'mj-theme';

  public title = 'MJ Explorer';
  public initialPath = '/';
  public HasError = false;
  public ErrorMessage: string = '';
  public subHeaderText: string = "Welcome back! Please log in to your account.";
  public showValidationOnly = false;
  /** True when the current URL is the OAuth callback route - used for conditional rendering */
  public isOAuthCallback = false;
  /** Tracks whether the login page is in dark mode */
  public IsDarkMode = false;
  /** True when the current route is the full Conversations/Chat workspace — hides the chat overlay */
  public isChatRoute = false;
  /** Suppresses chat overlay during initial app load — set true after workspace initializes */
  public IsChatOverlayReady = false;

  /** Component rendered by PreShellGuard (blocks the shell until dismissed) */
  private _preShellOverlayRef: ComponentRef<unknown> | null = null;
  /** Whether a pre-shell guard overlay is blocking the shell */
  preShellBlocked = false;

  /** Application context snapshot for AI agent awareness — updated on every app/tab transition */
  public AppContextSnapshot: AppContextSnapshot | null = null;

  /** Shell-header height in pixels — matches `.shell-header { height: 60px }`. */
  private static readonly SHELL_HEADER_PX = 60;

  /**
   * Top boundary (in px) the chat overlay bubble cannot be dragged past. The
   * shell-header is 60px tall, but if the server-connectivity banner is showing
   * it sits above the shell-header and pushes everything down. The banner
   * component publishes its height to `--mj-connectivity-banner-height` on
   * `<html>`, so we add it in. Re-evaluated on every change-detection pass —
   * Angular's animation events fire CD when the banner show/hides finish.
   */
  public get ChatOverlayTopBoundaryPx(): number {
    const bannerHeight = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--mj-connectivity-banner-height')
    ) || 0;
    return MJExplorerAppComponent.SHELL_HEADER_PX + bannerHeight;
  }

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    @Inject(DOCUMENT) public document: Document,
    @Inject(MJ_ENVIRONMENT) private environment: MJEnvironmentConfig,
    public authBase: MJAuthBase,
    private workspaceInit: WorkspaceInitializerService,
    private validationService: SystemValidationService,
    private connectivityService: ServerConnectivityService,
    private agentClient: AgentClientService,
    private navigationService: NavigationService,
    private bridge: ConversationBridgeService,
    // Injected (not just used statically) so the root singleton is constructed
    // before handleLogin runs. Magic-link logs in instantly (token already in the
    // URL hash, no redirect round-trip), so without this injection handleLogin can
    // fire before anything else constructs MJNotificationService, leaving
    // MJNotificationService.Instance undefined -> "ShouldSuppressToast" crash.
    private notifications: MJNotificationService,
    private appManager: ApplicationManager,
    private workspaceState: WorkspaceStateManager,
    private cdr: ChangeDetectorRef,
    @Optional() @Inject(MJ_PRE_SHELL_GUARD) private preShellGuard: PreShellGuard | null,
    private environmentInjector: EnvironmentInjector,
    private viewContainerRef: ViewContainerRef,
  ) {
    super();
    this.registerClientTools();
  }

  /**
   * Handle successful login and initialize the application
   */
  async handleLogin(token: string, userInfo: StandardUserInfo) {
    if (!token) return;

    try {
      // Delegate all initialization logic to the service
      const result = await this.workspaceInit.initializeWorkspace(token, userInfo, {
        GRAPHQL_URI: this.environment.GRAPHQL_URI,
        GRAPHQL_WS_URI: this.environment.GRAPHQL_WS_URI,
        MJ_CORE_SCHEMA_NAME: this.environment.MJ_CORE_SCHEMA_NAME
      });

      if (result.success) {
        // Start the client tool session so agents can invoke browser-side tools.
        // Uses the GraphQLDataProvider's sessionId which is the PubSub correlation key.
        const provider = this.ProviderToUse as { sessionId?: string };
        if (provider.sessionId) {
          this.agentClient.StartSession(provider.sessionId);
        }

        // Suppress toast for agent completions when the user is actively viewing the conversation
        this.notifications.ShouldSuppressToast = (statusObj: Record<string, unknown>) => {
          const convoId = statusObj['conversationId'] as string;
          if (!convoId) return false;
          const isViewingConvo = this.bridge.ActiveConversationID$.value === convoId
            && (this.bridge.OverlayActive$.value || this.isChatRoute);
          return isViewingConvo;
        };

        // Start server connectivity monitoring
        this.startConnectivityMonitoring();

        // Chat overlay can now render — workspace is initialized
        this.IsChatOverlayReady = true;
        this.cdr.detectChanges();

        // Check if a pre-shell guard wants to block the shell (e.g., onboarding wizard)
        if (this.preShellGuard) {
          const blockComponent = await this.preShellGuard.CheckPreShellBlock(userInfo);
          if (blockComponent) {
            this.preShellBlocked = true;
            this.cdr.detectChanges();
            this.renderPreShellOverlay(blockComponent);
            return;
          }
        }

        // Navigate to initial route
        if (this.initialPath === '/') {
          // use first nav item url instead
          setTimeout(() => {
            // Find the KendoDrawer element, and simulate a click for the first item
            const drawerElement = this.document.querySelector('li.k-drawer-item.k-level-0') as HTMLElement;
            if (drawerElement) drawerElement.click();
          }, 10); // wait for the drawer to finish rerender and then do this
        } else {
          this.router.navigateByUrl(this.initialPath, { replaceUrl: true });
        }
      } else if (result.error) {
        // Handle errors based on type
        if (result.error.type === 'no_roles') {
          // Check if a pre-shell guard wants to handle the no_roles case (e.g., onboarding wizard)
          if (this.preShellGuard) {
            const blockComponent = await this.preShellGuard.CheckPreShellBlock(userInfo);
            if (blockComponent) {
              this.preShellBlocked = true;
              this.renderPreShellOverlay(blockComponent);
              return;
            }
          }
          // Show validation banner instead of generic error
          this.showValidationOnly = true;
          this.HasError = true;
          return; // Don't throw, just return to show validation banner
        }

        // Try auth retry for retryable errors
        const retried = await this.workspaceInit.handleAuthRetry(result.error, window.location.pathname);

        if (!retried) {
          // Show error to user
          this.HasError = true;
          this.ErrorMessage = result.error.userMessage || result.error.message;
          LogError('Error Logging In: ' + result.error.message);
          throw new Error(result.error.message);
        }
      }
    } catch (err: unknown) {
      this.HasError = true;
      this.ErrorMessage = err instanceof Error ? err.message : String(err);
      LogError('Error Logging In: ' + this.ErrorMessage);
      throw err;
    }
  }

  async setupAuth() {
    // Auth provider already initialized by APP_INITIALIZER

    // v3.0 API - Clean abstraction using observables
    this.authBase.getUserInfo()
      .pipe(take(1))
      .subscribe({
        next: async (userInfo) => {
          if (userInfo) {
            // v3.0 API - No more provider-specific logic!
            const token = await this.authBase.getIdToken();

            if (token) {
              await this.handleLogin(token, userInfo);
            } else {
              // Token expired or missing — attempt a full refresh which will
              // redirect to the identity provider if interaction is required.
              console.warn('User info available but no token found, attempting refresh...');
              try {
                const refreshedToken = await this.authBase.refreshToken();
                await this.handleLogin(refreshedToken.idToken, userInfo);
              } catch (e) {
                console.error('Token refresh failed, redirecting to login:', e);
                // refreshToken() normally redirects (and never returns) when
                // interaction is required.  If we reach here, force login as
                // a last-resort safety net.
                this.authBase.login().subscribe();
              }
            }
          }
        },
        error: (err: unknown) => {
          LogError('Error Logging In: ' + err);

          // v3.0 API - Use semantic error classification
          const authError = this.authBase.classifyError(err);

          switch (authError.type) {
            case AuthErrorType.NO_ACTIVE_SESSION:
              this.subHeaderText = "Welcome back! Please log in to your account.";
              break;
            case AuthErrorType.INTERACTION_REQUIRED:
            case AuthErrorType.TOKEN_EXPIRED:
              this.subHeaderText = "Your session has expired. Please log in to your account.";
              break;
            default:
              this.subHeaderText = authError.userMessage || "Welcome back! Please log in to your account.";
          }

          // Auth state is managed by the provider itself via observables
        }
      });

    // Check auth state - the provider manages this internally now
    this.authBase.isAuthenticated()
      .pipe(take(1))
      .subscribe((loggedIn: boolean) => {
        if (!loggedIn) {
          // Instead of kicking off the login process,
          // just display the login screen to the user
          // Auth state is already false if we're here
        }
      });

    this.initialPath = window.location.pathname + (window.location.search ? window.location.search : '');
  }

  ngOnInit() {
    SetProductionStatus(this.environment.production);

    // Check if this is the OAuth callback route - used for conditional rendering in template
    // Note: We still run setupAuth() to restore the user's session
    this.isOAuthCallback = window.location.pathname.startsWith('/oauth/callback');

    // Track route changes to hide chat overlay on Conversations workspace
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        const url = (event as NavigationEnd).urlAfterRedirects || (event as NavigationEnd).url;
        this.isChatRoute = url.includes('/chat') || url.includes('/conversations');
      });

    // Track active app changes for AI agent context awareness
    this.appManager.ActiveApp
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateAppContext());

    // Track tab changes for active nav item context
    this.workspaceState.Configuration
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateAppContext());

    // Track agent context updates from resource components
    this.navigationService.AgentContextUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((update) => this.handleAgentContextUpdate(update));

    // Apply saved or OS-preferred theme for the login page
    this.applyLoginTheme();

    // Re-apply login theme when the user logs out (ThemeService.Reset() clears data-theme)
    this.authBase.isAuthenticated()
      .pipe(takeUntil(this.destroy$))
      .subscribe((authenticated: boolean) => {
        if (!authenticated) {
          this.applyThemeToDOM();
        }
      });

    // Validate environment before attempting auth setup
    const envValid = this.validateEnvironment();
    if (!envValid) {
      this.HasError = true;
      this.ErrorMessage = 'Environment configuration is incomplete. See errors above.';
      return;
    }

    // Always run auth setup - this restores the user's session
    // For OAuth callback, once authenticated, the OAuthCallbackComponent handles the code exchange
    this.setupAuth();
  }

  ngOnDestroy() {
    this.connectivityService.Stop();
    this.destroy$.next();
    this.destroy$.complete();
  }

  /** Handle tool execution events from the chat overlay */
  public OnOverlayToolExecuted(_event: ClientToolResultEvent): void {
    // Tool results are self-evident from the UI change (e.g., navigation).
    // No toast needed — the action itself is the feedback.
  }

  /** Handle "open entity record" events from the chat overlay */
  public OnOverlayOpenRecord(event: { entityName: string; compositeKey: CompositeKey }): void {
    this.navigationService.OpenEntityRecord(event.entityName, event.compositeKey);
  }

  /** Handle "open full chat workspace" from the chat overlay — navigate to the Conversations tab with the active conversation */
  public OnOverlayOpenFullChatWorkspace(conversationId: string | null): void {
    const params: Record<string, unknown> = {};
    if (conversationId) {
      params['conversationId'] = conversationId;
    }
    const md = this.ProviderToUse;
    const chatApp = md.Applications.find(a => a.Name === 'Chat');
    this.navigationService.OpenNavItemByName('Conversations', params, chatApp?.ID);
  }

  /** Build and update the application context snapshot for AI agent awareness */
  private async updateAppContext(): Promise<void> {
    const activeApp = this.appManager.GetActiveApp();
    if (!activeApp) {
      this.AppContextSnapshot = null;
      return;
    }

    const navItems = await activeApp.GetNavItems();
    const activeTabId = this.workspaceState.GetActiveTabId();
    const config = this.workspaceState.GetConfiguration();
    const activeTab = config?.tabs.find(t => t.id === activeTabId);
    const activeNavItemName = activeTab?.configuration?.['navItemName'] as string | undefined;

    const activeNavItem = activeNavItemName
      ? navItems.find(n => n.Label === activeNavItemName)
      : navItems.find(n => n.isDefault) || navItems[0];

    const md = this.ProviderToUse;
    const currentUser = md.CurrentUser;

    this.AppContextSnapshot = {
      App: {
        Name: activeApp.Name,
        Description: activeApp.Description || ''
      },
      ActiveNavItem: {
        Name: activeNavItem?.Label || 'Unknown',
        Description: activeNavItem?.Description,
        ResourceType: activeNavItem?.ResourceType
      },
      OtherNavItems: navItems
        .filter(n => n.Label !== activeNavItem?.Label && n.Status !== 'Disabled' && n.Status !== 'Pending')
        .map(n => ({ Name: n.Label, Description: n.Description })),
      User: {
        Name: currentUser?.Name || '',
        Roles: currentUser?.UserRoles?.map(r => r.Role) || []
      }
    };
    // Publish to any embedded chat-area subscribers (Form Builder
    // cockpit, future domain dashboards). The floating overlay sees
    // the change directly via its [AppContext] template binding; this
    // observable channel is for chats mounted outside the overlay.
    this.navigationService.PublishAppContextSnapshot(this.AppContextSnapshot);
    this.cdr.detectChanges();

    // Keep the bridge in sync with workspace visibility.
    // When the user is in the Chat app viewing Conversations, the workspace is "active"
    // for toast suppression. When they switch to any other app/tab, it's not.
    const isChatWorkspaceVisible = activeNavItemName === 'Conversations'
      && activeApp.Name === 'Chat';
    this.bridge.NotifyWorkspaceActive(isChatWorkspaceVisible);
    if (!isChatWorkspaceVisible) {
      // Clear the bridge's active conversation so toast suppression doesn't
      // match on a stale ID from the previous Chat session
      this.bridge.SetActiveFromWorkspace(null);
    }
  }

  /**
   * Handle agent context/tools updates from resource components.
   * Updates the AppContextSnapshot.DashboardContext so the next agent message
   * includes the dashboard's current state. Also manages tool registration.
   */
  private handleAgentContextUpdate(update: AgentContextUpdate): void {
    const callerName = update.Caller?.constructor?.name ?? 'unknown';

    // Update AdditionalContext in the current snapshot
    if (update.AgentContext !== undefined && this.AppContextSnapshot) {
      this.AppContextSnapshot = {
        ...this.AppContextSnapshot,
        AdditionalContext: update.AgentContext,
      };
      // Republish so any embedded chat-area subscribers (Form Builder
      // cockpit, future dashboards with their own AI pane) pick up the
      // new dashboard slice — the floating overlay sees it via the
      // [AppContext] template binding regardless.
      this.navigationService.PublishAppContextSnapshot(this.AppContextSnapshot);
      this.cdr.detectChanges();
    }

    // Register/update client tools
    if (update.AgentClientTools !== undefined) {
      // Unregister any previously registered dashboard tools
      if (this.activeDashboardToolNames.length > 0) {
        for (const toolName of this.activeDashboardToolNames) {
          this.agentClient.UnregisterTool(toolName);
        }
      }

      // Register the new tools
      this.activeDashboardToolNames = update.AgentClientTools.map(t => t.Name);
      for (const tool of update.AgentClientTools) {
        this.agentClient.RegisterTool({
          Name: tool.Name,
          Description: tool.Description,
          ParameterSchema: tool.ParameterSchema,
          Handler: tool.Handler as (params: Record<string, unknown>) => Promise<{ Success: boolean; Data?: Record<string, unknown>; ErrorMessage?: string }>,
        });
      }
    }
  }

  /** Names of currently registered dashboard-specific tools (for cleanup on switch) */
  private activeDashboardToolNames: string[] = [];

  /** Register Explorer-specific client tool handlers with the AgentClientService */
  private registerClientTools(): void {
    this.agentClient.RegisterTool({
      Name: 'NavigateToRecord',
      Description: 'Navigate the user to a specific entity record',
      ParameterSchema: {
        type: 'object',
        properties: {
          EntityName: { type: 'string' },
          RecordID: { type: 'string' }
        },
        required: ['EntityName', 'RecordID']
      },
      Handler: async (params) => {
        const entityName = String(params['EntityName']);
        const recordId = String(params['RecordID']);
        const md = this.ProviderToUse;
        const entityInfo = md.Entities.find(e => e.Name === entityName);
        const pkey = new CompositeKey();
        if (entityInfo) {
          pkey.LoadFromURLSegment(entityInfo, recordId);
        } else {
          pkey.KeyValuePairs = [{ FieldName: 'ID', Value: recordId }];
        }
        this.navigationService.OpenEntityRecord(entityName, pkey);
        return { Success: true, Data: { Navigated: true } };
      }
    });

    this.agentClient.RegisterTool({
      Name: 'NavigateToApp',
      Description: 'Navigate to a specific application and optionally a nav item within it',
      ParameterSchema: {
        type: 'object',
        properties: {
          AppName: { type: 'string', description: 'Application name' },
          NavItemName: { type: 'string', description: 'Optional nav item/tab within the app' }
        },
        required: ['AppName']
      },
      Handler: async (params) => {
        const appName = String(params['AppName']);
        const navItemName = params['NavItemName'] ? String(params['NavItemName']) : undefined;

        // If currently in full chat workspace, hand conversation to overlay for continuity
        if (this.isChatRoute) {
          const activeConvoId = this.bridge.ActiveConversationID$.value;
          if (activeConvoId) {
            this.bridge.SwitchToOverlay(activeConvoId);
          }
        }

        // Resolve app ID and navigate
        const md = this.ProviderToUse;
        const app = md.Applications.find(a => a.Name.toLowerCase() === appName.toLowerCase());
        if (!app) {
          return { Success: false, ErrorMessage: `Application '${appName}' not found` };
        }
        if (navItemName) {
          await this.navigationService.OpenNavItemByName(navItemName, undefined, app.ID);
        } else {
          await this.navigationService.SwitchToApp(app.ID);
        }

        return { Success: true, Data: { Navigated: true, AppName: appName, NavItemName: navItemName } };
      }
    });

    this.agentClient.RegisterTool({
      Name: 'Sleep',
      Description: 'Wait for a specified number of seconds',
      ParameterSchema: {
        type: 'object',
        properties: {
          Seconds: { type: 'number', description: 'Number of seconds to wait (1-120)' }
        },
        required: ['Seconds']
      },
      Handler: async (params) => {
        const seconds = Math.min(120, Math.max(1, Number(params['Seconds']) || 5));
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        return { Success: true, Data: { SleptSeconds: seconds } };
      }
    });

    this.agentClient.RegisterTool({
      Name: 'CopyToClipboard',
      Description: 'Copy text to the user\'s clipboard. Use when the user asks to copy something or when generating content the user will want to paste elsewhere (SQL, code, formatted data).',
      ParameterSchema: {
        type: 'object',
        properties: {
          Text: { type: 'string', description: 'The text to copy to the clipboard' }
        },
        required: ['Text']
      },
      Handler: async (params) => {
        const text = String(params['Text'] || '');
        try {
          await navigator.clipboard.writeText(text);
          return { Success: true, Data: { CopiedLength: text.length } };
        } catch {
          return { Success: false, ErrorMessage: 'Clipboard access denied by browser' };
        }
      }
    });

    this.agentClient.RegisterTool({
      Name: 'ShowNotification',
      Description: 'Show a toast notification to the user. Use for confirmations, status updates, or alerts that don\'t need a chat message response.',
      ParameterSchema: {
        type: 'object',
        properties: {
          Message: { type: 'string', description: 'The notification message text' },
          Type: { type: 'string', description: 'Notification type: info, success, warning, or error', enum: ['info', 'success', 'warning', 'error'] },
          DurationMs: { type: 'number', description: 'How long to show the notification in milliseconds (default 3000)' }
        },
        required: ['Message']
      },
      Handler: async (params) => {
        const message = String(params['Message'] || '');
        const type = (String(params['Type'] || 'info')) as 'info' | 'success' | 'warning' | 'error';
        const duration = Number(params['DurationMs']) || 3000;
        this.notifications.CreateSimpleNotification(message, type, duration);
        return { Success: true, Data: { Shown: true } };
      }
    });

    this.agentClient.RegisterTool({
      Name: 'OpenBrowserTab',
      Description: 'Open a URL in a new browser tab. Use when the user asks to visit an external website, view documentation, or open any URL outside the current application.',
      ParameterSchema: {
        type: 'object',
        properties: {
          URL: { type: 'string', description: 'The full URL to open (must start with http:// or https://)' },
          Label: { type: 'string', description: 'Optional descriptive label for the tab' }
        },
        required: ['URL']
      },
      Handler: async (params) => {
        const url = String(params['URL'] || '');
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return { Success: false, ErrorMessage: 'URL must start with http:// or https://' };
        }
        window.open(url, '_blank', 'noopener,noreferrer');
        return { Success: true, Data: { OpenedURL: url } };
      }
    });

    this.agentClient.RegisterTool({
      Name: 'SetTheme',
      Description: 'Switch the application between dark mode and light mode. Use when the user asks for dark mode, light mode, or to toggle the theme.',
      ParameterSchema: {
        type: 'object',
        properties: {
          Mode: { type: 'string', description: 'The theme mode to set', enum: ['dark', 'light', 'toggle'] }
        },
        required: ['Mode']
      },
      Handler: async (params) => {
        const mode = String(params['Mode'] || 'toggle').toLowerCase();
        if (mode === 'toggle') {
          this.ToggleTheme();
        } else {
          this.IsDarkMode = mode === 'dark';
          localStorage.setItem(MJExplorerAppComponent.THEME_STORAGE_KEY, this.IsDarkMode ? 'dark' : 'light');
          this.applyThemeToDOM();
        }
        return { Success: true, Data: { CurrentMode: this.IsDarkMode ? 'dark' : 'light' } };
      }
    });
  }

  /**
   * Derive the health check URL from GRAPHQL_URI and start the connectivity polling service.
   */
  private startConnectivityMonitoring(): void {
    const healthUrl = new URL('/healthcheck', this.environment.GRAPHQL_URI).toString();
    this.connectivityService.Start(healthUrl);
  }

  /**
   * Validates that required environment variables are present before auth initialization.
   * Surfaces clear error messages via SystemValidationService instead of letting the app
   * crash with cryptic runtime errors like "can't read endsWith() on undefined".
   */
  private validateEnvironment(): boolean {
    const env = this.environment;
    let valid = true;

    const requiredFields: { key: keyof MJEnvironmentConfig; label: string }[] = [
      { key: 'GRAPHQL_URI', label: 'GraphQL HTTP endpoint URL' },
      { key: 'GRAPHQL_WS_URI', label: 'GraphQL WebSocket endpoint URL' },
      { key: 'AUTH_TYPE', label: 'Authentication provider type (msal or auth0)' },
      { key: 'MJ_CORE_SCHEMA_NAME', label: 'MJ Core schema name' },
    ];

    for (const field of requiredFields) {
      if (!env[field.key]) {
        this.validationService.addIssue({
          id: `env-missing-${String(field.key)}`,
          message: `Missing required environment variable: ${String(field.key)}`,
          severity: 'error',
          details: `The "${String(field.key)}" property is empty or missing in your environment configuration file.`,
          help: `Add ${String(field.key)} (${field.label}) to your environment.ts file. Example files are in src/environments/.`
        });
        valid = false;
      }
    }

    // Conditionally required based on AUTH_TYPE
    const authType = env.AUTH_TYPE?.toLowerCase();
    if (authType === 'msal') {
      valid = this.validateMsalFields(env) && valid;
    } else if (authType === 'auth0') {
      valid = this.validateAuth0Fields(env) && valid;
    }

    return valid;
  }

  private validateMsalFields(env: MJEnvironmentConfig): boolean {
    let valid = true;
    if (!env.CLIENT_ID) {
      this.validationService.addIssue({
        id: 'env-missing-CLIENT_ID',
        message: 'Missing required environment variable: CLIENT_ID',
        severity: 'error',
        details: 'MSAL authentication requires CLIENT_ID (Azure AD/Entra Application Client ID).',
        help: 'Add your Azure AD Application (client) ID to the environment file.'
      });
      valid = false;
    }
    if (!env.TENANT_ID) {
      this.validationService.addIssue({
        id: 'env-missing-TENANT_ID',
        message: 'Missing required environment variable: TENANT_ID',
        severity: 'error',
        details: 'MSAL authentication requires TENANT_ID (Azure AD/Entra Tenant ID).',
        help: 'Add your Azure AD Directory (tenant) ID to the environment file.'
      });
      valid = false;
    }
    return valid;
  }

  private validateAuth0Fields(env: MJEnvironmentConfig): boolean {
    let valid = true;
    if (!env.AUTH0_DOMAIN) {
      this.validationService.addIssue({
        id: 'env-missing-AUTH0_DOMAIN',
        message: 'Missing required environment variable: AUTH0_DOMAIN',
        severity: 'error',
        details: 'Auth0 authentication requires AUTH0_DOMAIN.',
        help: 'Add your Auth0 domain (e.g. myapp.us.auth0.com) to the environment file.'
      });
      valid = false;
    }
    if (!env.AUTH0_CLIENTID) {
      this.validationService.addIssue({
        id: 'env-missing-AUTH0_CLIENTID',
        message: 'Missing required environment variable: AUTH0_CLIENTID',
        severity: 'error',
        details: 'Auth0 authentication requires AUTH0_CLIENTID.',
        help: 'Add your Auth0 Client ID to the environment file.'
      });
      valid = false;
    }
    return valid;
  }

  /**
   * Load saved theme preference from localStorage, falling back to OS preference.
   *
   * Reads the same THEME_STORAGE_KEY ('mj-theme') the inline pre-paint script
   * reads, so both paths reach the same decision and Angular bootstrap doesn't
   * override the script's correct first-paint setting.
   */
  private applyLoginTheme(): void {
    const saved = localStorage.getItem(MJExplorerAppComponent.THEME_STORAGE_KEY);
    if (saved) {
      this.IsDarkMode = saved === 'dark';
    } else {
      this.IsDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    this.applyThemeToDOM();
  }

  /**
   * Set or remove the data-theme attribute on the document root
   */
  private applyThemeToDOM(): void {
    if (this.IsDarkMode) {
      this.document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      this.document.documentElement.removeAttribute('data-theme');
    }
  }

  /**
   * Toggle between light and dark themes, persisting the choice
   */
  public ToggleTheme(): void {
    this.IsDarkMode = !this.IsDarkMode;
    localStorage.setItem(MJExplorerAppComponent.THEME_STORAGE_KEY, this.IsDarkMode ? 'dark' : 'light');
    this.applyThemeToDOM();
  }

  /**
   * Render a pre-shell guard component as a full-page overlay.
   * The component should emit a 'completed' event when done.
   */
  private renderPreShellOverlay(componentType: Type<unknown>): void {
    this._preShellOverlayRef = this.viewContainerRef.createComponent(componentType, {
      environmentInjector: this.environmentInjector
    });

    // Listen for a 'completed' output if the component has one
    const instance = this._preShellOverlayRef.instance as Record<string, unknown>;
    if (instance['completed'] && typeof (instance['completed'] as { subscribe?: Function }).subscribe === 'function') {
      (instance['completed'] as { subscribe: (fn: () => void) => void }).subscribe(() => {
        this.dismissPreShellOverlay();
      });
    }
  }

  /**
   * Dismiss the pre-shell overlay and proceed to normal shell rendering.
   * Reloads the page first so the user never sees a flash of stale shell state
   * (e.g., "No Applications") while the old context is still in memory.
   */
  private dismissPreShellOverlay(): void {
    // Reload first — the shell needs a full bootstrap to pick up new roles/context.
    // Cleanup happens implicitly when the page unloads.
    window.location.href = '/';
  }
}
