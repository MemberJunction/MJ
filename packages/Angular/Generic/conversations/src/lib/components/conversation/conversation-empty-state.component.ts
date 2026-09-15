import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { PendingAttachment } from '@memberjunction/ng-composer';
import { MessageInputComponent } from '../message/message-input.component';

@Component({
  standalone: false,
  selector: 'mj-conversation-empty-state',
  templateUrl: './conversation-empty-state.component.html',
  styleUrls: ['./conversation-empty-state.component.css']
})
export class ConversationEmptyStateComponent {
  @Input() CurrentUser!: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo {
    return this.CurrentUser;
  }
  @Input() Disabled: boolean = false;

  /** @deprecated Use {@link Disabled}. */
  @Input() set disabled(value: boolean) {
    this.Disabled = value;
  }
  /** @deprecated Use {@link Disabled}. */
  get disabled(): boolean {
    return this.Disabled;
  }
  @Input() ShowSidebarToggle: boolean = false;

  /** @deprecated Use {@link ShowSidebarToggle}. */
  @Input() set showSidebarToggle(value: boolean) {
    this.ShowSidebarToggle = value;
  }
  /** @deprecated Use {@link ShowSidebarToggle}. */
  get showSidebarToggle(): boolean {
    return this.ShowSidebarToggle;
  }
  @Input() EnableAttachments: boolean = false;

  /** @deprecated Use {@link EnableAttachments}. */
  @Input() set enableAttachments(value: boolean) {
    this.EnableAttachments = value;
  }
  /** @deprecated Use {@link EnableAttachments}. */
  get enableAttachments(): boolean {
    return this.EnableAttachments;
  }
  @Input() EnableMentions: boolean = true;

  /** @deprecated Use {@link EnableMentions}. */
  @Input() set enableMentions(value: boolean) {
    this.EnableMentions = value;
  }
  /** @deprecated Use {@link EnableMentions}. */
  get enableMentions(): boolean {
    return this.EnableMentions;
  }
  /** Per-type mention caps under enableMentions (all default true) — forwarded to the composer. */
  @Input() EnableAgentMentions: boolean = true;

  /** @deprecated Use {@link EnableAgentMentions}. */
  @Input() set enableAgentMentions(value: boolean) {
    this.EnableAgentMentions = value;
  }
  /** @deprecated Use {@link EnableAgentMentions}. */
  get enableAgentMentions(): boolean {
    return this.EnableAgentMentions;
  }
  @Input() EnableEntityMentions: boolean = true;

  /** @deprecated Use {@link EnableEntityMentions}. */
  @Input() set enableEntityMentions(value: boolean) {
    this.EnableEntityMentions = value;
  }
  /** @deprecated Use {@link EnableEntityMentions}. */
  get enableEntityMentions(): boolean {
    return this.EnableEntityMentions;
  }
  @Input() EnableSkillCommands: boolean = true;

  /** @deprecated Use {@link EnableSkillCommands}. */
  @Input() set enableSkillCommands(value: boolean) {
    this.EnableSkillCommands = value;
  }
  /** @deprecated Use {@link EnableSkillCommands}. */
  get enableSkillCommands(): boolean {
    return this.EnableSkillCommands;
  }
  /** Show the built-in suggested-prompt chips. Hosts that don't want the default prompt vocabulary set false. */
  @Input() ShowSuggestedPrompts: boolean = true;

  /** @deprecated Use {@link ShowSuggestedPrompts}. */
  @Input() set showSuggestedPrompts(value: boolean) {
    this.ShowSuggestedPrompts = value;
  }
  /** @deprecated Use {@link ShowSuggestedPrompts}. */
  get showSuggestedPrompts(): boolean {
    return this.ShowSuggestedPrompts;
  }
  @Input() MaxAttachments: number = 10;

  /** @deprecated Use {@link MaxAttachments}. */
  @Input() set maxAttachments(value: number) {
    this.MaxAttachments = value;
  }
  /** @deprecated Use {@link MaxAttachments}. */
  get maxAttachments(): number {
    return this.MaxAttachments;
  }
  @Input() MaxAttachmentSizeBytes: number = 20 * 1024 * 1024;

  /** @deprecated Use {@link MaxAttachmentSizeBytes}. */
  @Input() set maxAttachmentSizeBytes(value: number) {
    this.MaxAttachmentSizeBytes = value;
  }
  /** @deprecated Use {@link MaxAttachmentSizeBytes}. */
  get maxAttachmentSizeBytes(): number {
    return this.MaxAttachmentSizeBytes;
  }
  @Input() AcceptedFileTypes: string = 'image/*';

