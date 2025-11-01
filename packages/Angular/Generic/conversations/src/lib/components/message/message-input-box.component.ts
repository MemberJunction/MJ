import { Component, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { MentionSuggestion } from '../../services/mention-autocomplete.service';
import { MentionEditorComponent } from '../mention/mention-editor.component';

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
  selector: 'mj-message-input-box',
  templateUrl: './message-input-box.component.html',
  styleUrls: ['./message-input-box.component.scss']
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

  @Output() textSubmitted = new EventEmitter<string>();
  @Output() valueChange = new EventEmitter<string>();

  get canSend(): boolean {
    return !this.disabled && this.value.trim().length > 0;
  }

  /**
   * Handle value changes from MentionEditorComponent
   */
  onValueChange(newValue: string): void {
    this.value = newValue;
    this.valueChange.emit(this.value);
  }

  /**
   * Handle Enter key from MentionEditorComponent
   */
  onEnterPressed(text: string): void {
    this.onSendClick();
  }

  /**
   * Handle mention selection from MentionEditorComponent
   */
  onMentionSelected(suggestion: MentionSuggestion): void {
    // MentionEditorComponent already inserts the mention chip
    // This is just for additional tracking/analytics if needed
    console.log('[MessageInputBox] Mention selected:', suggestion);
  }

  /**
   * Send the message
   */
  onSendClick(): void {
    if (this.canSend) {
      const textToSend = this.value.trim();
      this.textSubmitted.emit(textToSend);
      this.value = ''; // Clear input after sending
      this.valueChange.emit(this.value);
    }
  }

  /**
   * Handle clicks on the container - focus the mention editor
   */
  onContainerClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;

    // Don't handle clicks on the send button
    if (target.closest('.send-button-icon')) {
      return;
    }

    // Focus the mention editor when clicking anywhere in the container
    if (this.mentionEditor?.editorRef) {
      this.mentionEditor.editorRef.nativeElement.focus();

      // Move cursor to end of content
      const selection = window.getSelection();
      const range = document.createRange();
      const editor = this.mentionEditor.editorRef.nativeElement;

      if (editor && selection) {
        range.selectNodeContents(editor);
        range.collapse(false); // Collapse to end
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }
}
