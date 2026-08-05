import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, text, attr, click, typeInto, capture } from '@memberjunction/ng-test-utils';
import { ChatComponent, ChatMessage, ChatWelcomeQuestion } from './chat.component';

/**
 * DOM spec for <mj-chat>. Module-declared (standalone:false) presentational component
 * configured via @Inputs, rendered with renderComponentFixture + declarations/imports
 * (FormsModule for the [(ngModel)] textarea). MarkdownService is providedIn:'root', so
 * TestBed supplies it automatically.
 *
 * SCOPE: the template contract — welcome-state gating, the welcome-question grid, the
 * waiting/typing indicator, input placeholder/disabled, the Clear/Send button disabled
 * logic, and the clear-confirmation dialog incl. the ClearChatRequested @Output.
 *
 * NOT covered: the message list itself. Messages are appended IMPERATIVELY in
 * AppendMessage() via document.createElement + an async MarkdownService.parse() — they are
 * not template-rendered, so there is no declarative @for surface to assert. That path
 * belongs to a service/integration test, not a template DOM spec.
 */

const MOD = { imports: [CommonModule, FormsModule], declarations: [ChatComponent] };

function q(topLine: string, bottomLine: string, prompt: string): ChatWelcomeQuestion {
  const w = new ChatWelcomeQuestion();
  w.topLine = topLine;
  w.bottomLine = bottomLine;
  w.prompt = prompt;
  return w;
}

