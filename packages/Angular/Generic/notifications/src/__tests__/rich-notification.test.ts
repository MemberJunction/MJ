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
/** The rich toast fills its live region on the next animation frame — step one. */
const frame = () => vi.advanceTimersToNextFrame();
/** Create and paint: what a caller sees one frame later. */
function show(service: MJNotificationService, options: MJRichNotificationOptions): void {
  service.CreateRichNotification(options);
  frame();
}
const bodyOf = (el: Element) => el.querySelector(':scope > div') as HTMLElement;
const titleOf = (el: Element) => bodyOf(el).children[0]?.textContent?.trim();
const detailOf = (el: Element) => bodyOf(el).children[1]?.textContent?.trim() ?? null;
const imageOf = (el: Element) => el.querySelector('img')?.getAttribute('src') ?? null;

const base: MJRichNotificationOptions = { title: 'Betty completed your request', message: 'created a new artifact', dedupeKey: 'agent-completion:c1', context: { conversationId: 'c1' } };

describe('CreateRichNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders title, detail and the caller\'s image on a token-styled card', () => {
    const service = createService();
    show(service, { title: 'Betty finished', message: 'in General Discussion', imageUrl: '/betty.svg' });
    const [el] = toasts();
    expect(toasts()).toHaveLength(1);
    expect(titleOf(el)).toBe('Betty finished');
    expect(detailOf(el)).toBe('in General Discussion');
    expect(imageOf(el)).toBe('/betty.svg');
    expect((el as HTMLElement).style.borderLeft).toContain('var(--mj-brand-primary)');
    expect((el as HTMLElement).style.background).toContain('var(--mj-bg-surface-card)');
  });

  it('falls back to an icon chip on the house tint when there is no image', () => {
    const service = createService();
    show(service, { title: 'Agent finished' });
    const [el] = toasts();
    expect(imageOf(el)).toBeNull();
    expect(el.querySelector('i.fa-solid.fa-robot')).not.toBeNull();
    const chip = el.querySelector('span[aria-hidden]') as HTMLElement;
    expect(chip.style.background).toContain('color-mix(in srgb, var(--mj-brand-primary) 14%, transparent)');
    expect(chip.style.color).toBe('var(--mj-brand-primary)');
  });

  it('always has a close button, auto-hide or not', () => {
    const service = createService();
    show(service, { title: 'Agent finished', hideAfter: 5000 });
    const [el] = toasts();
    const close = el.querySelector('button.mj-toast-close') as HTMLButtonElement;
    expect(close).not.toBeNull();
    close.click();
    expect((el as HTMLElement).style.animation).toContain('mj-toast-slide-out');
  });

  it('enters the DOM as an empty live region and is filled on the next frame, so it is announced', () => {
    const service = createService();
    service.CreateRichNotification({ title: 'Agent finished' });
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0].getAttribute('role')).toBe('status');
    expect(toasts()[0].textContent?.trim()).toBe('');       // in the tree, empty, this task
    frame();
    expect(titleOf(toasts()[0])).toBe('Agent finished');    // filled a frame later
  });

  it("the host's CompletionImageUrlResolver wins over the caller's image — the host knows how the assistant is branded", () => {
    const service = createService();
    service.CompletionImageUrlResolver = (ctx) => (ctx.conversationId === 'c1' ? '/org-avatar.png' : null);
    show(service, { ...base, imageUrl: '/agent-logo.png' });
    expect(imageOf(toasts()[0])).toBe('/org-avatar.png');
  });

  it('a toast already on screen is never rewritten by a same-key call — it just stays up longer', () => {
    const service = createService();
    show(service, { ...base, title: 'Betty finished', message: 'in General Discussion', hideAfter: 5000 });
    vi.advanceTimersByTime(2000);
    show(service, { ...base, hideAfter: 5000 });
    expect(toasts()).toHaveLength(1);
    expect(titleOf(toasts()[0])).toBe('Betty finished');
    vi.advanceTimersByTime(4000); // 6 s after the first show — past its own timer, inside the extension
    expect(toasts()[0].getAttribute('style')).not.toContain('mj-toast-slide-out');
  });

  it('a same-key call outside the dedupe window is a new announcement', () => {
    const service = createService();
    show(service, { ...base, title: 'Sage finished' });          // sticky, no hideAfter
    vi.advanceTimersByTime(3001);
    show(service, { ...base, title: 'Marketing Agent finished' });
    expect(toasts()).toHaveLength(2);
    expect(titleOf(toasts()[1])).toBe('Marketing Agent finished');
  });

  it('a same-key call during the slide-out renders a fresh toast instead of extending a dying one', () => {
    const service = createService();
    show(service, { ...base, hideAfter: 1000 });
    vi.advanceTimersByTime(1000);                                    // dismissal starts: still connected, animating out
    expect(toasts()[0].getAttribute('style')).toContain('mj-toast-slide-out');
    show(service, { ...base, title: 'Betty finished' });
    expect(toasts()).toHaveLength(2);
    expect(titleOf(toasts()[1])).toBe('Betty finished');
  });

  it('two deferred same-key calls: the second re-defers with its wording rather than showing at once', () => {
    const service = createService();
    service.CreateRichNotification({ ...base, deferMs: 1500 });
    vi.advanceTimersByTime(1000);
    service.CreateRichNotification({ ...base, title: 'Later wording', deferMs: 1500 });
    expect(toasts()).toHaveLength(0);
    vi.advanceTimersByTime(1499);
    expect(toasts()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    frame();
    expect(toasts()).toHaveLength(1);
    expect(titleOf(toasts()[0])).toBe('Later wording');
  });

  it('releases its registry entry when the toast is dismissed', () => {
    const service = createService();
    const live = (service as unknown as Open)['liveRichToasts'] as Map<string, unknown>;
    service.CreateRichNotification({ ...base, hideAfter: 1000 });
    expect(live.size).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(live.size).toBe(0);
  });

  it('hover pauses the auto-hide and leaving re-arms it', () => {
    const service = createService();
    show(service, { title: 'Agent finished', hideAfter: 5000 });
    const [el] = toasts();
    el.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(10000);
    expect((el as HTMLElement).style.animation).not.toContain('mj-toast-slide-out');
    el.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(2000);
    expect((el as HTMLElement).style.animation).toContain('mj-toast-slide-out');
  });

  it('shares one keyframes writer with the simple toast, so neither strips the other\'s easing', () => {
    const service = createService();
    service.CreateRichNotification({ title: 'Agent finished' });
    service.CreateSimpleNotification('Saved', 'success', 3000);
    const sheets = document.querySelectorAll('#mj-toast-keyframes');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].textContent).toContain('scale(0.96)');
  });

  it('a deferred toast is superseded by a same-key call, which shows at once — one toast, the later wording', () => {
    const service = createService();
    service.CreateRichNotification({ ...base, deferMs: 1500 });       // the server's announcement, held back
    expect(toasts()).toHaveLength(0);
    vi.advanceTimersByTime(50);
    show(service, { ...base, title: 'Betty finished', message: 'in General Discussion' }); // the client's
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
    frame();
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
    show(service, { title: '<b>x</b>', message: '<img src=x onerror=alert(1)>' });
    const [el] = toasts();
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelectorAll('img')).toHaveLength(0);
    expect(el.textContent).toContain('<b>x</b>');
  });
});
