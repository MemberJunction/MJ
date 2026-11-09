import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild
} from '@angular/core';
import { MJNamedControlBase } from '../a11y/named-control.base';
import { WarnIfUnnamed } from '../a11y/unnamed-control-guard';

/**
 * mj-page-search — Canonical in-page search input for dashboard headers and toolbars.
 * Replaces per-page `.search-input-wrapper` rules so styling can't drift.
 *
 * Distinct from `mj-search-input` (the navbar/global search in `@memberjunction/ng-search`)
 * — this one is a simple text input used for filtering page content.
 *
 * The `Placeholder` is the accessible name of last resort — it is what the name computation falls
 * back to, and it disappears the moment the user types. Pass
 * {@link MJNamedControlBase.AriaLabel} (or {@link MJNamedControlBase.AriaLabelledBy} when a visible
 * label exists) so the box has a name that survives having text in it. The control is a real
 * `<input>`, so {@link MJNamedControlBase.InputId} IS a valid `<label for>` target.
 *
 * Example:
 * ```html
 * <mj-page-search
 *   AriaLabel="Search templates"
 *   Placeholder="Search templates..."
 *   [Value]="searchTerm"
 *   (ValueChange)="onSearch($event)">
 * </mj-page-search>
 * ```
 */
@Component({
  selector: 'mj-page-search',
  standalone: true,
  template: `
    <div class="mj-page-search" [class.mj-page-search--focused]="focused">
      <!-- Decorative: the magnifier repeats what the name and placeholder already say. -->
      <i [class]="Icon" aria-hidden="true"></i>
      <input
        #searchInput
        type="text"
        [attr.id]="InputId || null"
        [attr.aria-label]="AriaLabel || null"
        [attr.aria-labelledby]="AriaLabelledBy || null"
        [attr.aria-describedby]="AriaDescribedBy || null"
        [placeholder]="Placeholder"
        [value]="Value"
        (input)="onInput($event)"
        (focus)="focused = true"
        (blur)="focused = false" />
    </div>
  `,
  styles: [`
    :host {
      display: inline-flex;
      min-width: 220px;
    }

    /* Compact toolbar density (32px) to match mjButton size="sm" and other
       header widgets. White background + border-default for visual differentiation
       on both the page-header (white) and body (sunken) surfaces.
       Note: this is intentionally tighter than .mj-input (38px) because
       mj-page-search is a toolbar widget, not a form field. */
    .mj-page-search {
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      width: 100%;
      padding: var(--mj-space-1) var(--mj-space-3);
      font-family: var(--mj-font-family);
      font-size: var(--mj-text-sm);
      line-height: 1.5;
      color: var(--mj-text-primary);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-sm);
      transition: var(--mj-transition-colors), box-shadow var(--mj-transition-base);
      min-height: 32px;
      box-sizing: border-box;
    }

    .mj-page-search:hover {
      border-color: var(--mj-border-strong);
    }

    .mj-page-search--focused {
      border-color: var(--mj-brand-primary);
      box-shadow: var(--mj-focus-ring);
    }

    .mj-page-search i {
      color: var(--mj-text-muted);
      font-size: 13px;
      flex-shrink: 0;
    }

    .mj-page-search input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font: inherit;
      color: var(--mj-text-primary);
      min-width: 0;
    }

    .mj-page-search input::placeholder {
      color: var(--mj-text-disabled);
    }
  `]
})
export class MJPageSearchComponent extends MJNamedControlBase implements AfterViewInit {
  /** The placeholder a caller gets by having said nothing — it names no particular search. */
  static readonly GenericPlaceholder = 'Search...';

  @Input() Placeholder: string = MJPageSearchComponent.GenericPlaceholder;
  @Input() Value: string = '';
  @Input() Icon: string = 'fa-solid fa-search';
  @Output() ValueChange = new EventEmitter<string>();

  @ViewChild('searchInput') private searchInputEl: ElementRef<HTMLInputElement> | undefined;

  public Focused: boolean = false;

  /** @deprecated Use {@link Focused}. */
  public get focused(): boolean {
    return this.Focused;
  }
  /** @deprecated Use {@link Focused}. */
  public set focused(value: boolean) {
    this.Focused = value;
  }

  /**
   * `PlaceholderIsName` is passed here and nowhere else: this is a toolbar widget whose placeholder
   * ("Search templates…") IS the caller's statement of what the box searches. On a form control a
   * placeholder is not a name — it disappears as soon as the user types — so those controls warn
   * without one.
   *
   * It is not passed unconditionally, or the guard could never fire here at all: the default
   * placeholder is non-empty, so accepting any placeholder would accept `'Search...'`, which tells a
   * screen-reader user nothing about what is being searched. Only a placeholder the caller actually
   * chose counts.
   */
  public ngAfterViewInit(): void {
    WarnIfUnnamed(this.searchInputEl?.nativeElement, 'mj-page-search', {
      PlaceholderIsName: this.Placeholder !== MJPageSearchComponent.GenericPlaceholder
    });
  }

  public OnInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.Value = v;
    this.ValueChange.emit(v);
  }

  /** @deprecated Use {@link OnInput}. */
  public onInput(event: Event): void {
    return this.OnInput(event);
  }
}
