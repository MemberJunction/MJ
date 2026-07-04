import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  ComposerTriggerProvider,
  MentionEditorComponent,
  MessageInputBoxComponent,
  PendingAttachment
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
      [placeholder]="placeholder"
      [disabled]="disabled"
      [value]="value"
      [showCharacterCount]="showCharacterCount"
      [enableMentions]="enableMentions"
      [TriggerProviders]="ActiveTriggerProviders"
      [Provider]="Provider"
      [currentUser]="currentUser"
      [rows]="rows"
      [enableAttachments]="enableAttachments"
      [maxAttachments]="maxAttachments"
      [maxAttachmentSizeBytes]="maxAttachmentSizeBytes"
      [acceptedFileTypes]="acceptedFileTypes"
      [enableRealtime]="enableRealtime"
      [voiceActive]="voiceActive"
      [canStartRealtime]="canStartRealtime"
      [enablePlanMode]="enablePlanMode"
      [planModeActive]="planModeActive"
      (textSubmitted)="textSubmitted.emit($event)"
      (valueChange)="onInnerValueChange($event)"
      (attachmentsChanged)="attachmentsChanged.emit($event)"
      (attachmentError)="attachmentError.emit($event)"
      (attachmentClicked)="attachmentClicked.emit($event)"
      (voiceRequested)="voiceRequested.emit()"
      (voiceOptionsRequested)="voiceOptionsRequested.emit()"
      (planModeToggle)="planModeToggle.emit()">
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
  @Output() valueChange = new EventEmitter<string>();
  @Output() attachmentsChanged = new EventEmitter<PendingAttachment[]>();
  @Output() attachmentError = new EventEmitter<string>();
  @Output() attachmentClicked = new EventEmitter<PendingAttachment>();
  @Output() voiceRequested = new EventEmitter<void>();
  @Output() voiceOptionsRequested = new EventEmitter<void>();
  @Output() planModeToggle = new EventEmitter<void>();

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
  public focus(): void {
    this.inputBox?.focus();
  }

  /** Clear the editor content and pending attachments. */
  public clear(): void {
    this.inputBox?.mentionEditor?.clear();
  }

  /** Mention chip data (id/type/name + preset info) currently in the editor. */
  public getMentionChipsData(): Array<{ id: string; type: string; name: string; presetId?: string; presetName?: string }> {
    return this.inputBox?.getMentionChipsData() || [];
  }

  /** Plain text with mentions encoded as JSON (`@{"type":...}`) — the persistence format. */
  public getPlainTextWithJsonMentions(): string {
    return this.inputBox?.mentionEditor?.getPlainTextWithJsonMentions() || '';
  }

  /** Pending (not yet uploaded) attachments. */
  public getPendingAttachments(): PendingAttachment[] {
    return this.inputBox?.getPendingAttachments() || [];
  }

  /** Open the attachment file picker programmatically. */
  public openFilePicker(): void {
    this.inputBox?.openFilePicker();
  }

  /** Attach an artifact as a pending attachment (artifact picker flow). */
  public AddArtifactAttachment(artifact: {
    fileID: string; fileName: string; mimeType: string;
    sizeBytes: number; artifactVersionId?: string;
  }): PendingAttachment | undefined {
    return this.inputBox?.AddArtifactAttachment(artifact);
  }
}
