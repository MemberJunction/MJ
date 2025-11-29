import { Component, ViewEncapsulation, OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { Metadata } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, NavigationService } from '@memberjunction/ng-shared';
import { ResourceData, EnvironmentEntityExtended } from '@memberjunction/core-entities';
import { ConversationStateService, ArtifactStateService } from '@memberjunction/ng-conversations';
import { Subject, takeUntil, distinctUntilChanged, combineLatest } from 'rxjs';

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

  constructor(
    private navigationService: NavigationService,
    private conversationState: ConversationStateService,
    private artifactState: ArtifactStateService,
    private location: Location
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

    // Setup browser back/forward navigation
    this.setupPopStateListener();

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
    this.cleanupPopStateListener();
  }

  /**
   * Parse URL query string for conversation state.
   * Query params: conversationId, artifactId, versionNumber
   */
  private parseUrlState(): { conversationId?: string; artifactId?: string; versionNumber?: number } | null {
    const queryString = window.location.search;
    if (!queryString) return null;

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
   * Uses replaceState to avoid adding history entries for every state change.
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
    const currentPath = this.location.path().split('?')[0];
    const queryString = params.toString();
    const newUrl = queryString ? `${currentPath}?${queryString}` : currentPath;

    this.location.replaceState(newUrl);
  }

  /** Bound handler for popstate events */
  private boundPopStateHandler = this.onPopState.bind(this);

  private setupPopStateListener(): void {
    window.addEventListener('popstate', this.boundPopStateHandler);
  }

  private cleanupPopStateListener(): void {
    window.removeEventListener('popstate', this.boundPopStateHandler);
  }

  /**
   * Handle browser back/forward navigation.
   */
  private onPopState(): void {
    const urlState = this.parseUrlState();
    if (urlState) {
      this.skipUrlUpdate = true;
      this.applyUrlState(urlState);
      this.skipUrlUpdate = false;
    }
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
