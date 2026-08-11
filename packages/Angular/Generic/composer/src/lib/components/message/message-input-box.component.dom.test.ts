import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output, forwardRef } from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { MessageInputBoxComponent } from './message-input-box.component';

/**
 * DOM coverage for <mj-message-input-box> — the composer input shell (~4×) wrapping the mention
 * editor with attach / voice / plan-mode / send controls. The heavy mj-mention-editor child is
 * stubbed (as a ControlValueAccessor for its [(ngModel)] binding, plus the send-path methods).
 * Verifies the flag-gated control buttons and their output wiring (plan-mode / voice / voice-options),
 * the send path (canSend gate + textSubmitted), and the value-change relay from the editor.
 */

@Component({
  standalone: true,
  selector: 'mj-mention-editor',
  template: '',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MentionEditorStub), multi: true }],
})
class MentionEditorStub implements ControlValueAccessor {
  @Input() placeholder = '';
  @Input() disabled = false;
  @Input() currentUser: unknown;
  @Input() enableMentions = true;
  @Input() TriggerProviders: unknown;
  @Input() ExcludedTriggerKeys: unknown;
  @Input() Provider: unknown;
  @Input() enableAttachments = true;
  @Input() maxAttachments = 0;
  @Input() maxAttachmentSizeBytes = 0;
  @Input() acceptedFileTypes = '';
  @Output() valueChange = new EventEmitter<string>();
  @Output() enterPressed = new EventEmitter<string>();
  @Output() mentionSelected = new EventEmitter<unknown>();
  @Output() attachmentsChanged = new EventEmitter<unknown>();
  @Output() attachmentError = new EventEmitter<string>();
  @Output() attachmentClicked = new EventEmitter<unknown>();
  @Output() editorBlurred = new EventEmitter<void>();
  // send-path methods the host calls on the editor
  getPlainTextWithJsonMentions(): string { return 'hi [json]'; }
  hasAttachments(): boolean { return false; }
  clear(): void { /* no-op */ }
  // CVA
  writeValue(): void { /* no-op */ }
  registerOnChange(): void { /* no-op */ }
  registerOnTouched(): void { /* no-op */ }
}

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MessageInputBoxComponent, {
    imports: [FormsModule, MentionEditorStub],
    declarations: [MessageInputBoxComponent],
    inputs,
  });
type Fx = ReturnType<typeof render>;

describe('MessageInputBoxComponent (DOM)', () => {
  it('hides the plan-mode button when plan mode is disabled', () => {
    expect(query(render({ EnablePlanMode: false }), '.plan-mode-button-icon')).toBeNull();
  });

  it('renders the plan-mode button when plan mode is enabled', () => {
    expect(query(render({ EnablePlanMode: true }), '.plan-mode-button-icon')).not.toBeNull();
  });

  it('emits planModeToggle when the plan-mode button is clicked and reflects the active state', () => {
    const f = render({ EnablePlanMode: true, PlanModeActive: true });
    const out = capture(f.componentInstance.PlanModeToggle);
    const btn = query(f, '.plan-mode-button-icon') as HTMLElement;
    expect(btn.classList.contains('plan-mode-button-icon--active')).toBe(true);
    btn.click();
    expect(out.length).toBe(1);
  });

  it('renders the voice button when realtime is enabled and emits voiceRequested on click', () => {
    const f = render({ EnableRealtime: true, VoiceActive: true });
    const btn = query(f, '.voice-button-icon') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('voice-button-icon--active')).toBe(true);
    const out = capture(f.componentInstance.VoiceRequested);
    btn.click();
    expect(out.length).toBe(1);
  });

  it('emits voiceOptionsRequested from the voice-options button', () => {
    const f = render({ EnableRealtime: true });
    const out = capture(f.componentInstance.VoiceOptionsRequested);
    (query(f, '.voice-options-button-icon') as HTMLElement).click();
    expect(out.length).toBe(1);
  });

  it('hides the attach / voice / plan-mode buttons when their flags are off', () => {
    const f = render({ EnableAttachments: false, EnableRealtime: false, EnablePlanMode: false });
    expect(query(f, '.attach-buttons')).toBeNull();
  });

  it('submits the editor text via textSubmitted when send is clicked with content', () => {
    const f = render({ Value: 'hi' });
    const out = capture(f.componentInstance.TextSubmitted);
    (query(f, '.send-button-icon') as HTMLElement).click();
    expect(out).toEqual(['hi [json]']); // from the stub's getPlainTextWithJsonMentions()
  });

  it('does not submit when there is no content (canSend false)', () => {
    const f = render({ Value: '' });
    const out = capture(f.componentInstance.TextSubmitted);
    (query(f, '.send-button-icon') as HTMLElement).click();
    expect(out.length).toBe(0);
  });

  it('relays the editor valueChange through valueChange', () => {
    const f = render({ Value: '' });
    const out = capture(f.componentInstance.ValueChange);
    f.componentInstance.OnValueChange('typed');
    expect(out).toContain('typed');
  });
});
