import { Directive, ElementRef, HostListener, Input, OnDestroy, Renderer2, inject } from '@angular/core';

const DELAY_MS = 450;
const MAX_WIDTH = 300; // ~1.5 tab-widths; height is capped at 3 lines below.

/**
 * `mjTip` — a small, reusable, THEMED hover tooltip for dense surfaces (tab labels, truncated
 * selects, …). Behavior:
 *   - shows the full text only after the pointer holds STILL over the host (~450ms);
 *   - NON-INTERACTIVE (`pointer-events:none`) so it never blocks a click, and leaves on the next mousemove;
 *   - by default shows ONLY when the host is truncated (`scrollWidth > clientWidth`) — pass `mjTipAlways`
 *     for hosts whose truncation can't be measured (a native `<select>`), so the full value shows regardless;
 *   - themed via design tokens (inline `var()` styles, since it is appended to `<body>`), with a NEUTRAL
 *     `rgba(0,0,0,…)` shadow so it reads as a shadow in BOTH light and dark mode (a token-tinted shadow
 *     glows in dark). Capped at ~1.5 tab-widths × 3 lines — never a screen-wide banner.
 */
@Directive({ selector: '[mjTip]', standalone: true })
export class MJWorkspaceTipDirective implements OnDestroy {
  private host = inject(ElementRef).nativeElement as HTMLElement;
  private r = inject(Renderer2);

  @Input('mjTip') Text = '';
  /** Show even when the host isn't measurably truncated (e.g. a native <select>). */
  @Input('mjTipAlways') Always = false;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private tip: HTMLElement | null = null;

  @HostListener('mouseenter') onEnter(): void {
    this.arm();
  }
  @HostListener('mousemove') onMove(): void {
    this.hide();
    this.arm();
  }
  @HostListener('mouseleave') onLeave(): void {
    this.clear();
    this.hide();
  }
  ngOnDestroy(): void {
    this.clear();
    this.hide();
  }

  private arm(): void {
    this.clear();
    this.timer = setTimeout(() => this.show(), DELAY_MS);
  }
  private clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private show(): void {
    this.timer = null;
    const text = (this.Text ?? '').trim();
    if (!text) return;
    if (!this.Always && this.host.scrollWidth <= this.host.clientWidth + 1) return;

    const rect = this.host.getBoundingClientRect();
    const el = this.r.createElement('div') as HTMLElement;
    this.r.setProperty(el, 'textContent', text);
    this.r.setAttribute(el, 'role', 'tooltip');
    this.styleTip(el.style);
    this.r.appendChild(document.body, el);
    this.tip = el;
    // Keep it on-screen (measured after append) — clamp right, flip above if it would overflow bottom.
    const left = Math.max(4, Math.min(Math.round(rect.left), window.innerWidth - el.offsetWidth - 4));
    let top = Math.round(rect.bottom + 4);
    if (top + el.offsetHeight > window.innerHeight - 4) top = Math.max(4, Math.round(rect.top - el.offsetHeight - 4));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  private styleTip(s: CSSStyleDeclaration): void {
    s.position = 'fixed';
    s.left = '0';
    s.top = '0';
    s.zIndex = '1000';
    s.pointerEvents = 'none';
    s.maxWidth = `${MAX_WIDTH}px`;
    s.overflow = 'hidden';
    s.display = '-webkit-box';
    s.setProperty('-webkit-line-clamp', '3');
    s.setProperty('-webkit-box-orient', 'vertical');
    s.padding = '5px 9px';
    s.borderRadius = '6px';
    s.background = 'var(--mj-bg-surface-elevated, var(--mj-bg-surface))';
    s.border = '1px solid var(--mj-border-default)';
    s.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.18)';
    s.color = 'var(--mj-text-primary)';
    s.fontSize = '12px';
    s.lineHeight = '1.35';
    s.whiteSpace = 'normal';
    s.wordBreak = 'break-word';
  }

  private hide(): void {
    if (this.tip) {
      this.r.removeChild(document.body, this.tip);
      this.tip = null;
    }
  }
}
