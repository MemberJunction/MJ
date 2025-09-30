import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectorRef,
  OnDestroy,
  AfterViewInit
} from '@angular/core';
import { ConversationDetailEntity, ConversationEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * Component for displaying a single message in a conversation
 * Follows the dynamic rendering pattern from skip-chat for optimal performance
 * This component is created dynamically via ViewContainerRef.createComponent()
 */
@Component({
  selector: 'mj-conversation-message-item',
  templateUrl: './message-item.component.html',
  styleUrls: ['./message-item.component.css']
})
export class MessageItemComponent extends BaseAngularComponent implements AfterViewInit, OnDestroy {
  @Input() public message!: ConversationDetailEntity;
  @Input() public conversation!: ConversationEntity | null;
  @Input() public currentUser!: UserInfo;
  @Input() public allMessages!: ConversationDetailEntity[];
  @Input() public isProcessing: boolean = false;

  @Output() public pinClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public editClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public deleteClicked = new EventEmitter<ConversationDetailEntity>();
  @Output() public artifactClicked = new EventEmitter<{artifactId: string; versionId?: string}>();

  private _loadTime: number = Date.now();
  private _elapsedTimeInterval: any = null;
  public _elapsedTimeFormatted: string = '(0:00)';

  constructor(private cdRef: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit() {
    this._loadTime = Date.now();
    this.startElapsedTimeUpdater();
    this.cdRef.detectChanges();
  }

  ngOnDestroy() {
    if (this._elapsedTimeInterval !== null) {
      clearInterval(this._elapsedTimeInterval);
      this._elapsedTimeInterval = null;
    }
  }

  /**
   * Starts the elapsed time updater interval for temporary messages
   */
  private startElapsedTimeUpdater(): void {
    if (this.isTemporaryMessage) {
      Promise.resolve().then(() => {
        this._elapsedTimeFormatted = this.formatElapsedTime(this.elapsedTimeSinceLoad);
        this.cdRef.detectChanges();
      });

      if (this._elapsedTimeInterval === null) {
        this._elapsedTimeInterval = setInterval(() => {
          this._elapsedTimeFormatted = this.formatElapsedTime(this.elapsedTimeSinceLoad);
          Promise.resolve().then(() => {
            this.cdRef.detectChanges();
          });
        }, 1000);
      }
    }
  }

  private formatElapsedTime(elapsedTime: number): string {
    let seconds = Math.floor(elapsedTime / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    let formattedTime = (hours > 0 ? hours + ':' : '') +
      (minutes < 10 && hours > 0 ? '0' : '') + minutes + ':' +
      (seconds < 10 ? '0' : '') + seconds;
    return `(${formattedTime})`;
  }

  public get elapsedTimeSinceLoad(): number {
    return Date.now() - this._loadTime;
  }

  public get isAIMessage(): boolean {
    return this.message.Role?.trim().toLowerCase() === 'ai';
  }

  public get isUserMessage(): boolean {
    return this.message.Role?.trim().toLowerCase() === 'user';
  }

  public get isTemporaryMessage(): boolean {
    return this.isAIMessage && (!this.message.ID || this.message.ID.length === 0);
  }

  public get isFirstMessageInConversation(): boolean {
    return this.allMessages.indexOf(this.message) === 0;
  }

  public get isLastMessageInConversation(): boolean {
    return this.allMessages.indexOf(this.message) === this.allMessages.length - 1;
  }

  public get hasArtifact(): boolean {
    return !!this.message.ArtifactID && this.message.ArtifactID.length > 0;
  }

  public get messageClasses(): string {
    const classes: string[] = ['message-item'];
    if (this.isAIMessage) {
      classes.push('ai-message');
      if (this.isTemporaryMessage) {
        classes.push('in-progress');
      }
    } else if (this.isUserMessage) {
      classes.push('user-message');
    }
    if (this.message.IsPinned) {
      classes.push('pinned');
    }
    return classes.join(' ');
  }

  public onPinClick(): void {
    if (!this.isProcessing) {
      this.pinClicked.emit(this.message);
    }
  }

  public onEditClick(): void {
    if (!this.isProcessing) {
      this.editClicked.emit(this.message);
    }
  }

  public onDeleteClick(): void {
    if (!this.isProcessing) {
      this.deleteClicked.emit(this.message);
    }
  }

  public onArtifactClick(): void {
    if (this.hasArtifact) {
      this.artifactClicked.emit({
        artifactId: this.message.ArtifactID!,
        versionId: this.message.ArtifactVersionID || undefined
      });
    }
  }
}