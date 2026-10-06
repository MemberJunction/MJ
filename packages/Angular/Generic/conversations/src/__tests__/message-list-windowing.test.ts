// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageListComponent } from '../lib/components/message/message-list.component';

/**
 * PHASE 5 of the windowed transcript: the "earlier messages" sentinel, prepending older
 * pages, and holding the user's scroll position while it happens.
 *
 * Exercised at the class level WITHOUT TestBed — the component is built via
 * `Object.create(prototype)` so the real private methods run against stubbed collaborators.
 * The three behaviors here are all pure logic over DOM measurements, which a fake element
 * models perfectly well; asserting the sentinel's markup would need TestBed and buy little.
 */

interface ScrollStub {
  scrollHeight: number;
  scrollTop: number;
}

interface Harness {
  component: MessageListComponent;
  open: Record<string, unknown>;
  scrollEl: ScrollStub;
  olderRequestedEmit: ReturnType<typeof vi.fn>;
  scrollToBottom: ReturnType<typeof vi.fn>;
}

function createHarness(scrollHeight = 1000, scrollTop = 200): Harness {
  const component = Object.create(MessageListComponent.prototype) as MessageListComponent;
  const open = component as unknown as Record<string, unknown>;

  const scrollEl: ScrollStub = { scrollHeight, scrollTop };
  const olderRequestedEmit = vi.fn();
  const scrollToBottom = vi.fn();

  open['scrollContainer'] = { nativeElement: scrollEl };
  // The real resolveScrollParent walks the DOM with getComputedStyle to find the HOST's
  // scroller (this component's own container does not scroll). That walk needs a real
  // document, so it is stubbed here and verified in the browser instead.
  open['resolveScrollParent'] = () => scrollEl;
  open['OlderRequested'] = { emit: olderRequestedEmit };
  open['scrollToBottom'] = scrollToBottom;
  open['HasMoreAbove'] = false;
  open['IsLoadingOlder'] = false;
  open['_restoreScrollAfterPrepend'] = false;
  open['_shouldScrollToBottom'] = false;
  open['_heightBeforePrepend'] = 0;
  // Both observer syncs run at the end of every checked cycle; stub them out so the scroll
  // assertions aren't entangled with observer setup.
  open['syncOlderObserver'] = vi.fn();
  open['syncSpacerObserver'] = vi.fn();
  open['syncScrollListener'] = vi.fn();
  open['measureMountedItems'] = vi.fn();
  // Phase 6 derives the mounted span from live DOM rects; these tests are about prepend and
  // scroll restoration, so keep everything mounted and let the unmount suite cover the span.
  open['computeMountedRange'] = (timeline: unknown[]) => ({ start: 0, end: timeline.length - 1 });

  return { component, open, scrollEl, olderRequestedEmit, scrollToBottom };
}

/** Reaches a private method on the prototype-built component. */
function invokePrivate(component: MessageListComponent, name: string, ...args: unknown[]): unknown {
  const fn = (component as unknown as Record<string, (...a: unknown[]) => unknown>)[name];
  return fn.apply(component, args);
}

/** Builds the IntersectionObserver callback the component installs, capturing it for the test. */
function captureObserverCallback(h: Harness): (entries: Array<{ isIntersecting: boolean }>) => void {
  let captured: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
  const OriginalIO = globalThis.IntersectionObserver;

  class FakeIO {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      captured = cb;
    }
    observe(): void { /* no-op */ }
    disconnect(): void { /* no-op */ }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;

  // The component reads the sentinel out of the DOM rather than via @ViewChild, so the
  // stub is on that lookup.
  const sentinelEl = { id: 'sentinel' };
  h.open['findSentinelElement'] = () => sentinelEl;
  h.open['syncOlderObserver'] = MessageListComponent.prototype['syncOlderObserver' as keyof MessageListComponent];
  invokePrivate(h.component, 'syncOlderObserver');

  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = OriginalIO;
  if (!captured) {
    throw new Error('the component did not install an IntersectionObserver');
  }
  return captured;
}

