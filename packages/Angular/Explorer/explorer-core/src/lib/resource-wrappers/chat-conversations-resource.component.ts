import { Component, ViewEncapsulation, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, EnvironmentEntityExtended } from '@memberjunction/core-entities';
import { ConversationStateService, ArtifactStateService } from '@memberjunction/ng-conversations';
import { Subject, takeUntil, distinctUntilChanged, combineLatest, filter } from 'rxjs';

export function LoadChatConversationsResource() {
  // Force inclusion in production builds (tree shaking workaround)
  // Using null placeholders since Angular DI provides actual instances
  const test = new ChatConversationsResource(null!, null!, null!, null!);
}

/**
 * Chat Conversations Resource - wraps the conversation chat area for tab-based display
 * Extends BaseResourceComponent to work with the resource type system
 * Displays conversation list sidebar + active conversation chat interface
 * Designed to work with the tab system for multi-tab conversation management
 */
@RegisterClass(BaseResourceComponent, 'ChatConversationsResource')
@Component({
  selector: 'mj-chat-conversations-resource',
  template: `
    <div class="chat-conversations-container">
      <!-- Left sidebar: Conversation list -->
      <div class="conversation-sidebar">
        <mj-conversation-list
          *ngIf="currentUser"
          [environmentId]="environmentId"
          [currentUser]="currentUser">
        </mj-conversation-list>
      </div>

      <!-- Main area: Chat interface -->
      <div class="conversation-main">
        <mj-conversation-chat-area
          *ngIf="currentUser"
          [environmentId]="environmentId"
          [currentUser]="currentUser"
          (artifactLinkClicked)="onArtifactLinkClicked($event)">
        </mj-conversation-chat-area>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
    }

    .chat-conversations-container {
      display: flex;
      width: 100%;
      height: 100%;
      flex: 1;
      overflow: hidden;
    }

    .conversation-sidebar {
      width: 300px;
      flex-shrink: 0;
      border-right: 1px solid #e0e0e0;
      overflow-y: auto;
      background: #f5f5f5;
    }

    .conversation-main {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
  `],
  encapsulation: ViewEncapsulation.None
})
export class ChatConversationsResource extends BaseResourceComponent implements OnDestroy {
  public currentUser: any = null;
  private destroy$ = new Subject<void>();
  private skipUrlUpdate = true; // Skip URL updates during initialization
  private lastNavigatedUrl: string = ''; // Track URL to avoid reacting to our own navigation

  constructor(
    private navigationService: NavigationService,
    private conversationState: ConversationStateService,
    private artifactState: ArtifactStateService,
    private router: Router
  ) {
    super();
  }

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    // Parse URL first and apply state
    const urlState = this.parseUrlState();
    if (urlState) {
      this.applyUrlState(urlState);
    } else {
      // Check if we have navigation params from config (e.g., from Collections linking here)
      this.applyNavigationParams();
    }

    // Subscribe to state changes to update URL
    this.subscribeToStateChanges();

    // Subscribe to router NavigationEnd events for back/forward button support
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(event => {
        const currentUrl = event.urlAfterRedirects || event.url;
        if (currentUrl !== this.lastNavigatedUrl) {
          this.onExternalNavigation(currentUrl);
        }
      });

    // Enable URL updates after initialization
    this.skipUrlUpdate = false;

    // Update URL to reflect current state
    this.updateUrl();

    // Notify load complete after user is set
    setTimeout(() => {
      this.NotifyLoadComplete();
    }, 100);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Parse URL query string for conversation state.
   * Query params: conversationId, artifactId, versionNumber
   */
  private parseUrlState(): { conversationId?: string; artifactId?: string; versionNumber?: number } | null {
    const url = this.router.url;
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const conversationId = params.get('conversationId');
    const artifactId = params.get('artifactId');
    const versionNumber = params.get('versionNumber');

    if (!conversationId && !artifactId) return null;

    return {
      conversationId: conversationId || undefined,
      artifactId: artifactId || undefined,
      versionNumber: versionNumber ? parseInt(versionNumber, 10) : undefined
    };
  }

  /**
   * Apply URL state to conversation services.
   */
  private applyUrlState(state: { conversationId?: string; artifactId?: string; versionNumber?: number }): void {
    // Set pending artifact if provided (must be set before activating conversation)
    if (state.artifactId) {
      this.conversationState.pendingArtifactId = state.artifactId;
      this.conversationState.pendingArtifactVersionNumber = state.versionNumber || null;
    }

    // Activate the target conversation if specified
    if (state.conversationId) {
      this.conversationState.setActiveConversation(state.conversationId);
    }
  }

  /**
   * Apply navigation parameters from configuration.
   * This handles deep-linking from other resources (e.g., clicking a link in Collections).
   */
  private applyNavigationParams(): void {
    const config = this.Data?.Configuration;
    if (!config) return;

    // Set pending artifact if provided (must be set before activating conversation)
    if (config.artifactId) {
      this.conversationState.pendingArtifactId = config.artifactId as string;
      this.conversationState.pendingArtifactVersionNumber = (config.versionNumber as number) || null;
    }

    // Activate the target conversation if specified
    if (config.conversationId) {
      this.conversationState.setActiveConversation(config.conversationId as string);
    }
  }

