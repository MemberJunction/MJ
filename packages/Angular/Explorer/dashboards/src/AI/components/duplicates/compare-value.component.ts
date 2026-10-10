import { Component, Input } from '@angular/core';

/**
 * A comparison value longer than this many characters renders collapsed by
 * default (clamped to two lines). 120 characters is roughly two lines of a
 * comparison column at its minimum width, so anything below it already fits
 * and gets no toggle.
 */
export const LONG_VALUE_THRESHOLD = 120;

/**
 * One field value in the duplicate-record comparison grid.
 *
 * Long values (photo URLs, notes, JSON blobs) start collapsed with a
 * "Show more" / "Show less" toggle so they don't push every other row out of
 * view. Nothing is hidden: expanding shows the full text, and the full value
 * is always in the `title` tooltip. Short values render unchanged with no
 * toggle.
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
export class CompareValueComponent {
  private _value = '';

  /** The value to display. Changing it collapses the view again. */
  @Input()
  set Value(value: string | null | undefined) {
    const next = value ?? '';
    if (next !== this._value) {
      this._value = next;
      this.Expanded = false;
    }
  }
  get Value(): string {
    return this._value;
  }

  /** Whether a long value is currently expanded. */
  public Expanded = false;

  /** True when the value exceeds {@link LONG_VALUE_THRESHOLD}. */
  public get IsLong(): boolean {
    return this._value.length > LONG_VALUE_THRESHOLD;
  }

  /** True when the value is long and not expanded. */
  public get IsCollapsed(): boolean {
    return this.IsLong && !this.Expanded;
  }

  /** Expand or collapse this value without selecting it for the merge. */
  public ToggleExpanded(event: MouseEvent): void {
    event.stopPropagation();
    this.Expanded = !this.Expanded;
  }
}
