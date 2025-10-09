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
  AfterViewChecked
} from '@angular/core';
import { ConversationDetailEntity, ConversationEntity, AIAgentRunEntityExtended, ArtifactEntity, ArtifactVersionEntity } from '@memberjunction/core-entities';
import { UserInfo, CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MessageItemComponent } from './message-item.component';

/**
 * Container component for displaying a list of messages
 * Uses dynamic component creation (like skip-chat) to avoid Angular binding overhead
 * This dramatically improves performance when messages are added/removed
 */
@Component({
  selector: 'mj-conversation-message-list',
  templateUrl: './message-list.component.html',
  styleUrls: ['./message-list.component.css']
})
export class MessageListComponent extends BaseAngularComponent implements OnInit, OnDestroy, OnChanges, AfterViewChecked {
  @Input() public messages: ConversationDetailEntity[] = [];
  @Input() public conversation!: ConversationEntity | null;
  @Input() public currentUser!: UserInfo;
  @Input() public isProcessing: boolean = false;
  @Input() public artifactMap: Map<string, {artifact: ArtifactEntity; version: ArtifactVersionEntity}> = new Map();
  @Input() public agentRunMap: Map<string, AIAgentRunEntityExtended> = new Map();

  @Output() public pinMessage = new EventEmitter<ConversationDetailEntity>();
  @Output() public editMessage = new EventEmitter<ConversationDetailEntity>();
  @Output() public deleteMessage = new EventEmitter<ConversationDetailEntity>();
  @Output() public retryMessage = new EventEmitter<ConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();
  @Output() public replyInThread = new EventEmitter<ConversationDetailEntity>();
  @Output() public viewThread = new EventEmitter<ConversationDetailEntity>();
  @Output() public messageEdited = new EventEmitter<ConversationDetailEntity>();
  @Output() public openEntityRecord = new EventEmitter<{entityName: string; compositeKey: CompositeKey}>();

  @ViewChild('messageContainer', { read: ViewContainerRef }) messageContainerRef!: ViewContainerRef;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef;

  private _renderedMessages = new Map<string, any>();
  private _shouldScrollToBottom = false;

  public currentDateDisplay: string = 'Today';
  public showDateNav: boolean = false;

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

  ngOnInit() {
    // Initial render will happen in AfterViewInit
  }

  ngOnChanges(changes: SimpleChanges) {
    // React to messages array changes
    if (changes['messages'] && this.messages && this.messageContainerRef) {
      this.updateMessages(this.messages);
    }

    // React to artifact map changes (when artifacts are added/updated)
    if (changes['artifactMap'] && this.messages && this.messageContainerRef) {
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
  set messagesUpdate(messages: ConversationDetailEntity[]) {
    if (messages && this.messageContainerRef) {
      this.updateMessages(messages);
    }
  }

  /**
   * Updates the message list using dynamic component creation
   * Only adds/removes changed messages for optimal performance
   */
  private updateMessages(messages: ConversationDetailEntity[]): void {
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
          instance.message = message;
          instance.allMessages = messages;
          instance.isProcessing = this.isProcessing;
          const artifactInfo = this.artifactMap.get(message.ID);
          instance.artifact = artifactInfo?.artifact;
          instance.artifactVersion = artifactInfo?.version;
          // Update agent run from map
          instance.agentRun = this.agentRunMap.get(message.ID) || null;
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
          const artifactInfo = this.artifactMap.get(message.ID);
          instance.artifact = artifactInfo?.artifact;
          instance.artifactVersion = artifactInfo?.version;
          // Pass agent run from map (loaded once per conversation)
          const agentRun = this.agentRunMap.get(message.ID) || null;
          console.log(`✨ Creating new message ${message.ID} component with agentRun:`, {
            messageId: message.ID,
            agentRunExists: !!agentRun,
            agentRunId: agentRun?.ID,
            mapSize: this.agentRunMap.size,
            mapHasKey: this.agentRunMap.has(message.ID)
          });
          instance.agentRun = agentRun;

          // Subscribe to outputs
          instance.pinClicked.subscribe((msg: ConversationDetailEntity) => this.pinMessage.emit(msg));
          instance.editClicked.subscribe((msg: ConversationDetailEntity) => this.editMessage.emit(msg));
          instance.deleteClicked.subscribe((msg: ConversationDetailEntity) => this.deleteMessage.emit(msg));
          instance.retryClicked.subscribe((msg: ConversationDetailEntity) => this.retryMessage.emit(msg));
          instance.artifactClicked.subscribe((data: {artifactId: string; versionId?: string}) => this.artifactClicked.emit(data));
          instance.messageEdited.subscribe((msg: ConversationDetailEntity) => this.messageEdited.emit(msg));
          instance.openEntityRecord.subscribe((data: {entityName: string; compositeKey: CompositeKey}) => this.openEntityRecord.emit(data));

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

      // Scroll to bottom if this is a new message
      if (messages.length > 0) {
        this._shouldScrollToBottom = true;
      }
    } finally {
      // Re-attach change detection
      this.cdRef.reattach();
      this.cdRef.detectChanges();
    }
  }

  /**
   * Generates a unique key for a message
   * Uses ID if available, otherwise uses a temporary key
   */
  private getMessageKey(message: ConversationDetailEntity): string {
    return message.ID && message.ID.length > 0
      ? message.ID
      : `temp_${message.__mj_CreatedAt?.getTime() || Date.now()}`;
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
  public removeMessage(message: ConversationDetailEntity): void {
    const key = this.getMessageKey(message);
    const componentRef = this._renderedMessages.get(key);
    if (componentRef) {
      componentRef.destroy();
      this._renderedMessages.delete(key);
    }
  }
}