  /** @deprecated Use {@link AcceptedFileTypes}. */
  @Input() set acceptedFileTypes(value: string) {
    this.AcceptedFileTypes = value;
  }
  /** @deprecated Use {@link AcceptedFileTypes}. */
  get acceptedFileTypes(): string {
    return this.AcceptedFileTypes;
  }

  /** Greeting text shown in the empty state. Set by host app via overlay/chat-area chain. */
  @Input() Greeting: string = 'How can I help you?';

  /** @deprecated Use {@link Greeting}. */
  @Input() set greeting(value: string) {
    this.Greeting = value;
  }
  /** @deprecated Use {@link Greeting}. */
  get greeting(): string {
    return this.Greeting;
  }

  /** When true (overlay context), suggested prompts are hidden to save space */
  private _overlayMode = false;
  @Input()
  set overlayMode(value: boolean) {
      this._overlayMode = value;
      if (value) {
          this.SuggestedPrompts = [];
      }
  }
  get overlayMode(): boolean {
      return this._overlayMode;
  }

  @ViewChild(MessageInputComponent) private messageInput?: MessageInputComponent;

  /** Draft staged into the composer on mount (see MessageInputComponent.initialDraft). */
  @Input() InitialDraft: string | null = null;

  /** @deprecated Use {@link InitialDraft}. */
  @Input() set initialDraft(value: string | null) {
    this.InitialDraft = value;
  }
  /** @deprecated Use {@link InitialDraft}. */
  get initialDraft(): string | null {
    return this.InitialDraft;
  }
  @Output() InitialDraftApplied = new EventEmitter<void>();

  /**
   * @deprecated Use {@link InitialDraftApplied}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (initialDraftApplied) keeps working. Must stay AFTER InitialDraftApplied: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() initialDraftApplied = this.InitialDraftApplied;
  /** Forwarded from the inner composer — serialized draft on every value change. */
  @Output() DraftStateChanged = new EventEmitter<string>();
  /** Forwarded from the inner composer — persist-drafts save point. */
  @Output() ComposerBlurred = new EventEmitter<void>();

  @Output() MessageSent = new EventEmitter<{text: string; attachments: PendingAttachment[]}>();

  /**
   * @deprecated Use {@link MessageSent}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (messageSent) keeps working. Must stay AFTER MessageSent: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() messageSent = this.MessageSent;
  @Output() SidebarToggleClicked = new EventEmitter<void>();

  /**
   * @deprecated Use {@link SidebarToggleClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (sidebarToggleClicked) keeps working. Must stay AFTER SidebarToggleClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() sidebarToggleClicked = this.SidebarToggleClicked;

  public MessageText: string = '';

  /** @deprecated Use {@link MessageText}. */
  public get messageText(): string {
    return this.MessageText;
  }
  /** @deprecated Use {@link MessageText}. */
  public set messageText(value: string) {
    this.MessageText = value;
  }

