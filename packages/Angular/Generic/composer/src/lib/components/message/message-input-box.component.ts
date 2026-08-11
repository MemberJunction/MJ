import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ComposerTriggerProvider, MentionSuggestion } from '../../composer-trigger-provider';
import { MentionEditorComponent, PendingAttachment } from '../mention/mention-editor.component';
import { BeforeSkillsOpenedEventArgs } from '../../events/composer-events';

/**
 * Reusable message input box component (presentational)
 * Now uses MentionEditorComponent for rich @mention functionality with chips
 *
 * Handles:
 * - Text input with keyboard shortcuts via MentionEditorComponent
 * - @mention autocomplete with visual chips (contentEditable)
 * - Send button
 *
 * Does NOT handle:
 * - Saving messages to database
 * - Agent invocation
 * - Artifact creation
 * - Conversation management
 */
@Component({
  standalone: false,
  selector: 'mj-message-input-box',
  templateUrl: './message-input-box.component.html',
  styleUrls: ['./message-input-box.component.css']
})
export class MessageInputBoxComponent {
  @ViewChild('mentionEditor') mentionEditor?: MentionEditorComponent;

  @Input() Placeholder: string = 'Type your message to start a new conversation...';
  @Input() Disabled: boolean = false;
  @Input() Value: string = '';
  @Input() ShowCharacterCount: boolean = false;
  /** Master switch for all mention/command triggers (pass-through to the mention editor). */
  @Input() EnableMentions: boolean = true;
  /** Explicit trigger-provider list (pass-through to the mention editor; explicit list wins over discovery). */
  @Input() TriggerProviders: ComposerTriggerProvider[] | null = null;
  /** Discovery-mode filter: provider Keys to skip (pass-through to the mention editor). */
  @Input() ExcludedTriggerKeys: string[] = [];
  /** Optional metadata provider scoping this composer (pass-through to the mention editor). */
  @Input() Provider: IMetadataProvider | null = null;
  @Input() CurrentUser?: UserInfo;
  @Input() Rows: number = 3;

  // Attachment settings
  @Input() EnableAttachments: boolean = true;
  @Input() MaxAttachments: number = 10;
  @Input() MaxAttachmentSizeBytes: number = 20 * 1024 * 1024; // 20MB
  @Input() AcceptedFileTypes: string = 'image/*';

  /** Shows the in-composer mic button when true. */
  @Input() EnableRealtime: boolean = false;
  /** Whether a realtime voice session is currently active (mic renders in its active state). */
  @Input() VoiceActive: boolean = false;
  /** Whether a voice session can be started right now (mic Disabled when false). */
  @Input() CanStartRealtime: boolean = true;
  /** Shows the in-composer Plan Mode toggle button when true. */
  @Input() EnablePlanMode: boolean = false;
  /** Current Plan Mode toggle state (renders the button in its active state). */
  @Input() PlanModeActive: boolean = false;
  /**
   * Shows the in-composer Skills button when true.
   *
   * Gated separately from `EnableMentions` because a host can have the `/` trigger active and
   * still not want the button — but the common case is that a composer offering skill commands
   * should advertise them, since `/` is otherwise invisible.
   */
  @Input() EnableSkills: boolean = false;
  /**
   * True while the skill dropdown is open, driving the button's expanded state.
   *
   * Note the ARIA differs from Plan Mode next to it, deliberately: Plan Mode is a toggle BUTTON
   * (a mode that stays on), so `aria-pressed` is right there. This one opens a popup, so it is
   * `aria-expanded` + `aria-haspopup`. Using `aria-pressed` here would have a screen reader
   * announce "pressed" for something that actually just revealed a list.
   *
   * DERIVED, not an @Input, and this is the difference from Plan Mode. Plan Mode's active state is
   * a persisted user preference the host owns and threads down. "Is the skill dropdown open" is
   * intrinsic to this composer, so an @Input would be an API the host cannot meaningfully answer
   * and would leave the button permanently unpressed if nobody bound it.
   */
  get SkillsActive(): boolean {
    return this.mentionEditor?.IsTriggerOpen('/') ?? false;
  }

