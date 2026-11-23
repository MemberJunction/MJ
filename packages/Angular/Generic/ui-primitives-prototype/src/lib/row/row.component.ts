import {
  Component,
  Directive,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  afterNextRender,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  DispatchMJElementEvent,
  MJAfterEvent,
  MJBeforeEvent,
  SanitizeAxisSlug,
} from '../types/events';

export type MJRowItemRole = 'button' | 'option' | 'menuitem' | 'menuitemradio';

type BooleanInputValue = boolean | string | null | undefined;

const VALID_ITEM_ROLES = new Set<MJRowItemRole>([
  'button',
  'option',
  'menuitem',
  'menuitemradio',
]);

const CONTAINER_SYNC_CALLBACKS = new WeakMap<HTMLElement, Set<() => void>>();
const PENDING_SYNC_CONTAINERS = new WeakSet<HTMLElement>();

function scheduleContainerRovingSync(container: HTMLElement): void {
  if (PENDING_SYNC_CONTAINERS.has(container)) {
    return;
  }
  PENDING_SYNC_CONTAINERS.add(container);
  queueMicrotask(() => {
    PENDING_SYNC_CONTAINERS.delete(container);
    const callbacks = CONTAINER_SYNC_CALLBACKS.get(container);
    if (!callbacks) {
      return;
    }
    for (const cb of callbacks) {
      cb();
    }
  });
}

function optionalBooleanAttribute(value: BooleanInputValue): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  return booleanAttribute(value);
}

@Directive({
  selector: '[mjRowLeading]',
  standalone: true,
  host: { class: 'mj-row-leading' },
})
export class MJRowLeadingDirective {}

@Directive({
  selector: '[mjRowContent]',
  standalone: true,
  host: { class: 'mj-row-content' },
})
export class MJRowContentDirective {}

@Directive({
  selector: '[mjRowTrailing]',
  standalone: true,
  host: { class: 'mj-row-trailing' },
})
export class MJRowTrailingDirective {}

/**
 * Wave 0 horizontal row primitive.
 * - Non-interactive (`Interactive = false`, default): pure layout container for rows holding sibling controls.
 * - Interactive (`Interactive = true`): defaults `ItemRole` to `'button'` so standalone rows are valid ARIA
 *   without a listbox parent. When `ItemRole === 'option'` inside `[role="listbox"]`, uses roving `tabindex`
 *   (one Tab stop per listbox) and ArrowDown/ArrowUp/Home/End navigation.
 * - State styling uses `.is-selected` and `.is-hover` compounded with `.mj-row` (never `data-*`).
 */
@Component({
  selector: 'mj-row',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    class: 'mj-row',
    '[class.mj-row-interactive]': 'Interactive()',
    '[class.mj-row-disabled]': 'Disabled()',
    '[class.is-selected]': 'isHighlighted()',
    '[style.--_mj-row-explicit-min-height]': 'densityMinHeightVar()',
    '[style.--_mj-row-explicit-padding-block]': 'densityPaddingBlockVar()',
    '[style.--_mj-row-explicit-padding-inline]': 'densityPaddingInlineVar()',
    '[style.--_mj-tone-text]': 'toneTextVar()',
    '[style.--_mj-tone-border]': 'toneBorderVar()',
    '[style.--_mj-tone-bg]': 'toneBgVar()',
    '[style.--_mj-visual-role-bg]': 'visualRoleBgVar()',
    '[style.--_mj-visual-role-border]': 'visualRoleBorderVar()',
    '[style.--_mj-visual-role-radius]': 'visualRoleRadiusVar()',
    '[style.--_mj-visual-role-padding-block]': 'visualRolePaddingBlockVar()',
    '[style.--_mj-visual-role-padding-inline]': 'visualRolePaddingInlineVar()',
    '[attr.role]': 'ariaRole()',
    '[attr.tabindex]': 'rovingTabIndex()',
    '[attr.aria-selected]': 'ariaSelected()',
    '[attr.aria-checked]': 'ariaChecked()',
    '[attr.aria-pressed]': 'ariaPressed()',
    '[attr.aria-disabled]': 'Interactive() && Disabled() ? true : null',
    '(click)': 'onActivate($event)',
    '(keydown)': 'onKeyDown($event)',
    '(keyup)': 'onKeyUp($event)',
  },
})
export class MJRowComponent implements OnDestroy {
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fallbackTabStop = signal(false);
  private registeredContainer: HTMLElement | null = null;
  private readonly syncSelfCallback = (): void => this.recomputeFallbackTabStop();

  public readonly Density = input<string>('md');
  public readonly Interactive = input(false, { transform: booleanAttribute });
  public readonly Selected = input(false, { transform: booleanAttribute });
  public readonly Pressed = input<boolean | null, BooleanInputValue>(null, {
    transform: optionalBooleanAttribute,
  });
  public readonly Disabled = input(false, { transform: booleanAttribute });
  public readonly Tone = input<string>('neutral');
  public readonly VisualRole = input<string>('row');
  public readonly ItemRole = input<MJRowItemRole | string>('button');

