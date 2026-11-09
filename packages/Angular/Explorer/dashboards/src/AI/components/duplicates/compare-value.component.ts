import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Injector,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  afterNextRender,
  inject,
} from '@angular/core';

/**
 * A comparison value longer than this many characters is a candidate for
 * collapsing. It is only a cheap pre-filter: whether the value actually gets a
 * "Show more" toggle depends on whether it overflows two lines at the column's
 * real width (see {@link CompareValueComponent.Overflows}). Anything shorter
 * always fits, so it is never measured.
 */
export const LONG_VALUE_THRESHOLD = 120;

/** How many lines a collapsed value shows. Keep in sync with `-webkit-line-clamp` in the CSS. */
export const COLLAPSED_LINES = 2;

/**
 * One field value in the duplicate-record comparison grid.
 *
 * Long values (photo URLs, notes, JSON blobs) start collapsed to two lines,
 * with a "Show more" / "Show less" toggle, so they don't push every other row
 * out of view. The toggle only appears when the text really overflows two lines
 * at the column's current width, re-checked whenever the column resizes. Nothing
 * is hidden: expanding shows the full text, and a truncated value carries the
 * full text in its `title` tooltip. Short values render unchanged with no toggle.
 *
 * The toggle stops click propagation so expanding a value never selects it
 * for the merge; a click anywhere else on the value still bubbles to the
 * containing cell, which owns selection.
 */
@Component({
  standalone: true,
  selector: 'mj-compare-value',
  templateUrl: './compare-value.component.html',
  styleUrls: ['./compare-value.component.css'],
})
export class CompareValueComponent implements AfterViewInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly injector = inject(Injector);
  private resizeObserver: ResizeObserver | null = null;
  private _value = '';

  @ViewChild('valueText') private textRef?: ElementRef<HTMLElement>;

  /** The value to display. Changing it collapses the view again and re-checks the overflow. */
  @Input()
  set Value(value: string | null | undefined) {
    const next = value ?? '';
    if (next !== this._value) {
      this._value = next;
      this.Expanded = false;
      this.scheduleMeasure();
    }
  }
  get Value(): string {
    return this._value;
  }

  /**
   * Whether a long value is expanded. Bind it two-way (`[(Expanded)]`) to share one state across a row, so
   * expanding one column's value expands the others in that row too.
   */
  @Input() Expanded = false;

  /** Emitted when the user toggles the value, with the new expanded state. */
  @Output() ExpandedChange = new EventEmitter<boolean>();

  /**
   * True when the value, clamped to {@link COLLAPSED_LINES} lines, does not fit at the column's current
   * width. Measured from the rendered text after each render that changes the value and on every resize.
   */
  public Overflows = false;

  /** True when the value exceeds {@link LONG_VALUE_THRESHOLD}, so it renders clamped until expanded. */
  public get IsLong(): boolean {
    return this._value.length > LONG_VALUE_THRESHOLD;
  }

  /** True when the value is long and not expanded. */
  public get IsCollapsed(): boolean {
    return this.IsLong && !this.Expanded;
  }

  /** True when the toggle should show: the value is long and really overflows two lines. */
  public get ShowToggle(): boolean {
    return this.IsLong && this.Overflows;
  }

  /** True when part of the value is hidden right now, so the tooltip carries the full text. */
  public get IsTruncated(): boolean {
    return this.IsCollapsed && this.Overflows;
  }

  public ngAfterViewInit(): void {
    const text = this.textRef?.nativeElement;
    if (text && typeof ResizeObserver !== 'undefined') {
      // Fires when the column narrows or widens, and when the text expands or collapses
      this.resizeObserver = new ResizeObserver(() => this.measureOverflow());
      this.resizeObserver.observe(text);
    }
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  /** Expand or collapse this value without selecting it for the merge. */
  public ToggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.Expanded = !this.Expanded;
    this.ExpandedChange.emit(this.Expanded);
  }

  /** Measure once the new value has rendered (a value change doesn't always resize the clamped box). */
  private scheduleMeasure(): void {
    afterNextRender(() => this.measureOverflow(), { injector: this.injector });
  }

  private measureOverflow(): void {
    const overflows = this.computeOverflows();
    if (overflows !== this.Overflows) {
      this.Overflows = overflows;
      this.cdr.markForCheck();
    }
  }

  private computeOverflows(): boolean {
    const text = this.textRef?.nativeElement;
    if (!text || !this.IsLong) {
      return false;
    }
    if (this.IsCollapsed) {
      // The clamp hides whatever is taller than the visible box
      return text.scrollHeight > text.clientHeight + 1;
    }
    // Expanded: there is no clamp to compare against, so compare with the height of the collapsed lines
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
    if (!Number.isFinite(lineHeight)) {
      return this.Overflows;
    }
    return text.scrollHeight > lineHeight * COLLAPSED_LINES + 1;
  }
}