  // All available suggested prompts (business user focused)
  private allSuggestedPrompts: Array<{icon: string; title: string; prompt: string}> = [
    // Data Analysis & Insights
    {
      icon: 'fa-solid fa-clock-rotate-left',
      title: 'Recent changes',
      prompt: 'Show me what\'s changed in my data recently'
    },
    {
      icon: 'fa-solid fa-list-check',
      title: 'Pending items',
      prompt: 'Find all my incomplete or pending items'
    },
    {
      icon: 'fa-solid fa-magnifying-glass',
      title: 'Search everything',
      prompt: 'Search everything in my system for a specific topic'
    },
    {
      icon: 'fa-solid fa-clipboard-check',
      title: 'Data quality',
      prompt: 'Analyze my data and find duplicates or inconsistencies'
    },
    {
      icon: 'fa-solid fa-inbox',
      title: 'Catch up',
      prompt: 'Create a summary of activity while I was away'
    },

    // Research & Information Gathering
    {
      icon: 'fa-solid fa-download',
      title: 'Research & save',
      prompt: 'Research a topic and save the findings to my database'
    },
    {
      icon: 'fa-solid fa-code-compare',
      title: 'Compare sources',
      prompt: 'Compare my data with information from the web'
    },
    {
      icon: 'fa-solid fa-folder-open',
      title: 'Search files',
      prompt: 'Search my files and documents for related information'
    },
    {
      icon: 'fa-solid fa-layer-group',
      title: 'Multi-source search',
      prompt: 'Find relevant information across all my data sources'
    },
    {
      icon: 'fa-solid fa-sitemap',
      title: 'Comprehensive research',
      prompt: 'Gather information on a topic from multiple sources'
    },

    // Automation & Agent Building
    {
      icon: 'fa-solid fa-calendar-day',
      title: 'Daily summaries',
      prompt: 'Create an agent to send me daily data summaries'
    },
    {
      icon: 'fa-solid fa-bell',
      title: 'Change alerts',
      prompt: 'Build an agent that monitors data changes and alerts me'
    },
    {
      icon: 'fa-solid fa-chart-column',
      title: 'Automated reports',
      prompt: 'Design an agent to aggregate data and create reports'
    },
    {
      icon: 'fa-solid fa-arrows-rotate',
      title: 'Data sync',
      prompt: 'Help me create an agent that syncs data with external systems'
    },
    {
      icon: 'fa-solid fa-file-import',
      title: 'File processor',
      prompt: 'Build an agent that processes files and updates my database'
    },
    {
      icon: 'fa-brands fa-slack',
      title: 'Slack notifications',
      prompt: 'Create an agent to post updates to Slack when data changes'
    },
    {
      icon: 'fa-solid fa-broom',
      title: 'Data cleanup',
      prompt: 'Design an agent that validates and cleans up my data regularly'
    },
    {
      icon: 'fa-solid fa-chart-pie',
      title: 'Auto visualizations',
      prompt: 'Build an agent that generates visualizations from my data'
    },
    {
      icon: 'fa-solid fa-graduation-cap',
      title: 'Research compiler',
      prompt: 'Create an agent to research topics and compile findings'
    },
    {
      icon: 'fa-solid fa-diagram-project',
      title: 'Workflow automation',
      prompt: 'Help me design a workflow agent with approval steps'
    }
  ];

  // Randomly selected prompts to display (refreshed on each load)
  public SuggestedPrompts: Array<{icon: string; title: string; prompt: string}> = [];

  /** @deprecated Use {@link SuggestedPrompts}. */
  public get suggestedPrompts(): Array<{icon: string; title: string; prompt: string}> {
    return this.SuggestedPrompts;
  }
  /** @deprecated Use {@link SuggestedPrompts}. */
  public set suggestedPrompts(value: Array<{icon: string; title: string; prompt: string}>) {
    this.SuggestedPrompts = value;
  }

  constructor() {
    // Select 4 random prompts on initialization
    this.SuggestedPrompts = this.selectRandomPrompts(4);
  }

  /**
   * Select random prompts from the full list
   */
  private selectRandomPrompts(count: number): Array<{icon: string; title: string; prompt: string}> {
    const shuffled = [...this.allSuggestedPrompts].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Focus the message input programmatically.
   * Called by parent when the user clicks "New Conversation" while already on the empty state.
   */
  /**
   * Pre-addresses the composer to an agent as a resolved mention pill (delegates to
   * MessageInputComponent.InsertAgentMention). Returns false while the input isn't
   * mounted — callers may retry.
   */
  public async InsertAgentMention(agentName: string, focus: boolean = true): Promise<boolean> {
    if (!this.messageInput) {
      return false;
    }
    return this.messageInput.InsertAgentMention(agentName, focus);
  }

  public FocusInput(): void {
    setTimeout(() => {
      if (this.messageInput) {
        this.messageInput.inputBox?.focus();
      }
    }, 100);
  }

  OnEmptyStateSubmit(event: {text: string; attachments: PendingAttachment[]}): void {
    this.MessageSent.emit(event);
  }

  /** @deprecated Use {@link OnEmptyStateSubmit}. */
  onEmptyStateSubmit(event: {text: string; attachments: PendingAttachment[]}): void {
    return this.OnEmptyStateSubmit(event);
  }

  OnSuggestedPromptClicked(prompt: string): void {
    if (!this.Disabled) {
      this.MessageSent.emit({ text: prompt, attachments: [] });
    }
  }

  /** @deprecated Use {@link OnSuggestedPromptClicked}. */
  onSuggestedPromptClicked(prompt: string): void {
    return this.OnSuggestedPromptClicked(prompt);
  }
}