  public readonly BeforeSelect = output<MJBeforeEvent<'user'>>();
  public readonly AfterSelect = output<MJAfterEvent<'user'>>();

  protected readonly safeDensity = computed(() => SanitizeAxisSlug(this.Density(), 'md'));
  protected readonly safeTone = computed(() => SanitizeAxisSlug(this.Tone(), 'neutral'));
  protected readonly safeRole = computed(() => SanitizeAxisSlug(this.VisualRole(), 'row'));
  protected readonly safeItemRole = computed<MJRowItemRole>(() => {
    const candidate = (this.ItemRole() ?? '').trim() as MJRowItemRole;
    return VALID_ITEM_ROLES.has(candidate) ? candidate : 'button';
  });
  protected readonly isHighlighted = computed(
    () => this.Selected() || this.Pressed() === true
  );

  protected readonly densityMinHeightVar = computed(() => {
    const density = this.safeDensity();
    if (density === 'md') {
      return null;
    }
    return `var(--mj-control-height-${density})`;
  });

  protected readonly densityPaddingBlockVar = computed(() => {
    const density = this.safeDensity();
    if (density === 'sm') {
      return 'var(--mj-space-1-5)';
    }
    if (density === 'lg') {
      return 'var(--mj-space-3)';
    }
    return null;
  });

  protected readonly densityPaddingInlineVar = computed(() => {
    const density = this.safeDensity();
    if (density === 'sm') {
      return 'var(--mj-space-2-5)';
    }
    if (density === 'lg') {
      return 'var(--mj-space-4)';
    }
    return null;
  });

  protected readonly ariaRole = computed(() =>
    this.Interactive() ? this.safeItemRole() : null
  );

  protected readonly rovingTabIndex = computed(() => {
    if (!this.Interactive() || this.Disabled()) {
      return null;
    }
    const role = this.safeItemRole();
    if (role === 'option' || role === 'menuitemradio' || role === 'menuitem') {
      return this.Selected() || this.fallbackTabStop() ? 0 : -1;
    }
    return 0;
  });

  protected readonly ariaSelected = computed(() =>
    this.Interactive() && this.safeItemRole() === 'option' ? String(this.Selected()) : null
  );

  protected readonly ariaChecked = computed(() =>
    this.Interactive() && this.safeItemRole() === 'menuitemradio'
      ? String(this.Selected())
      : null
  );

  protected readonly ariaPressed = computed(() => {
    if (!this.Interactive() || this.safeItemRole() !== 'button') {
      return null;
    }
    const pressed = this.Pressed();
    return pressed === null ? null : String(pressed);
  });

