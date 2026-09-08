import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MentionSuggestion,
  ComposerTriggerProvider,
  MentionEditorComponent,
  MessageInputBoxComponent,
  PendingAttachment,
  BeforeSkillsOpenedEventArgs
} from '@memberjunction/ng-composer';
import { AgentMentionProvider } from '../../composer-plugins/agent-mention.provider';
import { RecordMentionProvider } from '../../composer-plugins/record-mention.provider';
import { SkillCommandProvider } from '../../composer-plugins/skill-command.provider';

/**
 * AI-aware composer: wraps the generic `<mj-message-input-box>` (from
 * `@memberjunction/ng-composer`, which ships zero AI knowledge) and builds the AI
 * trigger plugins in — '@' agent/user mentions, '#' entity/query record mentions, and
 * '/' skill commands — while proxying the input box's full surface (inputs, outputs,
 * and public methods).
 *
 * The familiar granular flags live HERE now:
 * - `EnableAgentMentions` (default true) — the '@' trigger
 * - `EnableEntityMentions` (default true) — the '#' trigger
 * - `EnableSkillCommands` (default true) — the '/' trigger
 * plus the pass-through `enableMentions` master switch.
 *
 * The wrapper always runs the inner editor in EXPLICIT provider-list mode (it owns the
 * list; it deliberately does not proxy `TriggerProviders` / `ExcludedTriggerKeys` — use
 * the raw `<mj-message-input-box>` when you need custom providers or discovery mode).
 */
@Component({
  standalone: false,
  selector: 'mj-ai-composer',
  template: `
    <mj-message-input-box
      #inputBox
      [Placeholder]="placeholder"
      [Disabled]="disabled"
      [Value]="value"
      [ShowCharacterCount]="showCharacterCount"
      [EnableMentions]="enableMentions"
      [TriggerProviders]="ActiveTriggerProviders"
      [Provider]="Provider"
      [CurrentUser]="currentUser"
      [Rows]="rows"
      [EnableAttachments]="enableAttachments"
      [MaxAttachments]="maxAttachments"
      [MaxAttachmentSizeBytes]="maxAttachmentSizeBytes"
      [AcceptedFileTypes]="acceptedFileTypes"
      [EnableRealtime]="enableRealtime"
      [VoiceActive]="voiceActive"
      [CanStartRealtime]="canStartRealtime"
      [EnablePlanMode]="enablePlanMode"
      [EnableSkills]="EnableSkillCommands"
      [PlanModeActive]="planModeActive"
      (TextSubmitted)="textSubmitted.emit($event)"
      (Blurred)="blurred.emit()"
      (ValueChange)="onInnerValueChange($event)"
      (AttachmentsChanged)="attachmentsChanged.emit($event)"
      (AttachmentError)="attachmentError.emit($event)"
      (AttachmentClicked)="attachmentClicked.emit($event)"
      (VoiceRequested)="voiceRequested.emit()"
      (VoiceOptionsRequested)="voiceOptionsRequested.emit()"
      (PlanModeToggle)="planModeToggle.emit()"
      (BeforeSkillsOpened)="beforeSkillsOpened.emit($event)"
      (AfterSkillsOpened)="afterSkillsOpened.emit()">
    </mj-message-input-box>
  `
})
export class AiComposerComponent {
  @ViewChild('inputBox') inputBox?: MessageInputBoxComponent;

  // ── AI convenience flags (the wrapper's reason to exist) ─────────────────────────
  private _enableAgentMentions: boolean = true;
  private _enableEntityMentions: boolean = true;
  private _enableSkillCommands: boolean = true;
  private _activeTriggerProviders: ComposerTriggerProvider[] = [];

  // One instance per plugin per composer — all instances share the singleton
  // MentionAutocompleteService engine, so there is no duplicate cache warm-up.
  private readonly agentMentionProvider = new AgentMentionProvider();
  private readonly recordMentionProvider = new RecordMentionProvider();
  private readonly skillCommandProvider = new SkillCommandProvider();

  /**
   * The agent the message is expected to go to, when the host knows it (`mj-message-input` binds an
   * explicit `@agent` chip in the draft, else its resolved continuity/pinned/default agent). Narrows
   * the '/' skill picker to the skills that agent accepts (`AcceptsSkills` + `MJ: AI Agent Skills`
   * grants). Null = unknown, no narrowing — the server's RequestedSkills guard is the backstop.
   */
  @Input()
  set TargetAgentId(value: string | null) {
    this.skillCommandProvider.TargetAgentId = value ?? null;
  }
  get TargetAgentId(): string | null {
    return this.skillCommandProvider.TargetAgentId;
  }

  constructor() {
    this.rebuildTriggerProviders();
  }

  /** Enables the '@' trigger (agent + user mentions). */
  @Input()
  set EnableAgentMentions(value: boolean) {
    if (value !== this._enableAgentMentions) {
      this._enableAgentMentions = value;
      this.rebuildTriggerProviders();
    }
  }
  get EnableAgentMentions(): boolean {
    return this._enableAgentMentions;
  }

  /** Enables the '#' trigger (entity + query record mentions). */
  @Input()
  set EnableEntityMentions(value: boolean) {
    if (value !== this._enableEntityMentions) {
      this._enableEntityMentions = value;
      this.rebuildTriggerProviders();
    }
  }
  get EnableEntityMentions(): boolean {
    return this._enableEntityMentions;
  }