describe('ChatComponent (DOM)', () => {
  describe('welcome-state gating', () => {
    it('shows the welcome wrapper when there are no messages and not waiting', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [] } });
      expect(query(f, '.welcome-wrapper')).not.toBeNull();
      expect(text(f, '.welcome-header-text')).toBe('What can I help with today?');
    });

    it('hides the welcome wrapper once there are messages', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: { Messages: [new ChatMessage('hi', 'User', 'user')] },
      });
      expect(query(f, '.welcome-wrapper')).toBeNull();
    });

    it('hides the welcome wrapper while the waiting indicator is showing', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [], ShowWaitingIndicator: true } });
      expect(query(f, '.welcome-wrapper')).toBeNull();
    });

    it('renders the AI large image in the welcome area only when AILargeImageURL is set', () => {
      const without = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [] } });
      expect(query(without, '.welcome-message img')).toBeNull();
    });

    it('renders the AI large image when AILargeImageURL is provided', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: { Messages: [], AILargeImageURL: 'https://example.com/ai.png' },
      });
      expect(attr(f, '.welcome-message img', 'src')).toBe('https://example.com/ai.png');
    });
  });

  describe('welcome questions', () => {
    it('renders no welcome questions by default', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [] } });
      expect(queryAll(f, '.welcome-question')).toHaveLength(0);
    });

    it('renders one card per welcome question (up to the four slots) with its two lines', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: {
          Messages: [],
          WelcomeQuestions: [q('Summarize', 'a document', 'p1'), q('Draft', 'an email', 'p2'), q('Explain', 'a concept', 'p3')],
        },
      });
      const cards = queryAll(f, '.welcome-question');
      expect(cards).toHaveLength(3);
      expect(queryAll(f, '.welcome-question-header').map((e) => e.textContent?.trim())).toEqual(['Summarize', 'Draft', 'Explain']);
    });

    it('caps the rendered welcome questions at the four available slots', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: { Messages: [], WelcomeQuestions: [q('1', 'a', 'p'), q('2', 'b', 'p'), q('3', 'c', 'p'), q('4', 'd', 'p'), q('5', 'e', 'p')] },
      });
      expect(queryAll(f, '.welcome-question')).toHaveLength(4);
    });

    it('calls SendUserMessage with the question prompt when a welcome question is clicked', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: { Messages: [], WelcomeQuestions: [q('Summarize', 'a document', 'do-summary')] },
      });
      // spy verifies the (click) binding wiring + argument without driving the async,
      // markdown-rendering message-append path that SendUserMessage kicks off.
      const spy = vi.spyOn(f.componentInstance, 'SendUserMessage');
      click(f, '.welcome-question');
      expect(spy).toHaveBeenCalledWith('do-summary');
    });
  });

  describe('waiting indicator', () => {
    // One render per it(): renderComponentFixture calls TestBed.configureTestingModule, which
    // can only run once before the first fixture is created.
    it('does not show the typing indicator by default', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [] } });
      expect(query(f, '.typing-indicator')).toBeNull();
    });

    it('shows the typing indicator with its label while ShowWaitingIndicator is true', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [], ShowWaitingIndicator: true } });
      expect(query(f, '.typing-indicator')).not.toBeNull();
      expect(text(f, '.typing-text')).toBe('Thinking...');
    });
  });

  describe('input area', () => {
    it('binds the placeholder onto the textarea', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Placeholder: 'Ask anything…' } });
      expect(attr(f, 'textarea', 'placeholder')).toBe('Ask anything…');
    });

    // NOTE: the textarea's `[disabled]="ShowWaitingIndicator"` is NOT asserted here — the
    // textarea also carries [(ngModel)], so its disabled state is driven by the
    // ControlValueAccessor (setDisabledState), which doesn't reflect to the DOM .disabled
    // property within a single change-detection pass. ShowWaitingIndicator's effect is
    // already covered via the typing-indicator test above.

    it('disables the Clear button when there are no messages', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [] } });
      const clearBtn = query(f, 'button[title="Clear Chat"]') as HTMLButtonElement;
      expect(clearBtn.disabled).toBe(true);
    });

    it('enables the Clear button once there are messages (and not waiting)', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: { Messages: [new ChatMessage('hi', 'User', 'user')] },
      });
      const clearBtn = query(f, 'button[title="Clear Chat"]') as HTMLButtonElement;
      expect(clearBtn.disabled).toBe(false);
    });

    it('disables the Send button when the input is empty', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD });
      const sendBtn = query(f, 'button.chat-send-btn') as HTMLButtonElement;
      expect(sendBtn.disabled).toBe(true);
    });

    it('enables the Send button once text is typed into the input', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD });
      const sendBtn = query(f, 'button.chat-send-btn') as HTMLButtonElement;
      expect(sendBtn.disabled).toBe(true);
      typeInto(f, 'textarea', 'hello'); // (input)=handleInputChange + ngModel update
      f.detectChanges();
      expect(sendBtn.disabled).toBe(false);
    });

    it('calls SendCurrentMessage when the Send button is clicked', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD });
      typeInto(f, 'textarea', 'hello');
      f.detectChanges();
      const spy = vi.spyOn(f.componentInstance, 'SendCurrentMessage');
      click(f, 'button.chat-send-btn');
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('clear-confirmation dialog', () => {
    it('does not render the dialog by default', () => {
      const f = renderComponentFixture(ChatComponent, { ...MOD, inputs: { Messages: [] } });
      expect(query(f, '.chat-dialog-overlay')).toBeNull();
    });

    it('opens the dialog with the configured prompt when Clear is clicked', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: { Messages: [new ChatMessage('hi', 'User', 'user')], ClearAllMessagesPrompt: 'Wipe everything?' },
      });
      click(f, 'button[title="Clear Chat"]');
      f.detectChanges();
      expect(query(f, '.chat-dialog-overlay')).not.toBeNull();
      expect(text(f, '.chat-dialog-message')).toBe('Wipe everything?');
    });

    it('emits ClearChatRequested when the dialog is confirmed with Yes', () => {
      const f = renderComponentFixture(ChatComponent, {
        ...MOD,
        inputs: { Messages: [new ChatMessage('hi', 'User', 'user')] },
        setup: (c) => {
          c.showingClearAllDialog = true;
        },
      });
      const cleared = capture(f.componentInstance.ClearChatRequested);
      click(f, '.chat-dialog-btn-primary');
      expect(cleared).toHaveLength(1);
    });
  });
});
