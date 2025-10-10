import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Metadata, CompositeKey } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { EnvironmentEntityExtended } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

/**
 * Wrapper component for the conversations interface within MJ Explorer
 * Integrates the generic @memberjunction/ng-conversations package with Explorer routing
 * Handles route params for conversation, library, and task context
 */
@Component({
  selector: 'mj-chat-wrapper',
  template: `
    <div class="chat-wrapper" *ngIf="currentUser">
      <mj-conversation-workspace
        [environmentId]="environmentId"
        [initialConversationId]="conversationId"
        [currentUser]="currentUser"
        [layout]="'full'"
        [activeContext]="activeContext"
        [contextItemId]="contextItemId"
        [activeTabInput]="activeTab"
        [activeConversationInput]="activeConversationId"
        [activeCollectionInput]="activeCollectionId"
        [activeArtifactInput]="activeArtifactId"
        [activeTaskInput]="activeTaskId"
        (navigationChanged)="onNavigationChanged($event)"
        (openEntityRecord)="onOpenEntityRecord($event)">
      </mj-conversation-workspace>
    </div>
  `,
  styles: [`
    .chat-wrapper {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  `]
})
export class ChatWrapperComponent implements OnInit {
  public environmentId: string = '';
  public conversationId?: string;
  public activeContext?: 'library' | 'task';
  public contextItemId?: string;
  public currentUser: any = null;

  // Navigation state from route params
  public activeTab?: 'conversations' | 'collections' | 'tasks';
  public activeConversationId?: string;
  public activeCollectionId?: string;
  public activeArtifactId?: string;
  public activeTaskId?: string;

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    const md = new Metadata();
    this.currentUser = md.CurrentUser;

    this.environmentId = EnvironmentEntityExtended.DefaultEnvironmentID;

    // Subscribe to route params for conversation and context navigation
    this.route.params.subscribe(params => {
      if (params['conversationId']) {
        this.conversationId = params['conversationId'];
      }

      // Handle context (library or task) and contextItemId
      if (params['context']) {
        const context = params['context'];
        if (context === 'library' || context === 'task') {
          this.activeContext = context;
        }
      } else {
        this.activeContext = undefined;
      }

      if (params['itemId']) {
        this.contextItemId = params['itemId'];
      } else {
        this.contextItemId = undefined;
      }
    });

    // Subscribe to query params for navigation state (tab, activeTaskId, etc.)
    this.route.queryParams.subscribe(queryParams => {
      // Parse navigation properties from query params
      if (queryParams['tab']) {
        const tab = queryParams['tab'];
        if (tab === 'conversations' || tab === 'collections' || tab === 'tasks') {
          this.activeTab = tab;
        }
      }

      // Parse entity-specific IDs based on active tab
      this.activeConversationId = queryParams['activeConversationId'];
      this.activeCollectionId = queryParams['activeCollectionId'];
      this.activeArtifactId = queryParams['activeArtifactId'];
      this.activeTaskId = queryParams['activeTaskId'];
    });
  }

  /**
   * Handle navigation changes from conversation workspace
   * Update route params to reflect navigation state for browser history/deep linking
   */
  onNavigationChanged(event: {
    tab: 'conversations' | 'collections' | 'tasks';
    conversationId?: string;
    collectionId?: string;
    artifactId?: string;
    taskId?: string;
  }): void {
    // Update local state
    this.activeTab = event.tab;
    this.activeConversationId = event.conversationId;
    this.activeCollectionId = event.collectionId;
    this.activeArtifactId = event.artifactId;
    this.activeTaskId = event.taskId;

    // Build query params based on active tab
    const queryParams: any = {
      tab: event.tab
    };

    if (event.tab === 'conversations' && event.conversationId) {
      queryParams.activeConversationId = event.conversationId;
    } else if (event.tab === 'collections') {
      if (event.collectionId) {
        queryParams.activeCollectionId = event.collectionId;
      }
      if (event.artifactId) {
        queryParams.activeArtifactId = event.artifactId;
      }
    } else if (event.tab === 'tasks' && event.taskId) {
      queryParams.activeTaskId = event.taskId;
    }

    // Update URL without reloading the page
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge', // Preserve other query params
      replaceUrl: false // Add to browser history for back/forward navigation
    });
  }

  /**
   * Handle openEntityRecord event from conversation components
   * Opens the specified entity record in a new tab using SharedService
   */
  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    SharedService.Instance.OpenEntityRecord(event.entityName, event.compositeKey);
  }
}