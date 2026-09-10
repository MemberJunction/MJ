// @vitest-environment jsdom
// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MJNotificationService, MJRichNotificationOptions } from '../lib/notifications.service';

/**
 * CreateRichNotification — the toast that announces an agent's completion.
 *
 * The completion is announced twice (the server's Agent Completion notification and the
 * client that ran the agent), so the rules under test are about hearing it once, in one
 * wording: a live toast is never rewritten, a deferred one is superseded, and the host's
 * image resolver decides the face on the toast.
 *
 * Exercised WITHOUT Angular DI: the service is created via Object.create(prototype) so the
 * real methods run against directly-seeded state, with no MJGlobal event wiring.
 */

type Open = Record<string, unknown>;

function createService(): MJNotificationService {
  const service = Object.create(MJNotificationService.prototype) as MJNotificationService;
  const open = service as unknown as Open;
  open['liveRichToasts'] = new Map();
  open['pendingRichToasts'] = new Map();
  service.CompletionImageUrlResolver = null;
  return service;
}

const toasts = () => Array.from(document.querySelectorAll('#mj-toast-container .mj-toast--rich'));
const bodyOf = (el: Element) => el.querySelector(':scope > div') as HTMLElement;
const titleOf = (el: Element) => bodyOf(el).children[0]?.textContent?.trim();
const detailOf = (el: Element) => bodyOf(el).children[1]?.textContent?.trim() ?? null;
const imageOf = (el: Element) => el.querySelector('img')?.getAttribute('src') ?? null;

const base: MJRichNotificationOptions = { title: 'Betty completed your request', message: 'created a new artifact', dedupeKey: 'agent-completion:c1', context: { conversationId: 'c1' } };

describe('CreateRichNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders title, detail and the caller\'s image on a token-styled card', () => {
    const service = createService();
    service.CreateRichNotification({ title: 'Betty finished', message: 'in General Discussion', imageUrl: '/betty.svg' });
    const [el] = toasts();
    expect(toasts()).toHaveLength(1);
    expect(titleOf(el)).toBe('Betty finished');
    expect(detailOf(el)).toBe('in General Discussion');
    expect(imageOf(el)).toBe('/betty.svg');
    expect((el as HTMLElement).style.borderLeft).toContain('var(--mj-brand-primary)');
    expect((el as HTMLElement).style.background).toContain('var(--mj-bg-surface-card)');
  });

  it('falls back to an icon when there is no image', () => {
    const service = createService();
    service.CreateRichNotification({ title: 'Agent finished' });
    const [el] = toasts();
    expect(imageOf(el)).toBeNull();
    expect(el.querySelector('i.fa-solid.fa-robot')).not.toBeNull();
  });

  it("the host's CompletionImageUrlResolver wins over the caller's image — the host knows how the assistant is branded", () => {
    const service = createService();
    service.CompletionImageUrlResolver = (ctx) => (ctx.conversationId === 'c1' ? '/org-avatar.png' : null);
    service.CreateRichNotification({ ...base, imageUrl: '/agent-logo.png' });
    expect(imageOf(toasts()[0])).toBe('/org-avatar.png');
  });

  it('a toast already on screen is never rewritten by a same-key call — it just stays up longer', () => {
    const service = createService();
    service.CreateRichNotification({ ...base, title: 'Betty finished', message: 'in General Discussion', hideAfter: 5000 });
    vi.advanceTimersByTime(4000);
    service.CreateRichNotification({ ...base, hideAfter: 5000 });
    expect(toasts()).toHaveLength(1);
    expect(titleOf(toasts()[0])).toBe('Betty finished');
    vi.advanceTimersByTime(4000); // 8 s after the first show — past its own timer, inside the extension
    expect(toasts()[0].getAttribute('style')).not.toContain('mj-toast-slide-out');
  });

  it('a deferred toast is superseded by a same-key call, which shows at once — one toast, the later wording', () => {
    const service = createService();
    service.CreateRichNotification({ ...base, deferMs: 1500 });       // the server's announcement, held back
    expect(toasts()).toHaveLength(0);
    vi.advanceTimersByTime(50);
    service.CreateRichNotification({ ...base, title: 'Betty finished', message: 'in General Discussion' }); // the client's
    expect(toasts()).toHaveLength(1);
    expect(titleOf(toasts()[0])).toBe('Betty finished');
    vi.advanceTimersByTime(3000);
    expect(toasts()).toHaveLength(1); // the deferred one never rendered
  });

  it('a deferred toast shows on its own once the delay passes with no one else announcing', () => {
    const service = createService();
    service.CreateRichNotification({ ...base, deferMs: 1500 });
    vi.advanceTimersByTime(1499);
    expect(toasts()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(toasts()).toHaveLength(1);
    expect(titleOf(toasts()[0])).toBe('Betty completed your request');
  });

  it('auto-hides after hideAfter', () => {
    const service = createService();
    service.CreateRichNotification({ title: 'Betty finished', hideAfter: 5000 });
    const [el] = toasts();
    vi.advanceTimersByTime(5000);
    expect((el as HTMLElement).style.animation).toContain('mj-toast-slide-out');
    el.dispatchEvent(new Event('animationend'));
    expect(toasts()).toHaveLength(0);
  });

  it('escapes markup in title and detail', () => {
    const service = createService();
    service.CreateRichNotification({ title: '<b>x</b>', message: '<img src=x onerror=alert(1)>' });
    const [el] = toasts();
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelectorAll('img')).toHaveLength(0);
    expect(el.textContent).toContain('<b>x</b>');
  });
});
