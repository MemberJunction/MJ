// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';

/**
 * PHASE 6 of the windowed transcript: bounding the DOM.
 *
 * Paging up twenty times would otherwise leave hundreds of live MessageItemComponents
 * mounted. Items far from the viewport are destroyed and replaced by a height-holding
 * spacer under the SAME timeline key, then remounted from `messages` — which is already in
 * memory, so scrolling back never refetches.
 *
 * Class-level, no TestBed: the decisions under test are index arithmetic and map
 * bookkeeping, which a stubbed container models exactly.
 */

/** Minimal row shape read by getMessageKey and BuildConversationTimeline. */
function detail(id: string, seconds: number, overrides: Record<string, unknown> = {}) {
  return {
    ID: id,
    AgentSessionID: null,
    Role: 'User',
    Message: `m-${id}`,
    HiddenToUser: false,
    Status: 'Complete',
    __mj_CreatedAt: new Date(2026, 0, 1, 0, 0, seconds),
    ...overrides
  };
}

/** Any property the creation path hasn't set reads back as subscribable (output emitters). */
function fakeInstance(): Record<string, unknown> {
  return new Proxy({} as Record<string, unknown>, {
    get: (t, p: string) => (p in t ? t[p] : { subscribe: vi.fn() }),
    set: (t, p: string, v) => { t[p] = v; return true; }
  });
}

interface Harness {
  component: MessageListComponent;
  open: Record<string, unknown>;
  createComponent: ReturnType<typeof vi.fn>;
  createEmbeddedView: ReturnType<typeof vi.fn>;
  destroyed: string[];
}

function createHarness(messages: Array<Record<string, unknown>>): Harness {
  const component = Object.create(MessageListComponent.prototype) as MessageListComponent;
  const open = component as unknown as Record<string, unknown>;
  const destroyed: string[] = [];

  const createComponent = vi.fn().mockImplementation(() => ({
    instance: fakeInstance(),
    changeDetectorRef: { markForCheck: vi.fn(), detectChanges: vi.fn() },
    location: { nativeElement: { offsetHeight: 140 } },
    destroy: vi.fn()
  }));
  const createEmbeddedView = vi.fn().mockImplementation((_tpl, ctx: { height: number }) => ({
    rootNodes: [{ offsetHeight: ctx.height }],
    context: ctx,
    markForCheck: vi.fn(),
    destroy: vi.fn()
  }));

  open['cdRef'] = { detach: vi.fn(), reattach: vi.fn(), detectChanges: vi.fn() };
  open['messageContainerRef'] = { createComponent, createEmbeddedView };
  open['spacerTemplate'] = { __spacer: true };
  open['messageRendererTemplate'] = null;
  open['messages'] = messages;
  open['sessionMetaMap'] = new Map();
  open['artifactMap'] = new Map();
  open['agentRunMap'] = new Map();
  open['ratingsMap'] = new Map();
  open['attachmentsMap'] = new Map();
  open['userAvatarMap'] = new Map();
  open['conversation'] = null;
  open['currentUser'] = { Name: 'Tester' };
  open['isProcessing'] = false;
  open['messageExtraTemplate'] = null;
  open['_renderedMessages'] = new Map();
  open['_measuredHeights'] = new Map();
  open['_mountedTopKey'] = null;
  open['_previousMessageCount'] = 0;
  open['_previousFirstKey'] = null;
  open['updateMessageItemInstance'] = vi.fn();

  return { component, open, createComponent, createEmbeddedView, destroyed };
}

