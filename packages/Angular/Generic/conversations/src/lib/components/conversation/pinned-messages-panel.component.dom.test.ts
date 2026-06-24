import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { PinnedMessagesPanelComponent } from './pinned-messages-panel.component';

/**
 * DOM spec for <mj-pinned-messages-panel> — a pure @Input-driven panel (no DI).
 * Covers the count, the empty state, one card per pinned message, the sender-name
 * + markdown-stripped preview helpers, the jump/close outputs, and the unpin flow
 * (immediate .unpinning class, then delayed unpinRequested emit).
 */
describe('PinnedMessagesPanelComponent (DOM)', () => {
  // Test seam: the panel reads only scalar fields, so a plain cast stands in for BaseEntity.
  const makeMsg = (overrides: Partial<MJConversationDetailEntity> = {}): MJConversationDetailEntity =>
    ({ ID: 'm1', Message: 'Hello', Role: 'User', __mj_CreatedAt: new Date(), ...overrides }) as unknown as MJConversationDetailEntity;

  const render = (pinnedMessages: MJConversationDetailEntity[]) =>
    renderComponentFixture(PinnedMessagesPanelComponent, {
      imports: [CommonModule],
      declarations: [PinnedMessagesPanelComponent],
      inputs: { pinnedMessages },
    });

  it('renders the empty state when there are no pinned messages', () => {
    const f = render([]);
    expect(query(f, '.pins-empty')).not.toBeNull();
    expect(text(f, '.pins-empty')).toContain('No pinned messages');
    expect(query(f, '.pin-card')).toBeNull();
    expect(text(f, '.pins-count')).toContain('0');
  });

  it('renders one card per pinned message with the count', () => {
    const f = render([makeMsg({ ID: 'a' }), makeMsg({ ID: 'b' })]);
    expect(queryAll(f, '.pin-card').length).toBe(2);
    expect(text(f, '.pins-count')).toContain('2');
  });

  it('labels a user message sender as "You"', () => {
    const f = render([makeMsg({ Role: 'User' })]);
    expect(text(f, '.pin-sender-name')).toContain('You');
  });

  it('labels a non-user message sender as "AI Response"', () => {
    const f = render([makeMsg({ Role: 'AI' })]);
    expect(text(f, '.pin-sender-name')).toContain('AI Response');
  });

  it('renders a markdown-stripped preview of the message', () => {
    const f = render([makeMsg({ Message: '## Title\n**bold** and `code`' })]);
    const preview = text(f, '.pin-preview');
    expect(preview).toContain('bold');
    expect(preview).not.toContain('**');
    expect(preview).not.toContain('##');
    expect(preview).toContain('[code]');
  });

  it('emits closed when the close button is clicked', () => {
    const f = render([makeMsg()]);
    const spy = vi.fn();
    f.componentInstance.closed.subscribe(spy);
    (query(f, '.pins-close-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('emits jumpRequested with the message id when Jump is clicked', () => {
    const f = render([makeMsg({ ID: 'jump-me' })]);
    const spy = vi.fn();
    f.componentInstance.jumpRequested.subscribe(spy);
    (query(f, '.jump-btn') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalledWith('jump-me');
  });

  it('marks a card as unpinning immediately, then emits unpinRequested after the animation delay', () => {
    vi.useFakeTimers();
    try {
      const msg = makeMsg({ ID: 'x' });
      const f = render([msg]);
      const spy = vi.fn();
      f.componentInstance.unpinRequested.subscribe(spy);

      (query(f, '.unpin-btn') as HTMLButtonElement).click();
      f.detectChanges();
      expect(query(f, '.pin-card')?.classList.contains('unpinning')).toBe(true);
      expect(spy).not.toHaveBeenCalled(); // not emitted yet — waits for the fade-out

      vi.advanceTimersByTime(200);
      expect(spy).toHaveBeenCalledWith(msg);
    } finally {
      vi.useRealTimers();
    }
  });
});
