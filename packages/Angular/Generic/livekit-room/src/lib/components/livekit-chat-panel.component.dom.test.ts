import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, text, typeInto } from '@memberjunction/ng-test-utils';
import { LiveKitChatPanelComponent } from './livekit-chat-panel.component';
import type { LiveKitChatMessage } from '../models';

/**
 * DOM spec for <mj-livekit-chat-panel> — a standalone, presentational chat surface (its
 * only injection is ElementRef, auto-provided by TestBed; data-channel publishing is the
 * host's job). Covers the empty state, message rendering + local/remote sender labelling,
 * the composer's disabled-until-non-empty gating, and the Send/Close outputs.
 */
describe('LiveKitChatPanelComponent (DOM)', () => {
  const msg = (over: Partial<LiveKitChatMessage> = {}): LiveKitChatMessage => ({
    Sender: 'Alex',
    Text: 'hi there',
    Timestamp: 1_700_000_000_000,
    IsLocal: false,
    ...over,
  });

  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitChatPanelComponent, { inputs });

  it('shows the empty state when there are no messages', () => {
    const f = render({ Messages: [] });
    expect(text(f, '.lk-chat__empty')).toContain('No messages yet');
    expect(query(f, '.lk-chat__msg')).toBeNull();
  });

  it('renders one row per message with its text', () => {
    const f = render({ Messages: [msg({ Text: 'first' }), msg({ Text: 'second' })] });
    expect(queryAll(f, '.lk-chat__msg').length).toBe(2);
    expect(queryAll(f, '.lk-chat__bubble').map((b) => b.textContent?.trim())).toEqual(['first', 'second']);
  });

  it('labels the local sender as "You" and the remote sender by name', () => {
    const local = render({ Messages: [msg({ IsLocal: true, Sender: 'Me' })] });
    expect(text(local, '.lk-chat__sender')).toContain('You');
    expect(query(local, '.lk-chat__msg')?.classList.contains('lk-chat__msg--me')).toBe(true);

    const remote = render({ Messages: [msg({ IsLocal: false, Sender: 'Alex' })] });
    expect(text(remote, '.lk-chat__sender')).toContain('Alex');
  });

  it('disables the send button until the draft is non-empty', async () => {
    const f = render({ Messages: [] });
    expect((query(f, 'button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    // template-driven [(ngModel)] registers its control on a microtask — flush it before typing
    await Promise.resolve();
    typeInto(f, '.lk-chat__input', 'hello'); // drives ngModel → draft
    await Promise.resolve();
    f.detectChanges();
    expect((query(f, 'button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits Send with the trimmed draft and clears it on submit', () => {
    // send() is the component's own contract (trim + emit + clear); exercise it directly
    // rather than through the template-driven ngModel + jsdom form-submit plumbing.
    const f = render({ Messages: [] });
    const spy = vi.fn();
    f.componentInstance.Send.subscribe(spy);
    f.componentInstance.draft = '  hello world  ';
    f.componentInstance.send(new Event('submit'));
    expect(spy).toHaveBeenCalledWith('hello world');
    expect(f.componentInstance.draft).toBe('');
  });

  it('emits Close when the close button is clicked', () => {
    const f = render({ Messages: [] });
    const spy = vi.fn();
    f.componentInstance.Close.subscribe(spy);
    (query(f, '.lk-chat__close') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});
