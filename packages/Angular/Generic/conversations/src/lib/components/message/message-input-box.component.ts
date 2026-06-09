import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { MentionSuggestion } from '../../services/mention-autocomplete.service';
import { MentionEditorComponent, PendingAttachment } from '../mention/mention-editor.component';

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

  @Input() placeholder: string = 'Type your message to start a new conversation...';
  @Input() disabled: boolean = false;
  @Input() value: string = '';
  @Input() showCharacterCount: boolean = false;
  @Input() enableMentions: boolean = true;
  @Input() currentUser?: UserInfo;
  @Input() rows: number = 3;

  // Attachment settings
  @Input() enableAttachments: boolean = true;
  @Input() maxAttachments: number = 10;
  @Input() maxAttachmentSizeBytes: number = 20 * 1024 * 1024; // 20MB
  @Input() acceptedFileTypes: string = 'image/*';

  /** Shows the in-composer mic button when true. */
  @Input() enableVoice: boolean = false;
  /** Whether a realtime voice session is currently active (mic renders in its active state). */
  @Input() voiceActive: boolean = false;
  /** Whether a voice session can be started right now (mic disabled when false). */
  @Input() canStartVoice: boolean = true;

  @Output() textSubmitted = new EventEmitter<string>();
  @Output() valueChange = new EventEmitter<string>();
  @Output() attachmentsChanged = new EventEmitter<PendingAttachment[]>();
  @Output() attachmentError = new EventEmitter<string>();
  @Output() attachmentClicked = new EventEmitter<PendingAttachment>();
  @Output() artifactPickerRequested = new EventEmitter<void>();
  /** Emitted when the user clicks the mic button to start/stop a voice session. */
  @Output() voiceRequested = new EventEmitter<void>();

  onVoiceClick(): void {
    this.voiceRequested.emit();
  }

  get canSend(): boolean {
    const hasText = this.value.trim().length > 0;
    const hasAttachments = this.mentionEditor?.hasAttachments() || false;
    return !this.disabled && (hasText || hasAttachments);
  }

  /**
   * Handle value changes from MentionEditorComponent
   */
  onValueChange(newValue: string): void {
    this.value = newValue;
    this.valueChange.emit(this.value);
  }

  /**
   * Handle attachment changes from MentionEditorComponent
   */
  onAttachmentsChanged(attachments: PendingAttachment[]): void {
    this.attachmentsChanged.emit(attachments);
  }

  /**
   * Handle attachment errors from MentionEditorComponent
   */
  onAttachmentError(error: string): void {
    this.attachmentError.emit(error);
  }

  /**
   * Handle attachment click from MentionEditorComponent
   */
  onAttachmentClicked(attachment: PendingAttachment): void {
    this.attachmentClicked.emit(attachment);
  }

  /**
   * Handle Enter key from MentionEditorComponent
   * Extracts plain text with JSON-encoded mentions for message submission
   */
  onEnterPressed(_text: string): void {
    this.onSendClick();
  }

  /**
   * Handle mention selection from MentionEditorComponent
   */
  onMentionSelected(suggestion: MentionSuggestion): void {
    // MentionEditorComponent already inserts the mention chip
    // This is just for additional tracking/analytics if needed
  }

  /**
   * Send the message
   * Extracts plain text with JSON-encoded mentions for proper persistence
   */
  onSendClick(): void {
    if (this.canSend) {
      // Get plain text with JSON-encoded mentions (preserves configuration info)
      const textToSend = this.mentionEditor?.getPlainTextWithJsonMentions() || this.value.trim();
      this.textSubmitted.emit(textToSend);
      this.value = ''; // Clear input after sending

      // Clear the editor content
      if (this.mentionEditor) {
        this.mentionEditor.clear();
      }

      this.valueChange.emit(this.value);
    }
  }

  /**
   * Handle clicks on the container - focus the mention editor
   * Only moves cursor to end if clicking outside the contentEditable area
   */
  onContainerClick(event: MouseEvent): void {
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
  focus(): void {
    const editor = this.mentionEditor?.editorRef?.nativeElement;
    if (editor) {
      editor.focus();
    }
  }

  /**
   * Get mention chip data including configuration presets
   */
  getMentionChipsData(): Array<{ id: string; type: string; name: string; presetId?: string; presetName?: string }> {
    return this.mentionEditor?.getMentionChipsData() || [];
  }

  /**
   * Get pending attachments from the editor
   */
  getPendingAttachments(): PendingAttachment[] {
    return this.mentionEditor?.getPendingAttachments() || [];
  }

  /**
   * Open file picker programmatically
   */
  openFilePicker(): void {
    this.mentionEditor?.openFilePicker();
  }

  /**
   * Open artifact picker - emits event for parent to handle.
   *
   * TODO (2026-04-15): no consumer currently handles `artifactPickerRequested`.
   * The prior handler was removed by commit 0a4612abf1 and the orphaned
   * template was cleaned up in 7a063fc12a. The template button is disabled
   * to signal the gap. See message-input-box.component.html for the TODO
   * describing the suggested picker implementation.
   */
  openArtifactPicker(): void {
    this.artifactPickerRequested.emit();
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