  /**
   * Subscribe to state changes from services to update URL.
   */
  private subscribeToStateChanges(): void {
    // Combine conversation and artifact state changes
    combineLatest([
      this.conversationState.activeConversationId$.pipe(distinctUntilChanged()),
      this.artifactState.activeArtifactId$.pipe(distinctUntilChanged()),
      this.artifactState.activeVersionNumber$.pipe(distinctUntilChanged())
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.skipUrlUpdate) {
          this.updateUrl();
        }
      });
  }

  /**
   * Update URL query string to reflect current state.
   * Uses Angular Router for proper browser history integration.
   */
  private updateUrl(): void {
    const params = new URLSearchParams();

    // Add conversation ID
    const conversationId = this.conversationState.activeConversationId;
    if (conversationId) {
      params.set('conversationId', conversationId);
    }

    // Add artifact ID if panel is open
    const artifactId = this.artifactState['_activeArtifactId$']?.value;
    if (artifactId) {
      params.set('artifactId', artifactId);
      const versionNumber = this.artifactState['_activeVersionNumber$']?.value;
      if (versionNumber) {
        params.set('versionNumber', versionNumber.toString());
      }
    }

    // Get current path without query string
    const currentUrl = this.router.url;
    const currentPath = currentUrl.split('?')[0];
    const queryString = params.toString();
    const newUrl = queryString ? `${currentPath}?${queryString}` : currentPath;

    // Track this URL so we don't react to our own navigation
    this.lastNavigatedUrl = newUrl;

    // Use Angular Router for proper browser history integration
    this.router.navigateByUrl(newUrl, { replaceUrl: false });
  }

  /**
   * Handle external navigation (back/forward buttons).
   * Parses the URL and applies the state without triggering a new navigation.
   */
  private onExternalNavigation(url: string): void {
    // Check if this URL is for our component (contains our base path)
    const currentPath = this.router.url.split('?')[0];
    const newPath = url.split('?')[0];

    // Only handle if we're still on the same base path (same component instance)
    if (currentPath !== newPath) {
      return; // Different route entirely, shell will handle it
    }

    // Parse the new URL state
    const urlState = this.parseUrlFromString(url);

    // Apply the state without triggering URL updates
    this.skipUrlUpdate = true;
    if (urlState) {
      this.applyUrlState(urlState);
    } else {
      // No params means clear state
      this.conversationState.setActiveConversation(null as unknown as string);
      this.artifactState.closeArtifact();
    }
    this.skipUrlUpdate = false;

    // Update the tracked URL
    this.lastNavigatedUrl = url;
  }

  /**
   * Parse URL state from a URL string (used for external navigation).
   */
  private parseUrlFromString(url: string): { conversationId?: string; artifactId?: string; versionNumber?: number } | null {
    const queryIndex = url.indexOf('?');
    if (queryIndex === -1) return null;

    const queryString = url.substring(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const conversationId = params.get('conversationId');
    const artifactId = params.get('artifactId');
    const versionNumber = params.get('versionNumber');

    if (!conversationId && !artifactId) return null;

    return {
      conversationId: conversationId || undefined,
      artifactId: artifactId || undefined,
      versionNumber: versionNumber ? parseInt(versionNumber, 10) : undefined
    };
  }

  /**
   * Get the environment ID from configuration or use default
   */
  get environmentId(): string {
    return this.Data?.Configuration?.environmentId || EnvironmentEntityExtended.DefaultEnvironmentID;
  }

  /**
   * Get the active conversation ID from configuration (if specified)
   */
  get activeConversationId(): string | undefined {
    return this.Data?.Configuration?.conversationId;
  }

  /**
   * Get the display name for chat conversations
   */
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    // If we have a specific conversation ID, we could load the conversation name
    // For now, just return a generic name
    if (data.Configuration?.conversationId) {
      return `Conversation: ${data.Configuration.conversationId.substring(0, 8)}...`;
    }
    return 'Conversations';
  }

  /**
   * Get the icon class for chat conversations
   */
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-comments';
  }

  /**
   * Handle navigation request from artifact viewer panel within the chat area.
   * Converts the link event to a generic navigation request and uses NavigationService.
   */
  onArtifactLinkClicked(event: {
    type: 'conversation' | 'collection';
    id: string;
    artifactId?: string;
    versionNumber?: number;
  }): void {
    // Map the link type to the nav item name
    const navItemName = event.type === 'conversation' ? 'Conversations' : 'Collections';

    // Build configuration params to pass to the target resource
    const params: Record<string, unknown> = {};
    if (event.type === 'conversation') {
      params['conversationId'] = event.id;
    } else {
      params['collectionId'] = event.id;
    }

    // Include artifact info so destination can open it
    if (event.artifactId) {
      params['artifactId'] = event.artifactId;
      if (event.versionNumber) {
        params['versionNumber'] = event.versionNumber;
      }
    }

    // Navigate using the generic nav item method
    this.navigationService.OpenNavItemByName(navItemName, params);
  }
}