describe('MessageListComponent — older-page sentinel', () => {
  let h: Harness;
  beforeEach(() => {
    h = createHarness();
  });

  it('emits OlderRequested when the sentinel intersects and a page is available', () => {
    h.open['HasMoreAbove'] = true;
    const fire = captureObserverCallback(h);

    fire([{ isIntersecting: true }]);

    expect(h.olderRequestedEmit).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit while an older page is already loading', () => {
    h.open['HasMoreAbove'] = true;
    h.open['IsLoadingOlder'] = true;
    const fire = captureObserverCallback(h);

    // A fast scroll can fire the observer repeatedly before the first page lands.
    fire([{ isIntersecting: true }]);
    fire([{ isIntersecting: true }]);

    expect(h.olderRequestedEmit).not.toHaveBeenCalled();
  });

  it('does NOT emit once the top of the conversation is reached', () => {
    h.open['HasMoreAbove'] = true;
    const fire = captureObserverCallback(h);
    h.open['HasMoreAbove'] = false; // last page arrived while the observer was live

    fire([{ isIntersecting: true }]);

    expect(h.olderRequestedEmit).not.toHaveBeenCalled();
  });

  it('does NOT emit when the sentinel scrolls back out of view', () => {
    h.open['HasMoreAbove'] = true;
    const fire = captureObserverCallback(h);

    fire([{ isIntersecting: false }]);

    expect(h.olderRequestedEmit).not.toHaveBeenCalled();
  });
});

