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
  // The real computeMountedRange reads scroll position off live DOM rects; tests that are
  // about the mount/spacer RULES stub it, and the range logic gets its own test below.
  open['computeMountedRange'] = (timeline: unknown[]) => ({
    start: Math.max(0, timeline.length - 20),
    end: timeline.length - 1
  });
  open['resolveScrollParent'] = () => null;
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

describe('MessageListComponent — mounted range follows scroll position', () => {
  /**
   * The range is derived from where things actually are on screen, NOT from which spacer
   * happened to fire an IntersectionObserver.
   *
   * Reacting to spacers is circular — a spacer's height is an estimate, so where it sits
   * decides what is visible, which decides which spacers fire, which changes what is
   * mounted, which changes heights. That loop made the transcript replay the same region;
   * constraining it to one direction traded the ping-pong for dead zones that never
   * remounted. Scroll position is an input nothing in the render loop writes back to.
   */
  function harnessWithLayout(count: number, itemHeight: number, scrollTop: number, viewport: number) {
    const messages = Array.from({ length: count }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);

    const rootTop = 0;
    const root = {
      clientHeight: viewport,
      getBoundingClientRect: () => ({ top: rootTop })
    };
    h.open['resolveScrollParent'] = () => root;

    // Every item is laid out contiguously; scrolling shifts them all up by scrollTop.
    h.open['nodeForKey'] = (key: string) => {
      const index = Number(key.replace('d-', ''));
      if (Number.isNaN(index)) {
        return undefined;
      }
      const top = index * itemHeight - scrollTop;
      return { getBoundingClientRect: () => ({ top, height: itemHeight }) };
    };
    // Non-empty so computeMountedRange does not take the first-paint shortcut.
    h.open['_renderedMessages'] = new Map([['seed', { kind: 'component', ref: {} }]]);
    // These tests exercise the REAL range logic, so drop the harness's stub of it.
    delete h.open['computeMountedRange'];
    return { h, messages };
  }

  it('mounts what is on screen plus a buffer, at the top of a long transcript', () => {
    // 100 items of 100px, viewport 500px, scrolled to the very top → items 0-4 visible.
    const { h, messages } = harnessWithLayout(100, 100, 0, 500);
    const timeline = messages.map(m => ({ Kind: 'message' as const, Detail: m }));

    const range = invokePrivate(h.component, 'computeMountedRange', timeline) as { start: number; end: number };

    expect(range.start).toBe(0);        // clamped — nothing above index 0
    expect(range.end).toBe(9);          // last visible (4) + buffer (5)
  });

  it('moves the window down as the user scrolls down', () => {
    // Scrolled 3000px → items 30-34 visible.
    const { h, messages } = harnessWithLayout(100, 100, 3000, 500);
    const timeline = messages.map(m => ({ Kind: 'message' as const, Detail: m }));

    const range = invokePrivate(h.component, 'computeMountedRange', timeline) as { start: number; end: number };

    expect(range.start).toBe(25);       // first visible (30) - buffer (5)
    expect(range.end).toBe(39);         // last visible (34) + buffer (5)
  });

  it('moves the window back up as the user scrolls up — no dead zone', () => {
    // The bug this replaces: after scrolling up, items below stayed spacered forever and
    // rendered as blank space that never filled in.
    const { h, messages } = harnessWithLayout(100, 100, 500, 500);
    const timeline = messages.map(m => ({ Kind: 'message' as const, Detail: m }));

    const range = invokePrivate(h.component, 'computeMountedRange', timeline) as { start: number; end: number };

    expect(range.start).toBe(0);        // first visible (5) - buffer, clamped
    expect(range.end).toBe(14);         // last visible (9) + buffer
  });

  it('stays bounded no matter how far down the transcript the user is', () => {
    const { h, messages } = harnessWithLayout(500, 100, 20000, 500);
    const timeline = messages.map(m => ({ Kind: 'message' as const, Detail: m }));

    const range = invokePrivate(h.component, 'computeMountedRange', timeline) as { start: number; end: number };

    expect(range.end - range.start + 1).toBeLessThanOrEqual(20);
  });
});

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
    // Force the window to the very top so the tail falls outside it.
    h.open['computeMountedRange'] = () => ({ start: 0, end: 19 });

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

    // Mount the top of the list first so those rows have a rendered height…
    h.open['computeMountedRange'] = () => ({ start: 0, end: 19 });
    invokePrivate(h.component, 'updateMessages', messages);
    expect(kindsByKey(h)['d-0']).toBe('component');

    // …then move the window to the tail, unmounting them.
    h.open['computeMountedRange'] = (t: unknown[]) => ({ start: t.length - 20, end: t.length - 1 });
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




  it('does not rebuild the spacer observer when the spacer set is unchanged', () => {
    // syncSpacerObserver runs every checked cycle, and a fresh IntersectionObserver delivers
    // an initial callback for everything it observes — so rebuilding unconditionally re-fired
    // remountAround on every change-detection pass.
    const messages = Array.from({ length: 60 }, (_, i) => detail(`d-${i}`, i + 1));
    const h = createHarness(messages);
    invokePrivate(h.component, 'updateMessages', messages);

    let constructed = 0;
    const Original = globalThis.IntersectionObserver;
    class FakeIO {
      constructor() { constructed++; }
      observe(): void { /* no-op */ }
      disconnect(): void { /* no-op */ }
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
    h.open['resolveScrollParent'] = () => ({ tag: 'scroller' });

    try {
      invokePrivate(h.component, 'syncSpacerObserver');
      invokePrivate(h.component, 'syncSpacerObserver');
      invokePrivate(h.component, 'syncSpacerObserver');
    } finally {
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = Original;
    }

    expect(constructed).toBe(1);
  });

});
