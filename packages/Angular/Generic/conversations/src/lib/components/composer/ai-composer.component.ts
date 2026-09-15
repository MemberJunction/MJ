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
  @ViewChild('inputBox') InputBox?: MessageInputBoxComponent;

  /** @deprecated Use {@link InputBox}. */
  get inputBox(): MessageInputBoxComponent | undefined {
    return this.InputBox;
  }
  /** @deprecated Use {@link InputBox}. */
  set inputBox(value: MessageInputBoxComponent | undefined) {
    this.InputBox = value;
  }

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
  @Input() Placeholder: string = 'Type your message to start a new conversation...';

  /** @deprecated Use {@link Placeholder}. */
  @Input() set placeholder(value: string) {
    this.Placeholder = value;
  }
  /** @deprecated Use {@link Placeholder}. */
  get placeholder(): string {
    return this.Placeholder;
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
  @Input() Value: string = '';

  /** @deprecated Use {@link Value}. */
  @Input() set value(value: string) {
    this.Value = value;
  }
  /** @deprecated Use {@link Value}. */
  get value(): string {
    return this.Value;
  }
  @Input() ShowCharacterCount: boolean = false;

  /** @deprecated Use {@link ShowCharacterCount}. */
  @Input() set showCharacterCount(value: boolean) {
    this.ShowCharacterCount = value;
  }
  /** @deprecated Use {@link ShowCharacterCount}. */
  get showCharacterCount(): boolean {
    return this.ShowCharacterCount;
  }
  /** Master switch for all mention/command triggers (pass-through). */
  @Input() EnableMentions: boolean = true;

  /** @deprecated Use {@link EnableMentions}. */
  @Input() set enableMentions(value: boolean) {
    this.EnableMentions = value;
  }
  /** @deprecated Use {@link EnableMentions}. */
  get enableMentions(): boolean {
    return this.EnableMentions;
  }
  /** Optional metadata provider scoping this composer (pass-through to the trigger plugins). */
  @Input() Provider: IMetadataProvider | null = null;
  @Input() CurrentUser?: UserInfo;

  /** @deprecated Use {@link CurrentUser}. */
  @Input() set currentUser(value: UserInfo | undefined) {
    this.CurrentUser = value;
  }
  /** @deprecated Use {@link CurrentUser}. */
  get currentUser(): UserInfo | undefined {
    return this.CurrentUser;
  }
  @Input() Rows: number = 3;

  /** @deprecated Use {@link Rows}. */
  @Input() set rows(value: number) {
    this.Rows = value;
  }
  /** @deprecated Use {@link Rows}. */
  get rows(): number {
    return this.Rows;
  }
  @Input() EnableAttachments: boolean = true;

  /** @deprecated Use {@link EnableAttachments}. */
  @Input() set enableAttachments(value: boolean) {
    this.EnableAttachments = value;
  }
  /** @deprecated Use {@link EnableAttachments}. */
  get enableAttachments(): boolean {
    return this.EnableAttachments;
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
  } // 20MB
  @Input() AcceptedFileTypes: string = 'image/*';

  /** @deprecated Use {@link AcceptedFileTypes}. */
  @Input() set acceptedFileTypes(value: string) {
    this.AcceptedFileTypes = value;
  }
  /** @deprecated Use {@link AcceptedFileTypes}. */
  get acceptedFileTypes(): string {
    return this.AcceptedFileTypes;
  }
  @Input() EnableRealtime: boolean = false;

  /** @deprecated Use {@link EnableRealtime}. */
  @Input() set enableRealtime(value: boolean) {
    this.EnableRealtime = value;
  }
  /** @deprecated Use {@link EnableRealtime}. */
  get enableRealtime(): boolean {
    return this.EnableRealtime;
  }
  @Input() VoiceActive: boolean = false;

  /** @deprecated Use {@link VoiceActive}. */
  @Input() set voiceActive(value: boolean) {
    this.VoiceActive = value;
  }
  /** @deprecated Use {@link VoiceActive}. */
  get voiceActive(): boolean {
    return this.VoiceActive;
  }
  @Input() CanStartRealtime: boolean = true;

  /** @deprecated Use {@link CanStartRealtime}. */
  @Input() set canStartRealtime(value: boolean) {
    this.CanStartRealtime = value;
  }
  /** @deprecated Use {@link CanStartRealtime}. */
  get canStartRealtime(): boolean {
    return this.CanStartRealtime;
  }
  @Input() EnablePlanMode: boolean = false;

  /** @deprecated Use {@link EnablePlanMode}. */
  @Input() set enablePlanMode(value: boolean) {
    this.EnablePlanMode = value;
  }
  /** @deprecated Use {@link EnablePlanMode}. */
  get enablePlanMode(): boolean {
    return this.EnablePlanMode;
  }
  @Input() PlanModeActive: boolean = false;

  /** @deprecated Use {@link PlanModeActive}. */
  @Input() set planModeActive(value: boolean) {
    this.PlanModeActive = value;
  }
  /** @deprecated Use {@link PlanModeActive}. */
  get planModeActive(): boolean {
    return this.PlanModeActive;
  }

  // ── Proxied outputs ───────────────────────────────────────────────────────────────
  @Output() TextSubmitted = new EventEmitter<string>();

  /**
   * @deprecated Use {@link TextSubmitted}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (textSubmitted) keeps working. Must stay AFTER TextSubmitted: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() textSubmitted = this.TextSubmitted;
  /** Composer lost focus — hosts persist drafts on this. */
  @Output() Blurred = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Blurred}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (blurred) keeps working. Must stay AFTER Blurred: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() blurred = this.Blurred;
  @Output() ValueChange = new EventEmitter<string>();

  /**
   * @deprecated Use {@link ValueChange}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (valueChange) keeps working. Must stay AFTER ValueChange: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() valueChange = this.ValueChange;
  @Output() AttachmentsChanged = new EventEmitter<PendingAttachment[]>();

  /**
   * @deprecated Use {@link AttachmentsChanged}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (attachmentsChanged) keeps working. Must stay AFTER AttachmentsChanged: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() attachmentsChanged = this.AttachmentsChanged;
  @Output() AttachmentError = new EventEmitter<string>();

  /**
   * @deprecated Use {@link AttachmentError}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (attachmentError) keeps working. Must stay AFTER AttachmentError: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() attachmentError = this.AttachmentError;
  @Output() AttachmentClicked = new EventEmitter<PendingAttachment>();

  /**
   * @deprecated Use {@link AttachmentClicked}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (attachmentClicked) keeps working. Must stay AFTER AttachmentClicked: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() attachmentClicked = this.AttachmentClicked;
  @Output() VoiceRequested = new EventEmitter<void>();

  /**
   * @deprecated Use {@link VoiceRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (voiceRequested) keeps working. Must stay AFTER VoiceRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() voiceRequested = this.VoiceRequested;
  @Output() VoiceOptionsRequested = new EventEmitter<void>();

  /**
   * @deprecated Use {@link VoiceOptionsRequested}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (voiceOptionsRequested) keeps working. Must stay AFTER VoiceOptionsRequested: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() voiceOptionsRequested = this.VoiceOptionsRequested;
  @Output() PlanModeToggle = new EventEmitter<void>();

  /**
   * @deprecated Use {@link PlanModeToggle}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (planModeToggle) keeps working. Must stay AFTER PlanModeToggle: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() planModeToggle = this.PlanModeToggle;
  /**
   * Before/After pair for the Skills button, proxied straight through from the input box. Gated on
   * `EnableSkillCommands` — the button and the keystroke are two doors to the same feature, so one
   * flag governs both rather than letting a composer advertise skills it will not serve.
   *
   * Cancel on `beforeSkillsOpened` vetoes the dropdown; `afterSkillsOpened` then does not fire.
   */
  @Output() BeforeSkillsOpened = new EventEmitter<BeforeSkillsOpenedEventArgs>();

  /**
   * @deprecated Use {@link BeforeSkillsOpened}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (beforeSkillsOpened) keeps working. Must stay AFTER BeforeSkillsOpened: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() beforeSkillsOpened = this.BeforeSkillsOpened;
  @Output() AfterSkillsOpened = new EventEmitter<void>();

  /**
   * @deprecated Use {@link AfterSkillsOpened}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (afterSkillsOpened) keeps working. Must stay AFTER AfterSkillsOpened: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() afterSkillsOpened = this.AfterSkillsOpened;

  OnInnerValueChange(newValue: string): void {
    this.Value = newValue;
    this.ValueChange.emit(newValue);
  }

  /** @deprecated Use {@link OnInnerValueChange}. */
  onInnerValueChange(newValue: string): void {
    return this.OnInnerValueChange(newValue);
  }

  // ── Proxied public methods (ViewChild delegation) ─────────────────────────────────

  /** The inner mention editor — kept reachable for hosts that drive it directly (e.g. clear-after-programmatic-send). */
  public get MentionEditor(): MentionEditorComponent | undefined {
    return this.InputBox?.mentionEditor;
  }

  /** @deprecated Use {@link MentionEditor}. */
  public get mentionEditor(): MentionEditorComponent | undefined {
    return this.MentionEditor;
  }

  /** Focus the composer input. */
  /** Inserts a resolved mention chip + space (see MentionEditorComponent.InsertMention). */
  public InsertMention(suggestion: MentionSuggestion, focus: boolean = true): boolean {
    return this.InputBox?.InsertMention(suggestion, focus) ?? false;
  }

  /** Focus with the caret at the end of content. */
  public FocusCaretAtEnd(): boolean {
    return this.InputBox?.FocusCaretAtEnd() ?? false;
  }

  public Focus(): void {
    this.InputBox?.focus();
  }

  /** @deprecated Use {@link Focus}. */
  public focus(): void {
    return this.Focus();
  }

  /** Clear the editor content and pending attachments. */
  public Clear(): void {
    this.InputBox?.mentionEditor?.clear();
  }

  /** @deprecated Use {@link Clear}. */
  public clear(): void {
    return this.Clear();
  }

  /** Mention chip data (id/type/name + preset info) currently in the editor. */
  public GetMentionChipsData(): Array<{ id: string; type: string; name: string; presetId?: string; presetName?: string }> {
    return this.InputBox?.GetMentionChipsData() || [];
  }

  /** @deprecated Use {@link GetMentionChipsData}. */
  public getMentionChipsData(): Array<{ id: string; type: string; name: string; presetId?: string; presetName?: string }> {
    return this.GetMentionChipsData();
  }

  /** Plain text with mentions encoded as JSON (`@{"type":...}`) — the persistence format. */
  public GetPlainTextWithJsonMentions(): string {
    return this.InputBox?.mentionEditor?.getPlainTextWithJsonMentions() || '';
  }

  /** @deprecated Use {@link GetPlainTextWithJsonMentions}. */
  public getPlainTextWithJsonMentions(): string {
    return this.GetPlainTextWithJsonMentions();
  }

  /** Pending (not yet uploaded) attachments. */
  public GetPendingAttachments(): PendingAttachment[] {
    return this.InputBox?.GetPendingAttachments() || [];
  }

  /** @deprecated Use {@link GetPendingAttachments}. */
  public getPendingAttachments(): PendingAttachment[] {
    return this.GetPendingAttachments();
  }

  /** Open the attachment file picker programmatically. */
  public OpenFilePicker(): void {
    this.InputBox?.OpenFilePicker();
  }

  /** @deprecated Use {@link OpenFilePicker}. */
  public openFilePicker(): void {
    return this.OpenFilePicker();
  }

  /** Attach an artifact as a pending attachment (artifact picker flow). */
  public AddArtifactAttachment(artifact: {
    fileID: string; fileName: string; mimeType: string;
    sizeBytes: number; artifactVersionId?: string;
  }): PendingAttachment | undefined {
    return this.InputBox?.AddArtifactAttachment(artifact);
  }
}