describe('MessageListComponent — observer attaches to the real scroller', () => {
  /** Installs a fake IntersectionObserver and reports how many were constructed. */
  function withFakeIO(run: () => void): { constructed: number; roots: unknown[] } {
    const roots: unknown[] = [];
    let constructed = 0;
    const Original = globalThis.IntersectionObserver;

    class FakeIO {
      constructor(_cb: unknown, options?: { root?: unknown }) {
        constructed++;
        roots.push(options?.root ?? null);
      }
      observe(): void { /* no-op */ }
      disconnect(): void { /* no-op */ }
    }
    (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
    try {
      run();
    } finally {
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = Original;
    }
    return { constructed, roots };
  }

  it('does not attach until a scrolling ancestor exists', () => {
    // REGRESSION: nothing overflows on the first checked cycle, so resolveScrollParent
    // returns null. Attaching anyway would root the observer on the VIEWPORT, where a
    // sentinel clipped inside a scrolled container never intersects — the observer would
    // silently never fire, and the early-return meant it was never rebuilt.
    const h = createHarness();
    h.open['HasMoreAbove'] = true;
    h.open['findSentinelElement'] = () => ({ id: 'sentinel' });
    h.open['resolveScrollParent'] = () => null;
    h.open['syncOlderObserver'] = MessageListComponent.prototype['syncOlderObserver' as keyof MessageListComponent];

    const first = withFakeIO(() => invokePrivate(h.component, 'syncOlderObserver'));
    expect(first.constructed).toBe(0);

    // Content now overflows — the next cycle must attach, rooted on that element.
    const scroller = { tag: 'the-real-scroller' };
    h.open['resolveScrollParent'] = () => scroller;

    const second = withFakeIO(() => invokePrivate(h.component, 'syncOlderObserver'));
    expect(second.constructed).toBe(1);
    expect(second.roots[0]).toBe(scroller);
  });

  it('does not rebuild the observer once sentinel and root are unchanged', () => {
    const h = createHarness();
    const sentinel = {};
    const scroller = { tag: 'scroller' };
    h.open['HasMoreAbove'] = true;
    h.open['findSentinelElement'] = () => sentinel;
    h.open['resolveScrollParent'] = () => scroller;
    h.open['syncOlderObserver'] = MessageListComponent.prototype['syncOlderObserver' as keyof MessageListComponent];

    const result = withFakeIO(() => {
      invokePrivate(h.component, 'syncOlderObserver');
      invokePrivate(h.component, 'syncOlderObserver');
      invokePrivate(h.component, 'syncOlderObserver');
    });

    // syncOlderObserver runs every checked cycle — it must be idempotent.
    expect(result.constructed).toBe(1);
  });

  it('re-attaches when @if swaps the sentinel element', () => {
    const h = createHarness();
    const scroller = { tag: 'scroller' };
    h.open['HasMoreAbove'] = true;
    const first = { id: 'first' };
    const second = { id: 'second' };
    h.open['findSentinelElement'] = () => first;
    h.open['resolveScrollParent'] = () => scroller;
    h.open['syncOlderObserver'] = MessageListComponent.prototype['syncOlderObserver' as keyof MessageListComponent];

    const result = withFakeIO(() => {
      invokePrivate(h.component, 'syncOlderObserver');
      // HasMoreAbove toggled off and back on: Angular destroyed and recreated the div, so
      // the old observer is watching a detached node.
      h.open['findSentinelElement'] = () => second;
      invokePrivate(h.component, 'syncOlderObserver');
    });

    expect(result.constructed).toBe(2);
  });
});

describe('MessageListComponent — prepend reuses existing views', () => {
  /** Minimal row shape: what getMessageKey and BuildConversationTimeline read. */
  function detail(id: string, seconds: number) {
    return {
      ID: id,
      AgentSessionID: null,
      Role: 'User',
      Message: `m-${id}`,
      HiddenToUser: false,
      __mj_CreatedAt: new Date(2026, 0, 1, 0, 0, seconds)
    };
  }

  /**
   * A MessageItemComponent stand-in. Any property the creation path hasn't set yet reads
   * back as something subscribable, which covers the ~15 output emitters it wires up
   * without naming each one.
   */
  function fakeInstance(): Record<string, unknown> {
    return new Proxy({} as Record<string, unknown>, {
      get(target, prop: string) {
        return prop in target ? target[prop] : { subscribe: vi.fn() };
      },
      set(target, prop: string, value) {
        target[prop] = value;
        return true;
      }
    });
  }

  /** Wires the collaborators `updateMessages` touches on the create path. */
  function stubRenderPipeline(h: Harness, createComponent: ReturnType<typeof vi.fn>): void {
    h.open['cdRef'] = { detach: vi.fn(), reattach: vi.fn(), detectChanges: vi.fn() };
    h.open['messageContainerRef'] = { createComponent, createEmbeddedView: vi.fn() };
    h.open['messageRendererTemplate'] = null;
    h.open['sessionMetaMap'] = new Map();
    h.open['artifactMap'] = new Map();
    h.open['agentRunMap'] = new Map();
    h.open['ratingsMap'] = new Map();
    h.open['attachmentsMap'] = new Map();
    h.open['userAvatarMap'] = new Map();
    h.open['conversation'] = null;
    h.open['currentUser'] = { Name: 'Tester' };
    h.open['isProcessing'] = false;
    h.open['messageExtraTemplate'] = null;
    // Updating an existing bubble touches a lot of instance state; the concern here is
    // purely which entries survive, so stub the in-place update out.
    h.open['updateMessageItemInstance'] = vi.fn();
  }

  function fakeComponentRef() {
    return {
      instance: fakeInstance(),
      changeDetectorRef: { markForCheck: vi.fn(), detectChanges: vi.fn() },
      destroy: vi.fn()
    };
  }

  it('does not destroy or recreate views for messages already on screen', () => {
    const h = createHarness();
    const destroyB = vi.fn();
    const destroyC = vi.fn();
    const createComponent = vi.fn().mockImplementation(() => fakeComponentRef());
    stubRenderPipeline(h, createComponent);
    h.open['_previousMessageCount'] = 2;
    h.open['_previousFirstKey'] = 'B';

    // B and C are already rendered.
    const rendered = new Map<string, unknown>([
      ['B', { kind: 'component', ref: { destroy: destroyB, instance: {}, changeDetectorRef: {} } }],
      ['C', { kind: 'component', ref: { destroy: destroyC, instance: {}, changeDetectorRef: {} } }]
    ]);
    h.open['_renderedMessages'] = rendered;

    // Page up: A is prepended above them.
    invokePrivate(h.component, 'updateMessages', [detail('A', 1), detail('B', 2), detail('C', 3)]);

    expect(destroyB).not.toHaveBeenCalled();
    expect(destroyC).not.toHaveBeenCalled();
    // Only the newly-arrived row is created...
    expect(createComponent).toHaveBeenCalledTimes(1);
    // ...and at index 0, so DOM order matches the timeline rather than appending oldest last.
    expect(createComponent.mock.calls[0][1]).toEqual({ index: 0 });
  });

  it('flags a prepend for scroll restoration instead of scrolling to the bottom', () => {
    const h = createHarness();
    stubRenderPipeline(h, vi.fn().mockImplementation(() => fakeComponentRef()));
    h.open['_renderedMessages'] = new Map();
    h.open['_previousMessageCount'] = 2;
    h.open['_previousFirstKey'] = 'B';   // the head used to be B

    invokePrivate(h.component, 'updateMessages', [detail('A', 1), detail('B', 2), detail('C', 3)]);

    // The array grew, but at the HEAD — a naive length check would have scrolled to bottom.
    expect(h.open['_restoreScrollAfterPrepend']).toBe(true);
    expect(h.open['_shouldScrollToBottom']).toBe(false);
  });

  it('still flags scroll-to-bottom when a message is appended at the tail', () => {
    const h = createHarness();
    stubRenderPipeline(h, vi.fn().mockImplementation(() => fakeComponentRef()));
    h.open['_renderedMessages'] = new Map();
    h.open['_previousMessageCount'] = 2;
    h.open['_previousFirstKey'] = 'A';   // head unchanged — this is a send, not a page-up

    invokePrivate(h.component, 'updateMessages', [detail('A', 1), detail('B', 2), detail('C', 3)]);

    expect(h.open['_shouldScrollToBottom']).toBe(true);
    expect(h.open['_restoreScrollAfterPrepend']).toBe(false);
  });
});

describe('MessageListComponent — scroll restoration on prepend', () => {
  it('adds the height delta to scrollTop so the reader stays put', () => {
    // Before the prepend the transcript was 1000px and the user sat at 200px. Ten older
    // messages added 640px above them; without the correction they would now be looking at
    // content they never scrolled to.
    const h = createHarness(1640, 200);
    h.open['_heightBeforePrepend'] = 1000;
    h.open['_restoreScrollAfterPrepend'] = true;

    h.component.ngAfterViewChecked();

    expect(h.scrollEl.scrollTop).toBe(840); // 200 + (1640 - 1000)
    expect(h.scrollToBottom).not.toHaveBeenCalled();
    expect(h.open['_restoreScrollAfterPrepend']).toBe(false);
  });

  it('never scrolls to the bottom in the same tick as a restore', () => {
    const h = createHarness(1640, 200);
    h.open['_heightBeforePrepend'] = 1000;
    h.open['_restoreScrollAfterPrepend'] = true;
    // Both flags set: a restore must win, or paging up would snap to the newest message.
    h.open['_shouldScrollToBottom'] = true;

    h.component.ngAfterViewChecked();

    expect(h.scrollEl.scrollTop).toBe(840);
    expect(h.scrollToBottom).not.toHaveBeenCalled();
  });

  it('still scrolls to the bottom for a normal append', () => {
    const h = createHarness(1200, 400);
    h.open['_shouldScrollToBottom'] = true;

    h.component.ngAfterViewChecked();

    expect(h.scrollToBottom).toHaveBeenCalledTimes(1);
    expect(h.scrollEl.scrollTop).toBe(400); // untouched by the restore path
  });

  it('leaves scrollTop alone when the height did not actually grow', () => {
    const h = createHarness(1000, 200);
    h.open['_heightBeforePrepend'] = 1000;
    h.open['_restoreScrollAfterPrepend'] = true;

    h.component.ngAfterViewChecked();

    expect(h.scrollEl.scrollTop).toBe(200);
  });
});
