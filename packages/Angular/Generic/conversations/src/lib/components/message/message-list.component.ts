import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ViewContainerRef,
  OnInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  ChangeDetectorRef,
  ElementRef,
  AfterViewInit,
  AfterViewChecked
} from '@angular/core';
import { MJConversationDetailEntity, MJConversationEntity, RatingJSON } from '@memberjunction/core-entities';
import { UserInfo, CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MessageItemComponent, MessageAttachment } from './message-item.component';
import { LazyArtifactInfo } from '../../models/lazy-artifact-info';
import { selectDistinctLatestArtifacts } from '../../utils/distinct-artifacts';
import { MJAIAgentRunEntityExtended } from '@memberjunction/ai-core-plus';

/**
 * Container component for displaying a list of messages
 * Uses dynamic component creation (like skip-chat) to avoid Angular binding overhead
 * This dramatically improves performance when messages are added/removed
 */
@Component({
  standalone: false,
  selector: 'mj-conversation-message-list',
  templateUrl: './message-list.component.html',
  styleUrls: ['./message-list.component.css']
})
export class MessageListComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges, AfterViewInit, AfterViewChecked {
  @Input() public messages: MJConversationDetailEntity[] = [];
  @Input() public conversation!: MJConversationEntity | null;
  @Input() public currentUser!: UserInfo;
  @Input() public isProcessing: boolean = false;
  @Input() public artifactMap: Map<string, LazyArtifactInfo[]> = new Map();
  @Input() public agentRunMap: Map<string, MJAIAgentRunEntityExtended> = new Map();
  @Input() public ratingsMap: Map<string, RatingJSON[]> = new Map();
  @Input() public userAvatarMap: Map<string, {imageUrl: string | null; iconClass: string | null}> = new Map();
  @Input() public attachmentsMap: Map<string, MessageAttachment[]> = new Map();

  @Output() public editMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public deleteMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public retryMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public testFeedbackMessage = new EventEmitter<MJConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();
  @Output() public replyInThread = new EventEmitter<MJConversationDetailEntity>();
  @Output() public viewThread = new EventEmitter<MJConversationDetailEntity>();
  @Output() public messageEdited = new EventEmitter<MJConversationDetailEntity>();
  @Output() public openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();
  @Output() public suggestedResponseSelected = new EventEmitter<{text: string; customInput?: string}>();
  @Output() public attachmentClicked = new EventEmitter<MessageAttachment>();
  @Output() public diagnosticRequested = new EventEmitter<string>(); // emits messageId
  @Output() public messagePinToggled = new EventEmitter<MJConversationDetailEntity>();

  @ViewChild('messageContainer', { read: ViewContainerRef }) messageContainerRef!: ViewContainerRef;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  private _renderedMessages = new Map<string, any>();
  private _shouldScrollToBottom = false;
  private _previousMessageCount = 0; // Track previous count to detect new messages

  public currentDateDisplay: string = 'Today';
  public showDateNav: boolean = false;
  public shouldShowDateFilter: boolean = false;

  constructor(private cdRef: ChangeDetectorRef) {
    super();
  }

  public toggleDateNav(): void {
    this.showDateNav = !this.showDateNav;
  }

  public jumpToDate(period: string): void {
    // TODO: Implement date jumping logic
    console.log('Jump to date:', period);
    this.showDateNav = false;

    // Update display based on period
    switch(period) {
      case 'today':
        this.currentDateDisplay = 'Today';
        break;
      case 'yesterday':
        this.currentDateDisplay = 'Yesterday';
        break;
      case 'last-week':
        this.currentDateDisplay = 'Last week';
        break;
      case 'last-month':
        this.currentDateDisplay = 'Last month';
        break;
    }
  }

  // Track whether initial render has happened
  private _initialRenderComplete = false;

  ngOnInit() {
    // Initial render will happen in ngAfterViewInit when ViewContainerRef is available
  }

