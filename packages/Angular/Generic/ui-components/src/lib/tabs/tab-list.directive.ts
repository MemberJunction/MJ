import {
  AfterViewChecked,
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  inject,
} from '@angular/core';

/** A keyboard-driven request from the tab list, carrying the tab it refers to. */
export interface MJTabListRequest {
  /** Position of the tab among its siblings, which is all this directive can know about identity. */
  Index: number;
  /** The tab element itself, for hosts that key off a data attribute rather than position. */
  Element: HTMLElement;
}

/**
 * `mjTabList` — the ARIA tabs keyboard contract, shared by every MJ tab strip.
 *
 * Applied to the element that holds the tabs. It manages the things the APG tabs pattern requires
 * and that hand-rolled strips almost always miss:
 *
 *  - **roving tabindex** — exactly ONE tab is in the page tab order at a time (the selected one),
 *    so Tab moves past the whole strip rather than through every tab in it;
 *  - **arrow-key navigation** — Left/Right move between tabs and activate, Home/End jump to the
 *    ends, wrapping at the edges;
 *  - **Enter / Space** activate the focused tab;
 *  - **Delete / Backspace** request closure of the focused tab, which is the APG answer for
 *    closeable tabs — a close button inside a tab cannot be its own tab stop without putting two
 *    stops per tab in the page order.
 *
 * ## Why a directive rather than a base class
 *
 * MJ's two strips disagree about what a tab IS: one projects `<mj-tab>` component instances and
 * addresses them by positional index, the other renders a data array and addresses it by stable id.
 * A shared base class would have to pick one of those models. This directive picks neither — it
 * operates on the DOM, so each strip keeps its own contract and only has to agree that a tab is
 * `[role="tab"]` and that the selected one carries `aria-selected="true"`. That agreement is the
 * accessibility requirement anyway, so nothing is invented to make the sharing work.
 *
 * ## What the host must do
 *
 * Mark each tab `role="tab"`, keep `aria-selected` truthful, and act on `(TabActivateRequested)` /
 * `(TabCloseRequested)`. The directive sets `role="tablist"` and owns `tabindex` — do not also bind
 * it, or the two will fight.
 */
@Directive({
  selector: '[mjTabList]',
  standalone: true,
  host: { role: 'tablist' },
})
export class MJTabListDirective implements AfterViewInit, AfterViewChecked, OnDestroy {
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;

  /** The user asked to move to / activate a tab. The host maps the index onto its own model. */
  @Output() TabActivateRequested = new EventEmitter<MJTabListRequest>();

  /** The user pressed Delete/Backspace on a tab. Hosts without closeable tabs simply ignore this. */
  @Output() TabCloseRequested = new EventEmitter<MJTabListRequest>();

  /**
   * Backstop for tab changes that happen OUTSIDE the host's change detection — a strip that mutates
   * its own DOM, or a projected tab whose component re-renders itself without the parent view being
   * checked. Change detection is the primary trigger (see `ngAfterViewChecked`); this catches the
   * rest. Both funnel into the same idempotent write.
   */
  private readonly observer: MutationObserver | null =
    typeof MutationObserver === 'function' ? new MutationObserver(() => this.applyRovingTabIndex()) : null;

