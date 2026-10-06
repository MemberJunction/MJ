import { AfterViewInit, ChangeDetectionStrategy, Component, Directive, ElementRef, Input, inject } from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { WarnIfUnnamed } from '../a11y/unnamed-control-guard';

/**
 * `[mjMenuTriggerFor]`: opens an `mj-menu` from the element it sits on, usually a `mjButton`. Built on the CDK
 * menu: the trigger carries `aria-haspopup`, `aria-expanded` and `aria-controls`, a click or the arrow keys open the
 * menu, Escape and a click outside close it, and focus returns to the trigger.
 *
 * @example
 * ```html
 * <button mjButton Variant="icon" AriaLabel="Move to" [mjMenuTriggerFor]="moveMenu">
 *   <i class="fa-solid fa-ellipsis-vertical"></i>
 * </button>
 * <ng-template #moveMenu>
 *   <mj-menu AriaLabel="Move to">
 *     <mj-menu-item Icon="fa-solid fa-expand" (Triggered)="Move('stage')">Stage</mj-menu-item>
 *     <mj-menu-item Icon="fa-regular fa-window-restore" (Triggered)="Move('pip')">Picture-in-picture</mj-menu-item>
 *     <mj-menu-divider></mj-menu-divider>
 *     <mj-menu-item Icon="fa-solid fa-eye-slash" (Triggered)="Move('hidden')">Hide</mj-menu-item>
 *   </mj-menu>
 * </ng-template>
 * ```
 */
@Directive({
  selector: '[mjMenuTriggerFor]',
  standalone: true,
  hostDirectives: [
    {
      directive: CdkMenuTrigger,
      inputs: ['cdkMenuTriggerFor: mjMenuTriggerFor'],
      outputs: ['cdkMenuOpened: MenuOpened', 'cdkMenuClosed: MenuClosed'],
    },
  ],
})
export class MJMenuTriggerDirective {}

/**
 * `mj-menu`: a menu panel, placed in an `ng-template` that a `[mjMenuTriggerFor]` opens. The arrow keys, Home, End
 * and typing a label move between its items. Name it with `AriaLabel` (or `AriaLabelledBy`): a menu announces its
 * name when it opens, and an unnamed one warns in dev mode.
 */
@Component({
  selector: 'mj-menu',
  standalone: true,
  hostDirectives: [CdkMenu],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'mj-menu',
    '[attr.aria-label]': 'AriaLabel || null',
    '[attr.aria-labelledby]': 'AriaLabelledBy || null',
  },
  template: '<ng-content></ng-content>',
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        min-width: 180px;
        max-width: 320px;
        box-sizing: border-box;
        padding: 4px 0;
        background: var(--mj-bg-surface-elevated);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-sm);
        box-shadow: var(--mj-shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
        outline: none;
      }
    `,
  ],
})
export class MJMenuComponent implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The menu's name, when no visible label names it. */
  @Input() AriaLabel: string | null = null;

  /** The id of a visible element that names the menu. */
  @Input() AriaLabelledBy: string | null = null;

  public ngAfterViewInit(): void {
    WarnIfUnnamed(this.host.nativeElement, 'mj-menu');
  }
}

/**
 * `mj-menu-item`: one action in an `mj-menu`. `Triggered` fires on a click, Enter or Space, and then the menu
 * closes. A `Disabled` item stays focusable, so it is announced, but cannot be triggered.
 */
@Component({
  selector: 'mj-menu-item',
  standalone: true,
  hostDirectives: [
    {
      directive: CdkMenuItem,
      inputs: ['cdkMenuItemDisabled: Disabled'],
      outputs: ['cdkMenuItemTriggered: Triggered'],
    },
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mj-menu-item' },
  template: `
    @if (Icon) {
      <i class="mj-menu-item-icon" [class]="Icon" aria-hidden="true"></i>
    }
    <span class="mj-menu-item-label"><ng-content></ng-content></span>
  `,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 36px;
        padding: 8px 12px;
        box-sizing: border-box;
        font-size: var(--mj-text-sm);
        color: var(--mj-text-primary);
        cursor: pointer;
        user-select: none;
        outline: none;
        transition: background var(--mj-transition-fast);
      }
      :host(:hover),
      :host(:focus) {
        background: var(--mj-bg-surface-hover);
      }
      :host(:focus-visible) {
        box-shadow: inset 0 0 0 2px var(--mj-border-focus);
      }
      :host([aria-disabled='true']) {
        color: var(--mj-text-disabled);
        cursor: default;
      }
      :host([aria-disabled='true']:hover) {
        background: transparent;
      }
      .mj-menu-item-icon {
        width: 16px;
        flex-shrink: 0;
        text-align: center;
        color: var(--mj-text-secondary);
      }
      :host([aria-disabled='true']) .mj-menu-item-icon {
        color: var(--mj-text-disabled);
      }
      .mj-menu-item-label {
        flex: 1;
        min-width: 0;
      }
    `,
  ],
})
export class MJMenuItemComponent {
  /** A Font Awesome class list for the icon before the label, e.g. `fa-solid fa-expand`. */
  @Input() Icon: string | null = null;
}

/** `mj-menu-divider`: a line between groups of items in an `mj-menu`. */
@Component({
  selector: 'mj-menu-divider',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'separator', class: 'mj-menu-divider' },
  template: '',
  styles: [
    `
      :host {
        display: block;
        height: 1px;
        margin: 4px 0;
        background: var(--mj-border-default);
      }
    `,
  ],
})
export class MJMenuDividerComponent {}