  ngAfterViewInit() {
    // ViewContainerRef is now available - perform initial render if we have messages
    if (this.messages && this.messages.length > 0 && this.messageContainerRef && !this._initialRenderComplete) {
      this._initialRenderComplete = true;
      this.updateMessages(this.messages);
      this.updateDateFilterVisibility();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    // React to messages array changes
    // Note: On initial load, messageContainerRef may not be available yet (ngOnChanges runs before ngAfterViewInit)
    // In that case, ngAfterViewInit will handle the initial render
    if (changes['messages'] && this.messages && this.messageContainerRef) {
      this._initialRenderComplete = true;
      this.updateMessages(this.messages);
      this.updateDateFilterVisibility();
    }

    // Watch for artifactMap changes to handle newly created artifacts
    // While artifacts are pre-loaded during initial peripheral data load,
    // new artifacts can be created mid-conversation (e.g., by agent runs)
    // This ensures artifact cards appear in messages immediately without requiring a refresh
    if (changes['artifactMap'] && this.messages && this.messageContainerRef) {
      this.updateMessages(this.messages);
    }

    // Watch for attachmentsMap changes to handle newly created attachments
    // This ensures media attachments (e.g., images generated by agents) appear
    // immediately without requiring a page refresh
    if (changes['attachmentsMap'] && this.messages && this.messageContainerRef) {
      this.updateMessages(this.messages);
    }
  }

  ngAfterViewChecked() {
    if (this._shouldScrollToBottom) {
      this.scrollToBottom();
      this._shouldScrollToBottom = false;
    }
  }

  ngOnDestroy() {
    // Clean up all dynamically created components
    this._renderedMessages.forEach((componentRef) => {
      if (componentRef) {
        componentRef.destroy();
      }
    });
    this._renderedMessages.clear();

    if (this.messageContainerRef) {
      this.messageContainerRef.clear();
    }
  }

  /**
   * Called when messages array changes
   * Efficiently updates the DOM without re-rendering everything
   */
  @Input()
  set messagesUpdate(messages: MJConversationDetailEntity[]) {
    if (messages && this.messageContainerRef) {
      this.updateMessages(messages);
    }
  }

  /**
   * Updates the message list using dynamic component creation
   * Only adds/removes changed messages for optimal performance
   */
  private updateMessages(messages: MJConversationDetailEntity[]): void {
    // Temporarily detach change detection for performance
    this.cdRef.detach();

    try {
      // Remove messages that no longer exist
      const currentIds = new Set(messages.map(m => this.getMessageKey(m)));
      this._renderedMessages.forEach((componentRef, key) => {
        if (!currentIds.has(key)) {
          componentRef.destroy();
          this._renderedMessages.delete(key);
        }
      });

      // Add or update messages
      messages.forEach((message, index) => {
        const key = this.getMessageKey(message);
        const existing = this._renderedMessages.get(key);

        if (existing) {
          // Update existing component
          const instance = existing.instance as MessageItemComponent;

          // Store previous message for comparison
          const previousMessage = instance.message;

          instance.message = message;
          instance.allMessages = messages;
          instance.isProcessing = this.isProcessing;
          instance.userAvatarMap = this.userAvatarMap;
          instance.isLastMessage = (index === messages.length - 1); // Update last message flag

          // Surface ALL distinct artifacts on this message (latest version each),
          // not just the most recent one. Loads lazily in the background.
          this.applyArtifactsToInstance(instance, message.ID, existing.changeDetectorRef);

          // Update agent run from map
          instance.agentRun = this.agentRunMap.get(message.ID) || null;

          // Update ratings from map
          instance.ratings = this.ratingsMap.get(message.ID);

          // Update attachments from map
          instance.attachments = this.attachmentsMap.get(message.ID) || [];

          // Manually trigger change detection in child component when message status changes
          // This is necessary because we're using OnPush change detection and direct property assignment
          // doesn't trigger ngOnChanges (only reference changes do)
          if (previousMessage && previousMessage.Status !== message.Status) {
            // Use ComponentRef.changeDetectorRef to force update on dynamic child
            existing.changeDetectorRef.markForCheck();
          }
        } else {
          // Create new component
          const componentRef = this.messageContainerRef.createComponent(MessageItemComponent);
          const instance = componentRef.instance;

          // Set inputs
          instance.message = message;
          instance.conversation = this.conversation;
          instance.currentUser = this.currentUser;
          instance.allMessages = messages;
          instance.isProcessing = this.isProcessing;
          instance.userAvatarMap = this.userAvatarMap;
          instance.isLastMessage = (index === messages.length - 1); // Mark last message

          // Surface ALL distinct artifacts on this message (latest version each).
          this.applyArtifactsToInstance(instance, message.ID, componentRef.changeDetectorRef);

          // Pass agent run from map (loaded once per conversation)
          instance.agentRun = this.agentRunMap.get(message.ID) || null;

          // Pass ratings from map (parsed once per conversation)
          instance.ratings = this.ratingsMap.get(message.ID);

          // Pass attachments from map
          instance.attachments = this.attachmentsMap.get(message.ID) || [];

          // Subscribe to outputs
          instance.editClicked.subscribe((msg: MJConversationDetailEntity) => this.editMessage.emit(msg));
          instance.deleteClicked.subscribe((msg: MJConversationDetailEntity) => this.deleteMessage.emit(msg));
          instance.retryClicked.subscribe((msg: MJConversationDetailEntity) => this.retryMessage.emit(msg));
          instance.testFeedbackClicked.subscribe((msg: MJConversationDetailEntity) => this.testFeedbackMessage.emit(msg));
          instance.artifactClicked.subscribe((data: {artifactId: string; versionId?: string}) => this.artifactClicked.emit(data));
          instance.messageEdited.subscribe((msg: MJConversationDetailEntity) => this.messageEdited.emit(msg));
          instance.openEntityRecord.subscribe((data: {entityName: string; compositeKey: CompositeKey}) => this.openEntityRecord.emit(data));
          instance.suggestedResponseSelected.subscribe((data: {text: string; customInput?: string}) => this.suggestedResponseSelected.emit(data));
          instance.attachmentClicked.subscribe((attachment: MessageAttachment) => this.attachmentClicked.emit(attachment));
          instance.diagnosticRequested.subscribe((messageId: string) => this.diagnosticRequested.emit(messageId));
          instance.messagePinToggled.subscribe((msg: MJConversationDetailEntity) => this.messagePinToggled.emit(msg));

          // Handle artifact actions if the output exists
          if (instance.artifactActionPerformed) {
            instance.artifactActionPerformed.subscribe((data: {action: string; artifactId: string}) => {
              // Parent can handle artifact actions (save, fork, history, share)
              console.log('Artifact action:', data);
            });
          }

          // Store reference
          this._renderedMessages.set(key, componentRef);

          // Store reference on the message entity for later access (like skip-chat pattern)
          (message as any)._componentRef = componentRef;
        }
      });

      // Only scroll to bottom if new messages were added (not just updates)
      // This prevents scrolling when the message list is merely refreshed (e.g., during agent run timer)
      const previousCount = this._previousMessageCount;
      this._previousMessageCount = messages.length;

      if (messages.length > previousCount) {
        this._shouldScrollToBottom = true;
      }
    } finally {
      // Re-attach change detection
      this.cdRef.reattach();
      this.cdRef.detectChanges();
    }
  }

  /**
   * Resolves the DISTINCT artifacts for a message (one entry per artifactId at its
   * latest version), lazy-loads them all, and applies them to the rendered
   * message-item. Loads in the background so the UI never blocks.
   *
   * WHY WE SURFACE THEM ALL (design rationale — see PR discussion w/ Pranav & Ethan):
   * A single message can legitimately carry more than one DISTINCT artifact — e.g. a
   * research report PLUS a *standalone* generated infographic. This is deliberately
   * NOT in conflict with the server-side consolidation in AgentRunner
   * (Pranav, 5664b86: "keep the report's embedded image in the report, not as a
   * duplicate artifact"): that logic only suppresses media that is *embedded inline*
   * (base64) in another artifact's payload — a true duplicate. Genuinely standalone
   * sibling artifacts (the report uses SVG charts; the infographic is a separate JPEG)
   * are correctly kept as separate artifacts, and the UI must show every one of them.
   *
   * The earlier `artifactList[length - 1]` ("show only the most recent") approach
   * (EL-BC, 95492622) assumed consolidation always left exactly one artifact per
   * message; when it legitimately leaves two, that silently hid the report behind the
   * image. Grouping by artifactId (latest version each) shows all distinct artifacts
   * while still collapsing multiple *versions* of the same artifact to one card.
   */
  private applyArtifactsToInstance(
    instance: MessageItemComponent,
    messageId: string,
    childCdRef: ChangeDetectorRef
  ): void {
    const infos = this.resolveDistinctArtifacts(messageId);
    if (infos.length === 0) {
      instance.artifacts = [];
      instance.artifact = undefined;
      instance.artifactVersion = undefined;
      return;
    }

    Promise.all(
      infos.map(info =>
        Promise.all([info.getArtifact(), info.getVersion()]).then(([artifact, version]) => ({ artifact, version }))
      )
    )
      .then(refs => {
        instance.artifacts = refs;
        // Keep the legacy single inputs pointed at the first entry for back-compat.
        instance.artifact = refs[0]?.artifact;
        instance.artifactVersion = refs[0]?.version;
        // zone.js 0.15: parent detectChanges doesn't propagate to dynamically created children
        childCdRef.detectChanges();
        this.cdRef.detectChanges();
      })
      .catch(err => {
        console.error('Failed to lazy-load artifacts:', err);
      });
  }

  /**
   * Groups a message's artifact list by artifactId, keeping the highest version of
   * each. Multiple versions of the SAME artifact collapse to one card (latest wins),
   * while genuinely distinct artifacts are all retained.
   */
  private resolveDistinctArtifacts(messageId: string): LazyArtifactInfo[] {
    const list = this.artifactMap.get(messageId);
    if (!list || list.length === 0) {
      return [];
    }
    return selectDistinctLatestArtifacts(list);
  }

  /**
   * Generates a unique key for a message
   * Uses ID if available, otherwise uses a temporary key
   */
  private getMessageKey(message: MJConversationDetailEntity): string {
    return message.ID && message.ID.length > 0
      ? message.ID
      : `temp_${message.__mj_CreatedAt?.getTime() || Date.now()}`;
  }

  /**
   * Determines whether to show the date filter dropdown
   * Only show if conversation is long and spans multiple days
   */
  private updateDateFilterVisibility(): void {
    if (!this.messages || this.messages.length < 20) {
      this.shouldShowDateFilter = false;
      return;
    }

    // Check if messages span more than 2 days
    const dates = this.messages
      .map(m => m.__mj_CreatedAt)
      .filter(d => d != null)
      .map(d => new Date(d!).setHours(0, 0, 0, 0));

    if (dates.length === 0) {
      this.shouldShowDateFilter = false;
      return;
    }

    const uniqueDates = new Set(dates);
    const daySpan = uniqueDates.size;

    // Show filter if conversation has 20+ messages and spans 3+ days
    this.shouldShowDateFilter = daySpan >= 3;
  }

  /**
   * Scrolls the message list to the bottom
   */
  private scrollToBottom(): void {
    if (this.scrollContainer && this.scrollContainer.nativeElement) {
      Promise.resolve().then(() => {
        const element = this.scrollContainer.nativeElement;
        element.scrollTop = element.scrollHeight;
      });
    }
  }

  /**
   * Removes a message from the rendered list
   * Called externally when a message is deleted
   */
  public removeMessage(message: MJConversationDetailEntity): void {
    const key = this.getMessageKey(message);
    const componentRef = this._renderedMessages.get(key);
    if (componentRef) {
      componentRef.destroy();
      this._renderedMessages.delete(key);
    }
  }
}