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
import { UserInfo, CompositeKey, Metadata } from '@memberjunction/core';
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
  @Output() openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  public activeTab: NavigationTab = 'conversations';
  public isSidebarVisible: boolean = true;
  public isArtifactPanelOpen: boolean = false;
  public isSearchPanelOpen: boolean = false;
  public renamedConversationId: string | null = null;
  public activeArtifactId: string | null = null;
  public activeVersionNumber: number | null = null;

  // Resize state - Sidebar
  public sidebarWidth: number = 260; // Default width
  private isSidebarResizing: boolean = false;
  private sidebarResizeStartX: number = 0;
  private sidebarResizeStartWidth: number = 0;

  // Resize state - Artifact Panel
  public artifactPanelWidth: number = 40; // Default 40% width
  private isArtifactPanelResizing: boolean = false;
  private artifactPanelResizeStartX: number = 0;
  private artifactPanelResizeStartWidth: number = 0;

  private previousConversationId: string | null = null;
  private destroy$ = new Subject<void>();

  // LocalStorage keys
  private readonly SIDEBAR_WIDTH_KEY = 'mj-conversations-sidebar-width';
  private readonly ARTIFACT_PANEL_WIDTH_KEY = 'mj-artifact-panel-width';

  // Task filter for conversation-specific filtering
  public tasksFilter: string = '1=1';

  constructor(
    public conversationState: ConversationStateService,
    public artifactState: ArtifactStateService
  ) {
    super();
  }

  async ngOnInit() {
    // Load saved widths from localStorage
    this.loadSidebarWidth();
    this.loadArtifactPanelWidth();

    // Setup resize listeners
    window.addEventListener('mousemove', this.onResizeMove.bind(this));
    window.addEventListener('mouseup', this.onResizeEnd.bind(this));

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

    // Subscribe to active artifact ID
    this.artifactState.activeArtifactId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(id => {
        this.activeArtifactId = id;
      });

    // Subscribe to active version number
    this.artifactState.activeVersionNumber$
      .pipe(takeUntil(this.destroy$))
      .subscribe(versionNumber => {
        this.activeVersionNumber = versionNumber;
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

    // Build task filter for conversations domain
    this.buildTasksFilter();
  }

  /**
   * Builds the SQL filter for tasks in conversations the user has access to
   */
  private buildTasksFilter(): void {
    // Filter tasks by conversations the user owns or is a participant in, or tasks owned
    // by the user
    const md = new Metadata();
    const cd = md.EntityByName('Conversation Details');
    const c = md.EntityByName('Conversations');
    if (!cd || !c) {
      console.warn('⚠️ Missing metadata for Conversations or Conversation Details');
      this.tasksFilter = `ParentID IS NULL AND UserID = '${this.currentUser.ID}'`; // Fallback to user-owned tasks only
      return;
    }

    this.tasksFilter = `ParentID IS NULL AND (UserID = '${this.currentUser.ID}' OR ConversationDetailID IN (
      SELECT ID FROM [${cd.SchemaName}].[${cd.BaseView}] 
      WHERE 
      UserID ='${this.currentUser.ID}' OR 
      ConversationID IN (
        SELECT ID FROM [${c.SchemaName}].[${c.BaseView}] WHERE UserID='${this.currentUser.ID}'
      )
    ))`;
    console.log('📝 Conversations domain tasks filter built:', this.tasksFilter);
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

    // Remove resize listeners
    window.removeEventListener('mousemove', this.onResizeMove.bind(this));
    window.removeEventListener('mouseup', this.onResizeEnd.bind(this));
  }

  onTabChanged(tab: NavigationTab): void {
    this.activeTab = tab;

    // Auto-close artifact panel when switching away from collections
    if (tab === 'conversations' || tab === 'tasks') {
      this.artifactState.closeArtifact();
    }
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

  /**
   * Sidebar resize methods
   */
  onSidebarResizeStart(event: MouseEvent): void {
    this.isSidebarResizing = true;
    this.sidebarResizeStartX = event.clientX;
    this.sidebarResizeStartWidth = this.sidebarWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /**
   * Artifact panel resize methods
   */
  onArtifactPanelResizeStart(event: MouseEvent): void {
    this.isArtifactPanelResizing = true;
    this.artifactPanelResizeStartX = event.clientX;
    this.artifactPanelResizeStartWidth = this.artifactPanelWidth;
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  private onResizeMove(event: MouseEvent): void {
    if (this.isSidebarResizing) {
      const deltaX = event.clientX - this.sidebarResizeStartX;
      let newWidth = this.sidebarResizeStartWidth + deltaX;

      // Constrain between 200px and 500px
      newWidth = Math.max(200, Math.min(500, newWidth));
      this.sidebarWidth = newWidth;
    } else if (this.isArtifactPanelResizing) {
      const container = document.querySelector('.workspace-content') as HTMLElement;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const deltaX = event.clientX - this.artifactPanelResizeStartX;
      const deltaPercent = (deltaX / containerWidth) * -100; // Negative because we're pulling from the right
      let newWidth = this.artifactPanelResizeStartWidth + deltaPercent;

      // Constrain between 20% and 70%
      newWidth = Math.max(20, Math.min(70, newWidth));
      this.artifactPanelWidth = newWidth;
    }
  }

  private onResizeEnd(event: MouseEvent): void {
    if (this.isSidebarResizing) {
      this.isSidebarResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.saveSidebarWidth();
    } else if (this.isArtifactPanelResizing) {
      this.isArtifactPanelResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.saveArtifactPanelWidth();
    }
  }

  /**
   * LocalStorage persistence methods
   */
  private loadSidebarWidth(): void {
    try {
      const saved = localStorage.getItem(this.SIDEBAR_WIDTH_KEY);
      if (saved) {
        const width = parseInt(saved, 10);
        if (!isNaN(width) && width >= 200 && width <= 500) {
          this.sidebarWidth = width;
        }
      }
    } catch (error) {
      console.warn('Failed to load sidebar width from localStorage:', error);
    }
  }

  private saveSidebarWidth(): void {
    try {
      localStorage.setItem(this.SIDEBAR_WIDTH_KEY, this.sidebarWidth.toString());
    } catch (error) {
      console.warn('Failed to save sidebar width to localStorage:', error);
    }
  }

  private loadArtifactPanelWidth(): void {
    try {
      const saved = localStorage.getItem(this.ARTIFACT_PANEL_WIDTH_KEY);
      if (saved) {
        const width = parseFloat(saved);
        if (!isNaN(width) && width >= 20 && width <= 70) {
          this.artifactPanelWidth = width;
        }
      }
    } catch (error) {
      console.warn('Failed to load artifact panel width from localStorage:', error);
    }
  }

  private saveArtifactPanelWidth(): void {
    try {
      localStorage.setItem(this.ARTIFACT_PANEL_WIDTH_KEY, this.artifactPanelWidth.toString());
    } catch (error) {
      console.warn('Failed to save artifact panel width to localStorage:', error);
    }
  }

  onConversationRenamed(event: {conversationId: string; name: string; description: string}): void {
    console.log('✨ Workspace received rename event:', event);
    // Trigger animation in sidebar by setting the ID
    this.renamedConversationId = event.conversationId;

    // Clear after animation completes (1500ms)
    setTimeout(() => {
      this.renamedConversationId = null;
    }, 1500);
  }

  onOpenEntityRecord(event: {entityName: string; compositeKey: CompositeKey}): void {
    // Pass the event up to the parent component (chat-wrapper in explorer-core)
    this.openEntityRecord.emit(event);
  }
}