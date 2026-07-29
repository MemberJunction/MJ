import { describe, it, expect, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import { MessageListComponent } from './message-list.component';
import type { MessageItemComponent } from './message-item.component';

/**
 * Spec for the message-list's assistant-identity RE-STAMP path.
 *
 * Message items are created dynamically (`createComponent`) with the identity
 * overrides stamped on as static host config, so a change arriving after first
 * render — branding configs resolve async, and per-conversation personas can switch
 * mid-session — has to be pushed onto the already-rendered items or existing bubbles
 * keep the old identity until the next messages-array mutation.
 *
 * The setters own that (NOT ngOnChanges — see packages/Angular/CLAUDE.md), which also
 * means an imperative host (`@ViewChild(MessageListComponent).assistantDisplayName = …`)
 * restamps; ngOnChanges would only fire for template-bound inputs.
 *
 * Constructed off the prototype: a real render needs the full component graph, and the
 * behavior under test is the setter → rendered-item write, not the rendering itself.
 * (Co-located as .dom.test.ts because importing the component pulls the Angular graph
 * the node project can't load.)
 */
describe('MessageListComponent — assistant identity re-stamp', () => {
  const makeList = () => {
    const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
    const markForCheck = vi.fn();
    // One rendered component entry + one non-component entry (a realtime session
    // block) that must be skipped rather than written to.
    const item = {} as MessageItemComponent;
    const rendered = new Map<string, unknown>([
      ['m1', { kind: 'component', ref: { instance: item, changeDetectorRef: { markForCheck } } }],
      ['s1', { kind: 'session' }],
    ]);
    Object.assign(list as unknown as Record<string, unknown>, {
      _renderedMessages: rendered,
      // Prototype-created, so the field initializers didn't run — mirror them.
      _assistantDisplayName: null,
      _assistantAvatarUrl: null,
      showAgentRunDetails: true,
      showReactions: true,
      showMessageRating: true,
      allowPinning: true,
      allowMessageEdit: true,
      allowMessageDelete: true,
    });
    return { list, item, markForCheck };
  };

  it('pushes a late display-name onto already-rendered items and marks them dirty', () => {
    const { list, item, markForCheck } = makeList();
    list.assistantDisplayName = 'Betty';
    expect(item.assistantDisplayName).toBe('Betty');
    expect(markForCheck).toHaveBeenCalledTimes(1);
  });

  it('pushes a late avatar URL onto already-rendered items', () => {
    const { list, item, markForCheck } = makeList();
    list.assistantAvatarUrl = 'https://x/betty.png';
    expect(item.assistantAvatarUrl).toBe('https://x/betty.png');
    expect(markForCheck).toHaveBeenCalledTimes(1);
  });

  it('re-stamps on a CHANGE and skips a no-op write', () => {
    const { list, item, markForCheck } = makeList();
    list.assistantDisplayName = 'Betty';
    list.assistantDisplayName = 'Betty'; // same value — no work
    expect(markForCheck).toHaveBeenCalledTimes(1);
    list.assistantDisplayName = 'Betty the Teacher'; // changed — restamp
    expect(markForCheck).toHaveBeenCalledTimes(2);
    expect(item.assistantDisplayName).toBe('Betty the Teacher');
  });

  it('clearing back to null propagates (host drops the override)', () => {
    const { list, item } = makeList();
    list.assistantDisplayName = 'Betty';
    list.assistantDisplayName = null;
    expect(item.assistantDisplayName).toBeNull();
    expect(list.assistantDisplayName).toBeNull();
  });

  it('is a no-op before anything has rendered (empty map — safe during initial binding)', () => {
    const list = Object.create(MessageListComponent.prototype) as MessageListComponent;
    Object.assign(list as unknown as Record<string, unknown>, { _renderedMessages: new Map() });
    expect(() => {
      list.assistantDisplayName = 'Betty';
      list.assistantAvatarUrl = 'https://x/b.png';
    }).not.toThrow();
    expect(list.assistantDisplayName).toBe('Betty');
  });

  it('a real instance defaults both to null (engine-resolved identity)', () => {
    const list = new MessageListComponent({ markForCheck: () => {}, detectChanges: () => {} } as unknown as ChangeDetectorRef);
    expect(list.assistantDisplayName).toBeNull();
    expect(list.assistantAvatarUrl).toBeNull();
  });

  it('a setter fired immediately after construction is safe', () => {
    // The identity fields are declared ABOVE _renderedMessages, so field-initializer
    // order matters: if a restamp could run before the map exists it would throw.
    // Angular always binds inputs post-construction, and this pins that assumption
    // against a future field reorder.
    const list = new MessageListComponent({ markForCheck: () => {}, detectChanges: () => {} } as unknown as ChangeDetectorRef);
    expect(() => {
      list.assistantDisplayName = 'Betty';
      list.assistantAvatarUrl = 'https://x/b.png';
    }).not.toThrow();
    expect(list.assistantDisplayName).toBe('Betty');
  });
});