function invokePrivate(component: MessageListComponent, name: string, ...args: unknown[]): unknown {
  const fn = (component as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
  return fn.apply(component, args);
}

function entries(h: Harness): Map<string, { kind: string }> {
  return h.open['_renderedMessages'] as Map<string, { kind: string }>;
}

function kindsByKey(h: Harness): Record<string, string> {
  const out: Record<string, string> = {};
  entries(h).forEach((v, k) => { out[k] = v.kind; });
  return out;
}

describe('MessageListComponent — DOM unmount', () => {
  it('spacers out items beyond the mounted span and keeps the tail live', () => {
    // 40 messages, mounted span is pageSize(10) + 2*buffer(5) = 20. The oldest 20 become
    // spacers; the newest 20 stay mounted.
    const messages = Array.from({ length: 40 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);

    invokePrivate(h.component, 'updateMessages', messages);

    const kinds = kindsByKey(h);
    expect(kinds['d-0']).toBe('spacer');
    expect(kinds['d-19']).toBe('spacer');
    expect(kinds['d-20']).toBe('component');
    expect(kinds['d-39']).toBe('component');

    const mounted = Object.values(kinds).filter(k => k === 'component').length;
    expect(mounted).toBe(20);
  });

  it('never unmounts the LAST item, even far outside the span', () => {
    // The tail carries streaming output, isLastMessage affordances and suggested responses.
    const messages = Array.from({ length: 40 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);
    // Pin the span to the very top so the tail falls outside it.
    h.open['_mountedTopKey'] = 'd-0';

    invokePrivate(h.component, 'updateMessages', messages);

    expect(kindsByKey(h)['d-39']).toBe('component');
  });

  it('never unmounts an In-Progress message', () => {
    const messages = Array.from({ length: 40 }, (_, i) =>
      detail(`d-${i}`, i + 1, i === 2 ? { Status: 'In-Progress' } : {})
    );
    const h = createHarness(messages);

    invokePrivate(h.component, 'updateMessages', messages);

    // d-2 is deep in spacer territory, but it is mid-stream — unmounting would drop its
    // live state on the floor.
    expect(kindsByKey(h)['d-2']).toBe('component');
    expect(kindsByKey(h)['d-1']).toBe('spacer');
  });

  it('holds the unmounted item\'s measured height, not the estimate', () => {
    const messages = Array.from({ length: 40 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);

    // Mount everything first (span pinned to the top) so the rows have a rendered height…
    h.open['_mountedTopKey'] = 'd-0';
    invokePrivate(h.component, 'updateMessages', messages);
    expect(kindsByKey(h)['d-0']).toBe('component');

    // …then let the span follow the tail again, unmounting the old ones.
    h.open['_mountedTopKey'] = null;
    invokePrivate(h.component, 'updateMessages', messages);

    // The stubbed component reported offsetHeight 140 before being destroyed. A spacer
    // using the 72px estimate instead would shift everything below it by 68px — which is
    // exactly the jumpy scrolling spacers exist to prevent.
    const heights = h.open['_measuredHeights'] as Map<string, number>;
    expect(heights.get('d-0')).toBe(140);
    expect(kindsByKey(h)['d-0']).toBe('spacer');

    // Items that WERE rendered get their real height; ones spacered before ever mounting
    // legitimately fall back to the estimate, so this checks the measured value is used
    // rather than that every spacer shares one height.
    const spacerHeights = h.createEmbeddedView.mock.calls.map(c => (c[1] as { height: number }).height);
    expect(spacerHeights).toContain(140);
  });

  it('falls back to an estimate for an item never rendered', () => {
    const messages = Array.from({ length: 40 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);
    // Nothing was mounted first, so nothing was ever measured.
    h.open['_renderedMessages'] = new Map();

    invokePrivate(h.component, 'updateMessages', messages);

    const spacerCtx = h.createEmbeddedView.mock.calls.map(c => c[1] as { height: number });
    expect(spacerCtx[0].height).toBe(72);   // ESTIMATED_MESSAGE_HEIGHT
  });

  it('remounts around a spacer WITHOUT asking the host for more data', () => {
    const messages = Array.from({ length: 40 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);
    const olderRequested = vi.fn();
    h.open['OlderRequested'] = { emit: olderRequested };

    invokePrivate(h.component, 'updateMessages', messages);
    expect(kindsByKey(h)['d-10']).toBe('spacer');

    // The user scrolls back and d-10's spacer enters the viewport.
    invokePrivate(h.component, 'remountAround', 'd-10');

    expect(kindsByKey(h)['d-10']).toBe('component');
    // The rows were already in `messages` — remounting is a DOM operation, not a fetch.
    expect(olderRequested).not.toHaveBeenCalled();
  });

  it('keeps the mounted set BOUNDED after scrolling back', () => {
    // REGRESSION: pinning the top and leaving the bottom at the tail made the mounted set
    // grow every time the user scrolled up, and never shrink — 60 components mounted with
    // zero spacers, which is the exact unbounded DOM this phase exists to prevent.
    const messages = Array.from({ length: 60 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);

    invokePrivate(h.component, 'updateMessages', messages);
    const initialMounted = Object.values(kindsByKey(h)).filter(k => k === 'component').length;

    // Scroll back toward the top a few times.
    invokePrivate(h.component, 'remountAround', 'd-30');
    invokePrivate(h.component, 'remountAround', 'd-15');
    invokePrivate(h.component, 'remountAround', 'd-2');

    const mounted = Object.values(kindsByKey(h)).filter(k => k === 'component').length;
    // The window MOVES; it does not accumulate. (+1 for the always-mounted tail.)
    expect(mounted).toBeLessThanOrEqual(initialMounted + 1);
    expect(mounted).toBeLessThan(30);
    // …and the far end is now spacered, because the user is up at the top.
    expect(kindsByKey(h)['d-50']).toBe('spacer');
  });

  it('pins the mounted span by KEY so a prepend does not collapse it', () => {
    // Indices shift when an older page arrives; a stored index would silently point at a
    // different message and yank the user back toward the tail.
    const messages = Array.from({ length: 40 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);
    invokePrivate(h.component, 'updateMessages', messages);
    invokePrivate(h.component, 'remountAround', 'd-10');
    const pinned = h.open['_mountedTopKey'];

    // Ten OLDER messages arrive at the head.
    const older = Array.from({ length: 10 }, (_, i) => detail(`older-${i}`, -10 + i));
    const grown = [...older, ...messages];
    h.open['messages'] = grown;
    invokePrivate(h.component, 'updateMessages', grown);

    expect(h.open['_mountedTopKey']).toBe(pinned);
    expect(kindsByKey(h)['d-10']).toBe('component');   // still mounted after the shift
    expect(kindsByKey(h)['older-0']).toBe('spacer');   // the new arrivals are spacered
  });
});