  /** Enables the '/' trigger (skill commands). */
  @Input()
  set EnableSkillCommands(value: boolean) {
    if (value !== this._enableSkillCommands) {
      this._enableSkillCommands = value;
      this.rebuildTriggerProviders();
    }
  }
  get EnableSkillCommands(): boolean {
    return this._enableSkillCommands;
  }

  /** The explicit provider list bound to the inner editor (stable reference; rebuilt only when a flag flips). */
  public get ActiveTriggerProviders(): ComposerTriggerProvider[] {
    return this._activeTriggerProviders;
  }

  private rebuildTriggerProviders(): void {
    const providers: ComposerTriggerProvider[] = [];
    if (this._enableAgentMentions) providers.push(this.agentMentionProvider);
    if (this._enableEntityMentions) providers.push(this.recordMentionProvider);
    if (this._enableSkillCommands) providers.push(this.skillCommandProvider);
    this._activeTriggerProviders = providers;
  }

  // ── Proxied inputs (identical names/defaults to MessageInputBoxComponent) ────────
  @Input() placeholder: string = 'Type your message to start a new conversation...';
  @Input() disabled: boolean = false;
  @Input() value: string = '';
  @Input() showCharacterCount: boolean = false;
  /** Master switch for all mention/command triggers (pass-through). */
  @Input() enableMentions: boolean = true;
  /** Optional metadata provider scoping this composer (pass-through to the trigger plugins). */
  @Input() Provider: IMetadataProvider | null = null;
  @Input() currentUser?: UserInfo;
  @Input() rows: number = 3;
  @Input() enableAttachments: boolean = true;
  @Input() maxAttachments: number = 10;
  @Input() maxAttachmentSizeBytes: number = 20 * 1024 * 1024; // 20MB
  @Input() acceptedFileTypes: string = 'image/*';
  @Input() enableRealtime: boolean = false;
  @Input() voiceActive: boolean = false;
  @Input() canStartRealtime: boolean = true;
  @Input() enablePlanMode: boolean = false;
  @Input() planModeActive: boolean = false;

  // ── Proxied outputs ───────────────────────────────────────────────────────────────
  @Output() textSubmitted = new EventEmitter<string>();
  /** Composer lost focus — hosts persist drafts on this. */
  @Output() blurred = new EventEmitter<void>();
  @Output() valueChange = new EventEmitter<string>();
  @Output() attachmentsChanged = new EventEmitter<PendingAttachment[]>();
  @Output() attachmentError = new EventEmitter<string>();
  @Output() attachmentClicked = new EventEmitter<PendingAttachment>();
  @Output() voiceRequested = new EventEmitter<void>();
  @Output() voiceOptionsRequested = new EventEmitter<void>();
  @Output() planModeToggle = new EventEmitter<void>();
  /**
   * Before/After pair for the Skills button, proxied straight through from the input box. Gated on
   * `EnableSkillCommands` — the button and the keystroke are two doors to the same feature, so one
   * flag governs both rather than letting a composer advertise skills it will not serve.
   *
   * Cancel on `beforeSkillsOpened` vetoes the dropdown; `afterSkillsOpened` then does not fire.
   */
  @Output() beforeSkillsOpened = new EventEmitter<BeforeSkillsOpenedEventArgs>();
  @Output() afterSkillsOpened = new EventEmitter<void>();

  onInnerValueChange(newValue: string): void {
    this.value = newValue;
    this.valueChange.emit(newValue);
  }

  // ── Proxied public methods (ViewChild delegation) ─────────────────────────────────

  /** The inner mention editor — kept reachable for hosts that drive it directly (e.g. clear-after-programmatic-send). */
  public get mentionEditor(): MentionEditorComponent | undefined {
    return this.inputBox?.mentionEditor;
  }

  /** Focus the composer input. */
  /** Inserts a resolved mention chip + space (see MentionEditorComponent.InsertMention). */
  public InsertMention(suggestion: MentionSuggestion, focus: boolean = true): boolean {
    return this.inputBox?.InsertMention(suggestion, focus) ?? false;
  }

  /** Focus with the caret at the end of content. */
  public FocusCaretAtEnd(): boolean {
    return this.inputBox?.FocusCaretAtEnd() ?? false;
  }

  public focus(): void {
    this.inputBox?.focus();
  }

  /** Clear the editor content and pending attachments. */
  public clear(): void {
    this.inputBox?.mentionEditor?.clear();
  }

  /** Mention chip data (id/type/name + preset info) currently in the editor. */
  public getMentionChipsData(): Array<{ id: string; type: string; name: string; presetId?: string; presetName?: string }> {
    return this.inputBox?.GetMentionChipsData() || [];
  }

  /** Plain text with mentions encoded as JSON (`@{"type":...}`) — the persistence format. */
  public getPlainTextWithJsonMentions(): string {
    return this.inputBox?.mentionEditor?.getPlainTextWithJsonMentions() || '';
  }

  /** Pending (not yet uploaded) attachments. */
  public getPendingAttachments(): PendingAttachment[] {
    return this.inputBox?.GetPendingAttachments() || [];
  }

  /** Open the attachment file picker programmatically. */
  public openFilePicker(): void {
    this.inputBox?.OpenFilePicker();
  }

  /** Attach an artifact as a pending attachment (artifact picker flow). */
  public AddArtifactAttachment(artifact: {
    fileID: string; fileName: string; mimeType: string;
    sizeBytes: number; artifactVersionId?: string;
  }): PendingAttachment | undefined {
    return this.inputBox?.AddArtifactAttachment(artifact);
  }
}
