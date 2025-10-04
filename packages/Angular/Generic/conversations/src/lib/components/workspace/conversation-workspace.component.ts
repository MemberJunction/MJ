import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  DoCheck
} from '@angular/core';
import { ConversationEntity, ArtifactEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ConversationStateService } from '../../services/conversation-state.service';
import { ArtifactStateService } from '../../services/artifact-state.service';
import { NavigationTab, WorkspaceLayout } from '../../models/conversation-state.model';
import { SearchResult } from '../../services/search.service';
import { Subject, takeUntil } from 'rxjs';
import { AIEngineBase } from '@memberjunction/ai-engine-base';

/**
 * Top-level workspace component for conversations
 * Provides 3-column Slack-style layout: Navigation | Sidebar | Chat Area | Artifact Panel
 * Supports context-based navigation (library or task views)
 */
@Component({
  selector: 'mj-conversation-workspace',
  templateUrl: './conversation-workspace.component.html',
  styleUrls: ['./conversation-workspace.component.css']
})
export class ConversationWorkspaceComponent extends BaseAngularComponent implements OnInit, OnDestroy, DoCheck {
  @Input() environmentId!: string;
  @Input() initialConversationId?: string;
  @Input() layout: WorkspaceLayout = 'full';
  @Input() currentUser!: UserInfo;
  @Input() activeContext?: 'library' | 'task';
  @Input() contextItemId?: string;

  @Output() conversationChanged = new EventEmitter<ConversationEntity>();
  @Output() artifactOpened = new EventEmitter<ArtifactEntity>();

  public activeTab: NavigationTab = 'conversations';
  public isSidebarVisible: boolean = true;
  public isArtifactPanelOpen: boolean = false;
  public isSearchPanelOpen: boolean = false;

  private previousConversationId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(
    public conversationState: ConversationStateService,
    public artifactState: ArtifactStateService
  ) {
    super();
  }

  async ngOnInit() {
    // Initialize AI Engine to load agent metadata cache
    // This ensures agent names and icons are available for display
    try {
      await AIEngineBase.Instance.Config(false);
      console.log('✅ AI Engine initialized with', AIEngineBase.Instance.Agents?.length || 0, 'agents');
    } catch (error) {
      console.error('❌ Failed to initialize AI Engine:', error);
    }

    // Subscribe to artifact panel state
    this.artifactState.isPanelOpen$
      .pipe(takeUntil(this.destroy$))
      .subscribe(isOpen => {
        this.isArtifactPanelOpen = isOpen;
      });

    // Set initial conversation if provided
    if (this.initialConversationId) {
      this.conversationState.setActiveConversation(this.initialConversationId);
    }

    // Handle context-based navigation
    if (this.activeContext === 'library') {
      this.activeTab = 'collections';
    }
    // Task context will be handled by chat header dropdown, not navigation tabs
  }

  ngDoCheck() {
    // Detect conversation changes and emit event
    const currentId = this.conversationState.activeConversationId;
    if (currentId !== this.previousConversationId) {
      this.previousConversationId = currentId;
      const conversation = this.conversationState.activeConversation;
      if (conversation) {
        this.conversationChanged.emit(conversation);
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onTabChanged(tab: NavigationTab): void {
    this.activeTab = tab;
  }

  toggleSidebar(): void {
    this.isSidebarVisible = !this.isSidebarVisible;
  }

  closeArtifactPanel(): void {
    this.artifactState.closeArtifact();
  }

  openSearch(): void {
    this.isSearchPanelOpen = true;
  }

  closeSearch(): void {
    this.isSearchPanelOpen = false;
  }

  handleSearchResult(result: SearchResult): void {
    // Navigate to the conversation
    if (result.conversationId) {
      this.conversationState.setActiveConversation(result.conversationId);
    }

    // If it's an artifact, open it in the artifact panel
    if (result.type === 'artifact') {
      this.artifactState.openArtifact(result.id);
    }

    // If it's a message, we could scroll to it in the future
    // For now, just open the conversation

    this.closeSearch();
  }
}