  /** Composer lost focus — hosts persist drafts on this. */
  @Output() Blurred = new EventEmitter<void>();
  @Output() TextSubmitted = new EventEmitter<string>();
  @Output() ValueChange = new EventEmitter<string>();
  @Output() AttachmentsChanged = new EventEmitter<PendingAttachment[]>();
  @Output() AttachmentError = new EventEmitter<string>();
  @Output() AttachmentClicked = new EventEmitter<PendingAttachment>();
  /** Emitted when the user clicks the mic button to start/stop a voice session. */
  @Output() VoiceRequested = new EventEmitter<void>();
  /**
   * Emitted when the user clicks the small caret next to the phone button — the host opens the
   * voice agent/model picker so call options (which agent, which voice model) stay reachable
   * without adding friction to the plain phone click's instant-start path.
   */
  @Output() VoiceOptionsRequested = new EventEmitter<void>();
  /** Emitted when the user clicks the in-composer Plan Mode toggle button. */
  @Output() PlanModeToggle = new EventEmitter<void>();
  /**
   * Fired BEFORE the Skills button opens the dropdown. Flip `Cancel` to veto — a host gating
   * skills by entitlement, or surfacing them elsewhere, blocks it here.
   *
   * A pair rather than a lone emitter because this is an ACTION a host might reasonably refuse
   * (UI_LAYERING_GUIDE section 6, rule 1). Handlers must be synchronous; `Cancel` travels back
   * through EventEmitter's synchronous dispatch.
   */
  @Output() BeforeSkillsOpened = new EventEmitter<BeforeSkillsOpenedEventArgs>();
  /**
   * Fired AFTER the dropdown actually opened. Not emitted on the canceled path, and not emitted
   * when no active provider owns the trigger — so a host counting this counts dropdowns the user
   * saw, rather than clicks.
   */
  @Output() AfterSkillsOpened = new EventEmitter<void>();

  /**
   * Open the skill-command dropdown, the same one `/` opens.
   *
   * Routed through the editor's OpenTrigger rather than a parallel menu so permission filtering,
   * per-skill icons and chip insertion all stay in one implementation.
   */
  /**
   * NOTE: the template pairs this with
   * `(mousedown)="$event.preventDefault(); $event.stopPropagation()"`, and BOTH halves are
   * load-bearing.
   *
   * `preventDefault` — a <button> takes focus on mousedown, which blurs the editor, and the editor
   * closes its dropdown 200ms after losing focus. Without it the menu opened and then shut itself.
   *
   * `stopPropagation` — the editor's click-away listener is on `document:mousedown` and exempts only
   * presses inside the EDITOR's host. This button is a sibling of `<mj-mention-editor>`, so a press
   * on it read as an outside press: mousedown closed the dropdown, then click saw `SkillsActive`
   * already false and reopened it. The menu blinked, could not be dismissed by the button that
   * opened it, and the Before/After pair fired on every click — the exact over-counting the toggle
   * branch below exists to prevent. Stopping propagation states that this press belongs to the
   * dropdown machinery.
   */
  OnSkillsClick(event?: Event): void {
    // Toggle closed first. A disclosure button has to be able to close what it opened, and without
    // this a second click re-ran the open path: it re-emitted the Before/After pair (so a host
    // counting opens over-counted) and re-captured the trigger's baseline at the new caret, which
    // corrupts the query offset once anything has been typed.
    if (this.SkillsActive) {
      this.mentionEditor?.closeMentionDropdown();
      return;
    }
    const args = new BeforeSkillsOpenedEventArgs();
    this.BeforeSkillsOpened.emit(args);
    if (args.Cancel) {
      return;
    }
    const anchor = (event?.currentTarget as HTMLElement | undefined) ?? null;
    if (this.mentionEditor?.OpenTrigger('/', anchor)) {
      this.AfterSkillsOpened.emit();
    }
  }

  OnRealtimeClick(): void {
    this.VoiceRequested.emit();
  }

  OnRealtimeOptionsClick(): void {
    this.VoiceOptionsRequested.emit();
  }

  get CanSend(): boolean {
    const hasText = this.Value.trim().length > 0;
    const hasAttachments = this.mentionEditor?.hasAttachments() || false;
    return !this.Disabled && (hasText || hasAttachments);
  }