  protected readonly toneTextVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-text, var(--mj-row-text, var(--mj-text-primary)))`
  );
  protected readonly toneBorderVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-border, var(--mj-row-border, transparent))`
  );
  protected readonly toneBgVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-bg, var(--mj-row-bg, transparent))`
  );

  protected readonly visualRoleBgVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-bg, var(--_mj-tone-bg, var(--mj-row-bg, transparent)))`
  );
  protected readonly visualRoleBorderVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-border, var(--_mj-tone-border, var(--mj-row-border, transparent)))`
  );
  protected readonly visualRoleRadiusVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-radius, var(--mj-row-radius, var(--mj-radius-control)))`
  );
  protected readonly visualRolePaddingBlockVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-padding-block, var(--_mj-row-explicit-padding-block, var(--mj-row-padding-block, var(--mj-space-2-5))))`
  );
  protected readonly visualRolePaddingInlineVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-padding-inline, var(--_mj-row-explicit-padding-inline, var(--mj-row-padding-inline, var(--mj-space-3))))`
  );

  constructor() {
    afterNextRender(() => {
      this.auditRowSemantics();
      this.registerAndSyncContainer();
    });

    effect(() => {
      // Track state signals so sibling roving tabindex stays valid when selection clears or items disable
      this.Interactive();
      this.Selected();
      this.Disabled();
      this.safeItemRole();

      if (this.registeredContainer) {
        scheduleContainerRovingSync(this.registeredContainer);
      } else {
        this.registerAndSyncContainer();
      }
    });
  }

  ngOnDestroy(): void {
    this.unregisterContainer();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.Interactive() || this.Disabled()) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onActivate(event);
      return;
    }
    if (event.key === ' ') {
      // Prevent page scrolling on Spacebar press; activation fires on keyup per native <button> behavior
      event.preventDefault();
      return;
    }
    const role = this.safeItemRole();
    if (role === 'option') {
      // Single-select listbox: selection follows focus. A multi-select listbox will need to skip this click.
      this.moveRovingFocus(event, '[role="listbox"]', '[role="option"]:not([aria-disabled="true"])')?.click();
    } else if (role === 'menuitem' || role === 'menuitemradio') {
      // Menus move focus only; Enter or Space activates.
      this.moveRovingFocus(
        event,
        '[role="menu"], [role="menubar"]',
        '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])'
      );
    }
  }

  /**
   * Moves focus to the next, previous, first or last item in the row's composite container
   * (listbox, menu, menubar) and returns the item it focused. A row that takes itself out of the
   * Tab order with a roving tabindex has to answer the arrow keys itself, inside a layer or not.
   * Menubars and `aria-orientation="horizontal"` containers use Left and Right instead of Up and Down.
   */
  private moveRovingFocus(
    event: KeyboardEvent,
    containerSelector: string,
    itemSelector: string
  ): HTMLElement | null {
    const container = this.hostEl.nativeElement.closest<HTMLElement>(containerSelector);
    if (!container) {
      return null;
    }
    const horizontal =
      container.getAttribute('role') === 'menubar' ||
      container.getAttribute('aria-orientation') === 'horizontal';
    const nextKey = horizontal ? 'ArrowRight' : 'ArrowDown';
    const previousKey = horizontal ? 'ArrowLeft' : 'ArrowUp';
    if (![nextKey, previousKey, 'Home', 'End'].includes(event.key)) {
      return null;
    }
    const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
    if (items.length === 0) {
      return null;
    }
    event.preventDefault();
    const currentIndex = items.indexOf(this.hostEl.nativeElement);
    let nextIndex = 0;
    if (event.key === nextKey) {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === previousKey) {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    } else if (event.key === 'End') {
      nextIndex = items.length - 1;
    }
    const target = items[nextIndex] ?? null;
    target?.focus();
    return target;
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (!this.Interactive() || this.Disabled()) {
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      this.onActivate(event);
    }
  }

  protected onActivate(event?: Event): void {
    if (!this.Interactive() || this.Disabled()) {
      return;
    }
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    const before: MJBeforeEvent<'user'> = { Cancel: false, Reason: 'user' };
    this.BeforeSelect.emit(before);
    DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-select', before);
    if (before.Cancel) {
      return;
    }

    const after: MJAfterEvent<'user'> = { Reason: 'user' };
    this.AfterSelect.emit(after);
    DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-select', after);
  }

  private auditRowSemantics(): void {
    if (!this.Interactive()) {
      return;
    }
    const el = this.hostEl.nativeElement;
    const nestedControl = el.querySelector('button, a[href], input, select, textarea');
    if (nestedControl) {
      console.error(
        '[mj-row] WCAG 4.1.2 violation: interactive mj-row must not contain nested interactive controls.'
      );
    }
    if (this.safeItemRole() === 'option' && !el.closest('[role="listbox"]')) {
      console.error(
        '[mj-row] WCAG 4.1.2 violation: ItemRole="option" requires an ancestor [role="listbox"].'
      );
    }
  }

  private registerAndSyncContainer(): void {
    const el = this.hostEl.nativeElement;
    if (!el.isConnected) {
      return;
    }
    const role = this.safeItemRole();
    const selector =
      role === 'option'
        ? '[role="listbox"]'
        : role === 'menuitem' || role === 'menuitemradio'
          ? '[role="menu"], [role="menubar"]'
          : null;
    const nextContainer =
      this.Interactive() && selector ? el.closest<HTMLElement>(selector) : null;

    if (nextContainer !== this.registeredContainer) {
      this.unregisterContainer();
      if (nextContainer) {
        let callbacks = CONTAINER_SYNC_CALLBACKS.get(nextContainer);
        if (!callbacks) {
          callbacks = new Set();
          CONTAINER_SYNC_CALLBACKS.set(nextContainer, callbacks);
        }
        callbacks.add(this.syncSelfCallback);
        this.registeredContainer = nextContainer;
      }
    }

    if (this.registeredContainer) {
      scheduleContainerRovingSync(this.registeredContainer);
    } else {
      this.fallbackTabStop.set(false);
    }
  }

  private unregisterContainer(): void {
    if (!this.registeredContainer) {
      return;
    }
    const prev = this.registeredContainer;
    this.registeredContainer = null;
    const callbacks = CONTAINER_SYNC_CALLBACKS.get(prev);
    callbacks?.delete(this.syncSelfCallback);
    scheduleContainerRovingSync(prev);
  }

  private recomputeFallbackTabStop(): void {
    if (!this.Interactive() || this.Disabled() || !this.registeredContainer) {
      this.fallbackTabStop.set(false);
      return;
    }
    const el = this.hostEl.nativeElement;
    const role = this.safeItemRole();
    if (role === 'option') {
      const hasSelected = Boolean(
        this.registeredContainer.querySelector(
          '[role="option"].is-selected, [role="option"][aria-selected="true"]'
        )
      );
      if (hasSelected) {
        this.fallbackTabStop.set(false);
        return;
      }
      const firstOption = this.registeredContainer.querySelector<HTMLElement>(
        '[role="option"]:not([aria-disabled="true"])'
      );
      this.fallbackTabStop.set(firstOption === el);
      return;
    }

    if (role === 'menuitem' || role === 'menuitemradio') {
      const hasSelected = Boolean(
        this.registeredContainer.querySelector('.mj-row.is-selected, [aria-checked="true"]')
      );
      if (hasSelected) {
        this.fallbackTabStop.set(false);
        return;
      }
      const firstItem = this.registeredContainer.querySelector<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])'
      );
      this.fallbackTabStop.set(firstItem === el);
      return;
    }

    this.fallbackTabStop.set(false);
  }
}
