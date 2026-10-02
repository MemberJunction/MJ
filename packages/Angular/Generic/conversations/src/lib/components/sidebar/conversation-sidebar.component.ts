import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CompositeKey, UserInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { NavigationTab } from '../../models/conversation-state.model';

@Component({
  standalone: false,
  selector: 'mj-conversation-sidebar',
  template: `
    <div class="conversation-sidebar">
      @if (activeTab === 'conversations') {
        <div class="sidebar-content">
          <mj-conversation-list
            [environmentId]="environmentId"
            [currentUser]="currentUser"
            [selectedConversationId]="selectedConversationId"
            [renamedConversationId]="renamedConversationId"
            [isSidebarPinned]="isSidebarPinned"
            [isMobileView]="isMobileView"
            [showSearch]="showSearch"
            [showNewConversationButton]="showNewConversationButton"
            [showHeaderMenu]="showHeaderMenu"
            [showSectionHeaders]="showSectionHeaders"
            (conversationSelected)="conversationSelected.emit($event)"
            (conversationDeleted)="conversationDeleted.emit($event)"
            (newConversationRequested)="newConversationRequested.emit()"
            (refreshRequested)="refreshRequested.emit()"
            (pinSidebarRequested)="onPinSidebarRequested()"
            (unpinSidebarRequested)="onUnpinSidebarRequested()">
          </mj-conversation-list>
        </div>
      }
      @if (activeTab === 'collections') {
        <div class="sidebar-content">
          <mj-collection-tree
            [environmentId]="environmentId"
            [currentUser]="currentUser">
          </mj-collection-tree>
        </div>
      }

      <!-- Routines — pinned at the very bottom of the sidebar. Gated by the
           ShowRoutines opt-out AND the user's Read permission on
           'MJ: User Routines' (checked inside the section component). -->
      <mj-conversation-routines-section
        [Provider]="Provider"
        [ShowRoutines]="ShowRoutines"
        (openEntityRecord)="openEntityRecord.emit($event)"
        (openConversation)="conversationSelected.emit($event)">
      </mj-conversation-routines-section>
    </div>
    `,
  styles: [`
    .conversation-sidebar {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .sidebar-content {
      flex: 1;
      overflow-y: auto;
    }
    .placeholder {
      padding: 24px;
      text-align: center;
      color: var(--mj-text-disabled);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
    }
    .placeholder p {
      margin: 0;
      font-size: 14px;
    }
  `]
})
export class ConversationSidebarComponent extends BaseAngularComponent {
  @Input() ActiveTab: NavigationTab = 'conversations';

  /** @deprecated Use {@link ActiveTab}. */
  @Input() set activeTab(value: NavigationTab) {
    this.ActiveTab = value;
  }
  /** @deprecated Use {@link ActiveTab}. */
  get activeTab(): NavigationTab {
    return this.ActiveTab;
  }
  @Input() EnvironmentId!: string;

  /** @deprecated Use {@link EnvironmentId}. */
  @Input() set environmentId(value: string) {
    this.EnvironmentId = value;
  }
  /** @deprecated Use {@link EnvironmentId}. */
  get environmentId(): string {
    return this.EnvironmentId;
  }
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() SelectedConversationId: string | null = null;

  /** @deprecated Use {@link SelectedConversationId}. */
  @Input() set selectedConversationId(value: string | null) {
    this.SelectedConversationId = value;
  }
  /** @deprecated Use {@link SelectedConversationId}. */
  get selectedConversationId(): string | null {
    return this.SelectedConversationId;
  }
  @Input() RenamedConversationId: string | null = null;

  /** @deprecated Use {@link RenamedConversationId}. */
  @Input() set renamedConversationId(value: string | null) {
    this.RenamedConversationId = value;
  }
  /** @deprecated Use {@link RenamedConversationId}. */
  get renamedConversationId(): string | null {
    return this.RenamedConversationId;
  }
  @Input() IsSidebarPinned: boolean = true;

  /** @deprecated Use {@link IsSidebarPinned}. */
  @Input() set isSidebarPinned(value: boolean) {
    this.IsSidebarPinned = value;
  }
  /** @deprecated Use {@link IsSidebarPinned}. */
  get isSidebarPinned(): boolean {
    return this.IsSidebarPinned;
  }
  @Input() IsMobileView: boolean = false;