  /**
   * Handle Value changes from MentionEditorComponent
   */
  OnValueChange(newValue: string): void {
    this.Value = newValue;
    this.ValueChange.emit(this.Value);
  }

  /**
   * Handle attachment changes from MentionEditorComponent
   */
  OnAttachmentsChanged(attachments: PendingAttachment[]): void {
    this.AttachmentsChanged.emit(attachments);
  }

  /**
   * Handle attachment errors from MentionEditorComponent
   */
  OnAttachmentError(error: string): void {
    this.AttachmentError.emit(error);
  }

  /**
   * Handle attachment click from MentionEditorComponent
   */
  OnAttachmentClicked(attachment: PendingAttachment): void {
    this.AttachmentClicked.emit(attachment);
  }

  /**
   * Handle Enter key from MentionEditorComponent
   * Extracts plain text with JSON-encoded mentions for message submission
   */
  OnEnterPressed(_text: string): void {
    this.OnSendClick();
  }

  /**
   * Handle mention selection from MentionEditorComponent
   */
  OnMentionSelected(suggestion: MentionSuggestion): void {
    // MentionEditorComponent already inserts the mention chip
    // This is just for additional tracking/analytics if needed
  }

  /**
   * Send the message
   * Extracts plain text with JSON-encoded mentions for proper persistence
   */
  OnSendClick(): void {
    if (this.CanSend) {
      // Get plain text with JSON-encoded mentions (preserves configuration info)
      const textToSend = this.mentionEditor?.getPlainTextWithJsonMentions() || this.Value.trim();
      this.TextSubmitted.emit(textToSend);
      this.Value = ''; // Clear input after sending

      // Clear the editor content
      if (this.mentionEditor) {
        this.mentionEditor.clear();
      }

      this.ValueChange.emit(this.Value);
    }
  }

  /**
   * Handle clicks on the container - focus the mention editor
   * Only moves cursor to end if clicking outside the contentEditable area
   */
  OnContainerClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Don't handle clicks on the send button
    if (target.closest('.send-button-icon')) {
      return;
    }

    const editor = this.mentionEditor?.editorRef?.nativeElement;
    if (!editor) return;

    // If clicking directly on the editor or its children, let the browser handle cursor placement
    if (target === editor || editor.contains(target)) {
      return;
    }

    // Only if clicking on the container (empty space), focus and move cursor to end
    editor.focus();
    const selection = window.getSelection();
    const range = document.createRange();

    if (selection) {
      range.selectNodeContents(editor);
      range.collapse(false); // Collapse to end
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  /**
   * Public method to focus the input programmatically
   */
  /** Inserts a resolved mention chip + space and focuses (see MentionEditorComponent.InsertMention). */
  InsertMention(suggestion: MentionSuggestion, focus: boolean = true): boolean {
    return this.mentionEditor?.InsertMention(suggestion, focus) ?? false;
  }

  /** Focus with the caret at the end of content (see MentionEditorComponent.FocusCaretAtEnd). */
  FocusCaretAtEnd(): boolean {
    return this.mentionEditor?.FocusCaretAtEnd() ?? false;
  }

  focus(): void {
    const editor = this.mentionEditor?.editorRef?.nativeElement;
    if (editor) {
      editor.focus();
    }
  }

  /**
   * Get mention chip data including configuration presets
   */
  GetMentionChipsData(): Array<{ id: string; type: string; name: string; presetId?: string; presetName?: string }> {
    return this.mentionEditor?.getMentionChipsData() || [];
  }

  /**
   * Get pending attachments from the editor
   */
  GetPendingAttachments(): PendingAttachment[] {
    return this.mentionEditor?.getPendingAttachments() || [];
  }

  /**
   * Open file picker programmatically
   */
  OpenFilePicker(): void {
    this.mentionEditor?.openFilePicker();
  }

  /**
   * Add an artifact as a pending attachment (called by parent after artifact selection)
   */
  AddArtifactAttachment(artifact: {
    fileID: string; fileName: string; mimeType: string;
    sizeBytes: number; artifactVersionId?: string;
  }): PendingAttachment | undefined {
    return this.mentionEditor?.AddArtifactAttachment(artifact);
  }
}