  constructor() {
    this.observer?.observe(this.host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    });
  }

  ngAfterViewInit(): void {
    this.applyRovingTabIndex();
  }

  /**
   * The primary trigger. Deliberately a lifecycle hook rather than only the MutationObserver:
   * observer callbacks are asynchronous, so between a selection change and the flush the tab order
   * would point at the PREVIOUS tab — and a tab with no `tabindex` at all is not focusable, making
   * `focus()` a silent no-op. Running here keeps the tab order correct in the same frame the
   * selection changed.
   *
   * Safe to run every cycle: it writes only when a value actually differs, so it cannot loop.
   */
  ngAfterViewChecked(): void {
    this.applyRovingTabIndex();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  /** All tabs in DOM order. Read live rather than cached — the host re-renders them freely. */
  private get tabs(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>('[role="tab"]'));
  }

  /**
   * A tab hidden with `display: none` still matches `[role="tab"]`, but it cannot take focus
   * (`focus()` silently no-ops) and hosts reject activating it — `mj-tabstrip` throws on selecting
   * an invisible tab, and Entity Actions really does hide tabs until a record is saved. So
   * navigation and the roving tab stop must skip them.
   *
   * Checked via INLINE style up the chain rather than `offsetParent`/`getClientRects`, because
   * jsdom computes no layout (those report every element as invisible in tests) while both strips
   * hide tabs exactly this way — `mj-tab` binds `[style.display]` on its host.
   */
  private isTabVisible(tab: HTMLElement): boolean {
    let el: HTMLElement | null = tab;
    while (el && el !== this.host) {
      if (el.style.display === 'none') return false;
      el = el.parentElement;
    }
    return true;
  }

  /**
   * Exactly one tab in the page tab order. Falls back to the first tab when nothing is selected,
   * so the strip is never a keyboard dead end (a list where every tab is -1 cannot be entered).
   */
  private applyRovingTabIndex(): void {
    const tabs = this.tabs;
    if (tabs.length === 0) return;
    // The single tab stop must be FOCUSABLE: the selected tab normally, but a hidden selected tab
    // (or no selection) falls back to the first visible one — a stop on a display:none element
    // would make the whole strip unreachable by keyboard.
    let stop = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true' && this.isTabVisible(t));
    if (stop < 0) stop = tabs.findIndex(t => this.isTabVisible(t));
    for (let i = 0; i < tabs.length; i++) {
      const next = i === stop ? '0' : '-1';
      // Write only on an actual difference — this runs on every change-detection pass, and a
      // needless setAttribute would both churn the DOM and re-trigger the MutationObserver.
      if (tabs[i].getAttribute('tabindex') !== next) {
        tabs[i].setAttribute('tabindex', next);
      }
    }
  }

  @HostListener('keydown', ['$event'])
  public OnKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs;
    if (tabs.length === 0) return;

    const target = event.target as HTMLElement | null;

    // A tab may project arbitrary content. Keys typed INTO an editable control must keep their
    // native meaning — hijacking Backspace inside an inline-rename input (or arrows moving its
    // caret) would be indefensible.
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
      return;
    }

    // Only handle keys aimed at a tab — a control INSIDE the panel must keep its own behaviour.
    const current = target?.closest<HTMLElement>('[role="tab"]');
    if (!current || !this.host.contains(current)) return;

    const index = tabs.indexOf(current);
    if (index === -1) return;

    // Arrow/Home/End navigate the VISIBLE tabs only — a hidden tab cannot take focus and hosts
    // reject activating it. Indices reported to the host stay positions in the FULL tab list, so
    // the host's own index-addressed model is never off-by-hidden.
    const visible = tabs.filter(t => this.isTabVisible(t));
    const visibleIndex = visible.indexOf(current);

    switch (event.key) {
      case 'ArrowRight':
        this.move(tabs, visible, (visibleIndex + 1) % visible.length, event);
        break;
      case 'ArrowLeft':
        this.move(tabs, visible, (visibleIndex - 1 + visible.length) % visible.length, event);
        break;
      case 'Home':
        this.move(tabs, visible, 0, event);
        break;
      case 'End':
        this.move(tabs, visible, visible.length - 1, event);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.TabActivateRequested.emit({ Index: index, Element: current });
        break;
      case 'Delete':
      case 'Backspace':
        event.preventDefault();
        this.TabCloseRequested.emit({ Index: index, Element: current });
        break;
      default:
        return;
    }
  }

  /**
   * Follow-focus activation: moving to a tab selects it, which is the APG default for tab lists
   * whose panels are cheap to show, and is what every desktop browser does.
   */
  private move(all: HTMLElement[], visible: HTMLElement[], to: number, event: KeyboardEvent): void {
    event.preventDefault();
    const target = visible[to];
    if (!target) return;
    // Focus BEFORE emitting: activation re-renders the strip in some hosts, and focusing a detached
    // element afterwards would silently drop focus to <body>.
    target.focus();
    this.TabActivateRequested.emit({ Index: all.indexOf(target), Element: target });
  }
}