  /** @deprecated Use {@link IsMobileView}. */
  @Input() set isMobileView(value: boolean) {
    this.IsMobileView = value;
  }
  /** @deprecated Use {@link IsMobileView}. */
  get isMobileView(): boolean {
    return this.IsMobileView;
  }
  /** Show the Routines section at the bottom of the sidebar (bubbled from the workspace; default true). */
  @Input() ShowRoutines: boolean = true;

  // ── White-label chrome toggles, passed through to the conversation list
  //    (all default true = stock rendering; see ConversationListComponent). ──
  /** Show the list's search box. */
  @Input() showSearch: boolean = true;
  /** Show the list's "New Conversation" button. */
  @Input() ShowNewConversationButton: boolean = true;

  /** @deprecated Use {@link ShowNewConversationButton}. */
  @Input() set showNewConversationButton(value: boolean) {
    this.ShowNewConversationButton = value;
  }
  /** @deprecated Use {@link ShowNewConversationButton}. */
  get showNewConversationButton(): boolean {
    return this.ShowNewConversationButton;
  }
  /** Show the list's ⋯ header options menu. */
  @Input() ShowHeaderMenu: boolean = true;

  /** @deprecated Use {@link ShowHeaderMenu}. */
  @Input() set showHeaderMenu(value: boolean) {
    this.ShowHeaderMenu = value;
  }
  /** @deprecated Use {@link ShowHeaderMenu}. */
  get showHeaderMenu(): boolean {
    return this.ShowHeaderMenu;
  }
  /** Show the list's collapsible section headers. */
  @Input() ShowSectionHeaders: boolean = true;

  /** @deprecated Use {@link ShowSectionHeaders}. */
  @Input() set showSectionHeaders(value: boolean) {
    this.ShowSectionHeaders = value;
  }
  /** @deprecated Use {@link ShowSectionHeaders}. */
  get showSectionHeaders(): boolean {
    return this.ShowSectionHeaders;
  }

  @Output() ConversationSelected = new EventEmitter<string>();

  /**
   * @deprecated Use {@link ConversationSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationSelected) keeps working. Must stay AFTER ConversationSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationSelected = this.ConversationSelected;
  /** Forwarded from the routines section — a run's linked execution record was clicked. */
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();

  /**
   * @deprecated Use {@link OpenEntityRecord}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (openEntityRecord) keeps working. Must stay AFTER OpenEntityRecord: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() openEntityRecord = this.OpenEntityRecord;
  @Output() NewConversationRequested = new EventEmitter<void>();

  /**
   * @deprecated Use {@link NewConversationRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (newConversationRequested) keeps working. Must stay AFTER NewConversationRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() newConversationRequested = this.NewConversationRequested;
  @Output() PinSidebarRequested = new EventEmitter<void>();

  /**
   * @deprecated Use {@link PinSidebarRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (pinSidebarRequested) keeps working. Must stay AFTER PinSidebarRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() pinSidebarRequested = this.PinSidebarRequested;
  @Output() UnpinSidebarRequested = new EventEmitter<void>();

  /**
   * @deprecated Use {@link UnpinSidebarRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (unpinSidebarRequested) keeps working. Must stay AFTER UnpinSidebarRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() unpinSidebarRequested = this.UnpinSidebarRequested;
  /** Re-emitted from the conversation list — a conversation was deleted (payload = its ID).
   *  Hosts use this to recover when the ACTIVE conversation is deleted. */
  @Output() ConversationDeleted = new EventEmitter<string>();

  /**
   * @deprecated Use {@link ConversationDeleted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (conversationDeleted) keeps working. Must stay AFTER ConversationDeleted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() conversationDeleted = this.ConversationDeleted;
  /** Re-emitted from the conversation list — the user refreshed the list. */
  @Output() RefreshRequested = new EventEmitter<void>();

  /**
   * @deprecated Use {@link RefreshRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (refreshRequested) keeps working. Must stay AFTER RefreshRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() refreshRequested = this.RefreshRequested;

  OnPinSidebarRequested(): void {
    this.PinSidebarRequested.emit();
  }

  /** @deprecated Use {@link OnPinSidebarRequested}. */
  onPinSidebarRequested(): void {
    return this.OnPinSidebarRequested();
  }

  OnUnpinSidebarRequested(): void {
    this.UnpinSidebarRequested.emit();
  }

  /** @deprecated Use {@link OnUnpinSidebarRequested}. */
  onUnpinSidebarRequested(): void {
    return this.OnUnpinSidebarRequested();
  }
}