import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import {
  ComputeRootMenuPlacement,
  ComputeSubmenuPlacement,
  IsMovingTowardSubmenu,
  NormalizeContextMenuItems,
} from './context-menu-position.util';
import {
  ContextMenuActionItem,
  ContextMenuAnchorRect,
  ContextMenuCommandBase,
  ContextMenuItem,
  ContextMenuItemRole,
  ContextMenuPanelDimensions,
  ContextMenuPoint,
  ContextMenuSubmenuItem,
  ContextMenuSwatchOption,
  ContextMenuSwatchRowItem,
  ContextMenuViewportSize,
} from './context-menu.types';

interface MenuLevelState<TCommand extends ContextMenuCommandBase> {
  Level: number;
  ParentSubmenuID: string | null;
  ParentItemIndex: number;
  AriaLabel: string;
  Items: ReadonlyArray<ContextMenuItem<TCommand>>;
  Left: number;
  Top: number;
  MaxHeight: number;
  FlippedHorizontally: boolean;
  IsPositioned: boolean;
  FocusedIndex: number;
  FocusedSwatchIndex: number;
}

const HOVER_OPEN_DELAY_MS = 140;
const SAFE_TRIANGLE_DEFER_MS = 180;
const TYPEAHEAD_RESET_MS = 500;
const DEFAULT_MENU_WIDTH_PX = 220;
const DEFAULT_ROW_HEIGHT_PX = 34;

/**
 * Reusable WAI-ARIA-compliant floating context menu with viewport collision
 * flipping, cascading submenus, safe-triangle hover intent, printable
 * typeahead, selection-preserving pointer handling, and capture-phase Escape
 * precedence.
 */
@Component({
  selector: 'mj-context-menu',
  standalone: false,
  templateUrl: './mj-context-menu.component.html',
  styleUrls: ['./mj-context-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MjContextMenuComponent<
  TCommand extends ContextMenuCommandBase = ContextMenuCommandBase,
> {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  private isOpen = false;
  private anchorX = 0;
  private anchorY = 0;
  private normalizedItems: ContextMenuItem<TCommand>[] = [];
  private ariaLabel = 'Context menu';
  private restoreFocusElement: HTMLElement | null = null;
  private destroyed = false;

  private listenersAttached = false;
  private positionRafIds: number[] = [];
  private positionTimerIds: Array<ReturnType<typeof setTimeout>> = [];
  private hoverOpenTimer: ReturnType<typeof setTimeout> | null = null;
  private hoverSwitchTimer: ReturnType<typeof setTimeout> | null = null;
  private typeaheadTimer: ReturnType<typeof setTimeout> | null = null;
  private typeaheadBuffer = '';
  private lastPointerPos: ContextMenuPoint | null = null;
  private prevPointerPos: ContextMenuPoint | null = null;

  public MenuLevels: MenuLevelState<TCommand>[] = [];

  private readonly boundKeyDownCapture = (event: KeyboardEvent): void => {
    this.onDocumentKeyDownCapture(event);
  };

  private readonly boundPointerDownCapture = (event: PointerEvent): void => {
    this.onDocumentPointerDownCapture(event);
  };

  private readonly boundScrollCapture = (event: Event): void => {
    this.onDocumentScrollCapture(event);
  };

  private readonly boundWindowDismiss = (): void => {
    this.onWindowDismiss();
  };

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.teardown();
    });
  }

  @Input()
  public set IsOpen(value: boolean) {
    const next = Boolean(value);
    if (next === this.isOpen) {
      return;
    }
    this.isOpen = next;
    if (next) {
      this.openRootMenu();
    } else {
      this.teardown();
      this.MenuLevels = [];
    }
  }
  public get IsOpen(): boolean {
    return this.isOpen;
  }

  @Input()
  public set AnchorX(value: number) {
    const next = Number.isFinite(value) ? value : 0;
    if (next === this.anchorX) {
      return;
    }
    this.anchorX = next;
    if (this.isOpen && this.MenuLevels.length > 0) {
      this.reanchorRootMenu();
    }
  }
  public get AnchorX(): number {
    return this.anchorX;
  }

  @Input()
  public set AnchorY(value: number) {
    const next = Number.isFinite(value) ? value : 0;
    if (next === this.anchorY) {
      return;
    }
    this.anchorY = next;
    if (this.isOpen && this.MenuLevels.length > 0) {
      this.reanchorRootMenu();
    }
  }
  public get AnchorY(): number {
    return this.anchorY;
  }

  @Input()
  public set Items(value: ReadonlyArray<ContextMenuItem<TCommand>> | null | undefined) {
    this.normalizedItems = NormalizeContextMenuItems(value ?? []);
    if (this.isOpen) {
      this.openRootMenu();
    }
  }
  public get Items(): ReadonlyArray<ContextMenuItem<TCommand>> {
    return this.normalizedItems;
  }

  @Input()
  public set AriaLabel(value: string | null | undefined) {
    this.ariaLabel = value?.trim() || 'Context menu';
    if (this.MenuLevels.length > 0) {
      this.MenuLevels[0].AriaLabel = this.ariaLabel;
    }
  }
  public get AriaLabel(): string {
    return this.ariaLabel;
  }

  @Input()
  public set RestoreFocusElement(value: HTMLElement | null | undefined) {
    this.restoreFocusElement = value ?? null;
  }
  public get RestoreFocusElement(): HTMLElement | null {
    return this.restoreFocusElement;
  }

  @Output() public readonly ItemSelected = new EventEmitter<TCommand>();
  @Output() public readonly Closed = new EventEmitter<void>();

  public TrackItem(index: number, item: ContextMenuItem<TCommand>): string {
    return item.ID ? `${item.Kind}:${item.ID}` : `${item.Kind}:${index}`;
  }

  public GetItemRole(item: ContextMenuActionItem<TCommand>): ContextMenuItemRole {
    return item.Role ?? 'menuitem';
  }

  public GetAriaChecked(item: ContextMenuActionItem<TCommand>): string | null {
    if (item.Role === 'menuitemcheckbox' || item.Role === 'menuitemradio') {
      return item.Checked ? 'true' : 'false';
    }
    return null;
  }

  public HasCheckOrRadioColumn(level: MenuLevelState<TCommand>): boolean {
    return level.Items.some(
      (item) =>
        item.Kind === 'action' &&
        (item.Role === 'menuitemcheckbox' || item.Role === 'menuitemradio'),
    );
  }

  public IsSubmenuOpenAtLevel(levelIndex: number, submenuID: string): boolean {
    const child = this.MenuLevels[levelIndex + 1];
    return child !== undefined && child.ParentSubmenuID === submenuID;
  }

  public IsItemFocused(levelIndex: number, itemIndex: number): boolean {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return false;
    }
    return level.FocusedIndex === itemIndex && levelIndex === this.MenuLevels.length - 1;
  }

  public IsSwatchFocused(levelIndex: number, itemIndex: number, swatchIndex: number): boolean {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return false;
    }
    return (
      level.FocusedIndex === itemIndex &&
      level.FocusedSwatchIndex === swatchIndex &&
      levelIndex === this.MenuLevels.length - 1
    );
  }

  public GetItemTabIndex(level: MenuLevelState<TCommand>, itemIndex: number): number {
    if (level.FocusedIndex === itemIndex) {
      return 0;
    }
    if (level.FocusedIndex === -1 && itemIndex === this.findFirstFocusableIndex(level.Items)) {
      return 0;
    }
    return -1;
  }

  public GetSwatchTabIndex(
    level: MenuLevelState<TCommand>,
    itemIndex: number,
    swatchIndex: number,
  ): number {
    if (level.FocusedIndex === itemIndex && level.FocusedSwatchIndex === swatchIndex) {
      return 0;
    }
    if (
      level.FocusedIndex === -1 &&
      swatchIndex === 0 &&
      itemIndex === this.findFirstFocusableIndex(level.Items)
    ) {
      return 0;
    }
    return -1;
  }

  public OnPanelMouseDown(event: MouseEvent): void {
    // Prevent blurring adjacent contenteditable selections or editors
    event.preventDefault();
  }

  public OnItemMouseDown(event: MouseEvent): void {
    // Prevent blurring adjacent contenteditable selections or editors
    event.preventDefault();
  }

  public OnPanelMouseMove(event: MouseEvent): void {
    this.prevPointerPos = this.lastPointerPos;
    this.lastPointerPos = { X: event.clientX, Y: event.clientY };
  }

  public OnItemMouseEnter(
    levelIndex: number,
    itemIndex: number,
    item: ContextMenuItem<TCommand>,
  ): void {
    this.clearHoverTimers();
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return;
    }

    const childLevel = this.MenuLevels[levelIndex + 1];
    const isMovingWithinSafeCorridor =
      childLevel !== undefined &&
      (item.Kind !== 'submenu' || childLevel.ParentSubmenuID !== item.ID) &&
      this.isCursorInsideSafeTriangle(levelIndex + 1);

    if (isMovingWithinSafeCorridor) {
      this.hoverSwitchTimer = setTimeout(() => {
        this.applyHoveredItem(levelIndex, itemIndex, item);
      }, SAFE_TRIANGLE_DEFER_MS);
      return;
    }

    this.applyHoveredItem(levelIndex, itemIndex, item);
  }

  public OnActionClick(item: ContextMenuActionItem<TCommand>, event: MouseEvent): void {
    event.stopPropagation();
    if (item.Disabled) {
      return;
    }
    this.activateCommand(item.Command);
  }

  public OnSubmenuClick(
    levelIndex: number,
    itemIndex: number,
    item: ContextMenuSubmenuItem<TCommand>,
    event: MouseEvent,
  ): void {
    event.stopPropagation();
    if (item.Disabled) {
      return;
    }
    this.clearHoverTimers();
    this.openSubmenu(levelIndex, itemIndex, item, false);
  }

  public OnSwatchClick(
    row: ContextMenuSwatchRowItem<TCommand>,
    swatch: ContextMenuSwatchOption<TCommand>,
    event: MouseEvent,
  ): void {
    event.stopPropagation();
    if (row.Disabled) {
      return;
    }
    this.activateCommand(swatch.Command);
  }

  private applyHoveredItem(
    levelIndex: number,
    itemIndex: number,
    item: ContextMenuItem<TCommand>,
  ): void {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return;
    }

    level.FocusedIndex = itemIndex;
    level.FocusedSwatchIndex = item.Kind === 'swatch-row' ? 0 : 0;

    if (item.Kind === 'submenu' && !item.Disabled) {
      const existingChild = this.MenuLevels[levelIndex + 1];
      if (existingChild && existingChild.ParentSubmenuID === item.ID) {
        this.cdr.markForCheck();
        return;
      }
      this.hoverOpenTimer = setTimeout(() => {
        if (!this.destroyed && this.isOpen) {
          this.openSubmenu(levelIndex, itemIndex, item, false);
        }
      }, HOVER_OPEN_DELAY_MS);
    } else if (this.MenuLevels.length > levelIndex + 1) {
      this.MenuLevels = this.MenuLevels.slice(0, levelIndex + 1);
    }

    this.cdr.markForCheck();
  }

  private openRootMenu(): void {
    this.clearHoverTimers();
    this.clearPositionRafs();
    this.typeaheadBuffer = '';
    this.lastPointerPos = null;
    this.prevPointerPos = null;

    const viewport = this.getViewportSize();
    const maxHeight = Math.max(160, viewport.Height - 16);

    this.MenuLevels = [
      {
        Level: 0,
        ParentSubmenuID: null,
        ParentItemIndex: -1,
        AriaLabel: this.ariaLabel,
        Items: this.normalizedItems,
        Left: this.anchorX,
        Top: this.anchorY,
        MaxHeight: maxHeight,
        FlippedHorizontally: false,
        IsPositioned: false,
        FocusedIndex: -1,
        FocusedSwatchIndex: 0,
      },
    ];

    this.attachGlobalListeners();
    this.schedulePositionLevel(0, true);
  }

  private reanchorRootMenu(): void {
    if (this.MenuLevels.length === 0) {
      return;
    }
    this.clearHoverTimers();
    this.clearPositionRafs();
    const root = this.MenuLevels[0];
    root.Left = this.anchorX;
    root.Top = this.anchorY;
    root.IsPositioned = false;
    this.MenuLevels = [root];
    this.schedulePositionLevel(0, false);
  }

  private openSubmenu(
    parentLevelIndex: number,
    parentItemIndex: number,
    submenuItem: ContextMenuSubmenuItem<TCommand>,
    focusFirstItem: boolean,
  ): void {
    const parentLevel = this.MenuLevels[parentLevelIndex];
    if (!parentLevel) {
      return;
    }
    const normalizedChildren = NormalizeContextMenuItems(submenuItem.Children);
    const viewport = this.getViewportSize();
    const maxHeight = Math.max(160, viewport.Height - 16);
    const nextLevelIndex = parentLevelIndex + 1;
    const initialFocusedIndex = focusFirstItem
      ? this.findFirstFocusableIndex(normalizedChildren)
      : -1;

    const childState: MenuLevelState<TCommand> = {
      Level: nextLevelIndex,
      ParentSubmenuID: submenuItem.ID,
      ParentItemIndex: parentItemIndex,
      AriaLabel: submenuItem.Label,
      Items: normalizedChildren,
      Left: parentLevel.Left + DEFAULT_MENU_WIDTH_PX - 4,
      Top: parentLevel.Top,
      MaxHeight: maxHeight,
      FlippedHorizontally: parentLevel.FlippedHorizontally,
      IsPositioned: false,
      FocusedIndex: initialFocusedIndex,
      FocusedSwatchIndex: 0,
    };

    this.MenuLevels = [...this.MenuLevels.slice(0, nextLevelIndex), childState];
    this.cdr.detectChanges();
    if (focusFirstItem && initialFocusedIndex >= 0) {
      this.focusDomElement(nextLevelIndex, initialFocusedIndex, 0);
    }
    this.schedulePositionLevel(nextLevelIndex, false, focusFirstItem);
  }

  private schedulePositionLevel(
    levelIndex: number,
    focusRootPanelOnOpen: boolean,
    focusFirstChildOnOpen = false,
  ): void {
    const runPosition = (): void => {
      if (this.destroyed || !this.isOpen) {
        return;
      }
      const level = this.MenuLevels[levelIndex];
      if (!level) {
        return;
      }

      const panelEl = this.queryPanelElement(levelIndex);
      const viewport = this.getViewportSize();
      const panelDimensions = this.measurePanelDimensions(panelEl, level.Items.length, viewport);

      if (levelIndex === 0) {
        const placement = ComputeRootMenuPlacement(
          this.anchorX,
          this.anchorY,
          panelDimensions,
          viewport,
        );
        level.Left = placement.Left;
        level.Top = placement.Top;
        level.MaxHeight = placement.MaxHeight;
        level.FlippedHorizontally = placement.FlippedHorizontally;
        level.IsPositioned = true;
      } else {
        const parentLevel = this.MenuLevels[levelIndex - 1];
        const parentBtn = this.queryItemElement(levelIndex - 1, level.ParentItemIndex);
        const parentRect = this.measureAnchorRect(parentBtn, parentLevel);
        const placement = ComputeSubmenuPlacement(
          parentRect,
          panelDimensions,
          viewport,
          parentLevel?.FlippedHorizontally ?? false,
        );
        level.Left = placement.Left;
        level.Top = placement.Top;
        level.MaxHeight = placement.MaxHeight;
        level.FlippedHorizontally = placement.FlippedHorizontally;
        level.IsPositioned = true;
      }

      this.cdr.detectChanges();

      if (focusFirstChildOnOpen && level.FocusedIndex >= 0) {
        this.focusDomElement(levelIndex, level.FocusedIndex, level.FocusedSwatchIndex);
      } else if (focusRootPanelOnOpen && level.FocusedIndex === -1 && panelEl) {
        panelEl.focus({ preventScroll: true });
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      const id = requestAnimationFrame(() => runPosition());
      this.positionRafIds.push(id);
    } else {
      const timerId = setTimeout(() => runPosition(), 0);
      this.positionTimerIds.push(timerId);
    }
  }

  private onDocumentKeyDownCapture(event: KeyboardEvent): void {
    if (!this.isOpen || this.MenuLevels.length === 0) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (this.MenuLevels.length > 1) {
        this.closeDeepestSubmenuAndRestoreFocus();
      } else {
        this.closeMenuAndRestoreFocus();
      }
      return;
    }

    if (event.key === 'Tab') {
      this.closeMenuWithoutFocusRestore();
      return;
    }

    const activeLevelIndex = this.MenuLevels.length - 1;
    const activeLevel = this.MenuLevels[activeLevelIndex];
    if (!activeLevel) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.moveFocusByDelta(activeLevelIndex, 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.moveFocusByDelta(activeLevelIndex, -1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      const firstIdx = this.findFirstFocusableIndex(activeLevel.Items);
      if (firstIdx >= 0) {
        this.setLevelFocus(activeLevelIndex, firstIdx, 0);
      }
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      const lastIdx = this.findLastFocusableIndex(activeLevel.Items);
      if (lastIdx >= 0) {
        this.setLevelFocus(activeLevelIndex, lastIdx, 0);
      }
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopPropagation();
      this.handleArrowRight(activeLevelIndex);
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopPropagation();
      this.handleArrowLeft(activeLevelIndex);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this.handleActivateFocusedItem(activeLevelIndex);
      return;
    }

    // Printable character typeahead (excluding Space)
    if (
      event.key.length === 1 &&
      event.key !== ' ' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.handleTypeahead(activeLevelIndex, event.key);
    }
  }

  private onDocumentPointerDownCapture(event: PointerEvent): void {
    if (!this.isOpen) {
      return;
    }
    const target = event.target;
    if (target instanceof Node && this.hostElement.nativeElement.contains(target)) {
      return;
    }
    this.closeMenuWithoutFocusRestore();
  }

  private onDocumentScrollCapture(event: Event): void {
    if (!this.isOpen) {
      return;
    }
    const target = event.target;
    if (
      typeof Element !== 'undefined' &&
      target instanceof Element &&
      target.closest('.mj-context-menu-panel') !== null
    ) {
      return;
    }
    this.closeMenuWithoutFocusRestore();
  }

  private onWindowDismiss(): void {
    if (!this.isOpen) {
      return;
    }
    this.closeMenuWithoutFocusRestore();
  }

  private moveFocusByDelta(levelIndex: number, delta: 1 | -1): void {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return;
    }
    const focusableIndices = this.getFocusableIndices(level.Items);
    if (focusableIndices.length === 0) {
      return;
    }

    let nextItemIndex: number;
    if (level.FocusedIndex === -1) {
      nextItemIndex = delta === 1 ? focusableIndices[0] : focusableIndices[focusableIndices.length - 1];
    } else {
      const currentPos = focusableIndices.indexOf(level.FocusedIndex);
      if (currentPos === -1) {
        nextItemIndex = focusableIndices[0];
      } else {
        const nextPos = (currentPos + delta + focusableIndices.length) % focusableIndices.length;
        nextItemIndex = focusableIndices[nextPos];
      }
    }

    this.setLevelFocus(levelIndex, nextItemIndex, 0);
  }

  private handleArrowRight(levelIndex: number): void {
    const level = this.MenuLevels[levelIndex];
    if (!level || level.FocusedIndex < 0) {
      return;
    }
    const item = level.Items[level.FocusedIndex];
    if (!item) {
      return;
    }

    if (item.Kind === 'swatch-row' && item.Swatches.length > 0) {
      const nextSwatch = Math.min(item.Swatches.length - 1, level.FocusedSwatchIndex + 1);
      this.setLevelFocus(levelIndex, level.FocusedIndex, nextSwatch);
      return;
    }

    if (item.Kind === 'submenu' && !item.Disabled) {
      this.openSubmenu(levelIndex, level.FocusedIndex, item, true);
    }
  }

  private handleArrowLeft(levelIndex: number): void {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return;
    }

    if (level.FocusedIndex >= 0) {
      const item = level.Items[level.FocusedIndex];
      if (item?.Kind === 'swatch-row' && level.FocusedSwatchIndex > 0) {
        this.setLevelFocus(levelIndex, level.FocusedIndex, level.FocusedSwatchIndex - 1);
        return;
      }
    }

    if (levelIndex > 0) {
      this.closeDeepestSubmenuAndRestoreFocus();
    }
  }

  private handleActivateFocusedItem(levelIndex: number): void {
    const level = this.MenuLevels[levelIndex];
    if (!level || level.FocusedIndex < 0) {
      return;
    }
    const item = level.Items[level.FocusedIndex];
    if (!item) {
      return;
    }

    if (item.Kind === 'action') {
      if (item.Disabled) {
        return;
      }
      this.activateCommand(item.Command);
      return;
    }

    if (item.Kind === 'submenu') {
      if (item.Disabled) {
        return;
      }
      this.openSubmenu(levelIndex, level.FocusedIndex, item, true);
      return;
    }

    if (item.Kind === 'swatch-row') {
      if (item.Disabled) {
        return;
      }
      const swatch = item.Swatches[level.FocusedSwatchIndex];
      if (swatch) {
        this.activateCommand(swatch.Command);
      }
    }
  }

  private handleTypeahead(levelIndex: number, char: string): void {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return;
    }

    if (this.typeaheadTimer !== null) {
      clearTimeout(this.typeaheadTimer);
      this.typeaheadTimer = null;
    }

    const lowerChar = char.toLowerCase();
    this.typeaheadBuffer += lowerChar;
    this.typeaheadTimer = setTimeout(() => {
      this.typeaheadBuffer = '';
      this.typeaheadTimer = null;
    }, TYPEAHEAD_RESET_MS);

    const focusableIndices = this.getFocusableIndices(level.Items);
    if (focusableIndices.length === 0) {
      return;
    }

    const startOffset =
      level.FocusedIndex >= 0
        ? Math.max(0, focusableIndices.indexOf(level.FocusedIndex) + 1)
        : 0;

    let match = this.findTypeaheadMatch(
      level.Items,
      focusableIndices,
      startOffset,
      this.typeaheadBuffer,
    );

    if (match === -1 && this.typeaheadBuffer.length > 1) {
      this.typeaheadBuffer = lowerChar;
      match = this.findTypeaheadMatch(
        level.Items,
        focusableIndices,
        startOffset,
        this.typeaheadBuffer,
      );
    }

    if (match >= 0) {
      this.setLevelFocus(levelIndex, match, 0);
    }
  }

  private findTypeaheadMatch(
    items: ReadonlyArray<ContextMenuItem<TCommand>>,
    focusableIndices: ReadonlyArray<number>,
    startOffset: number,
    prefix: string,
  ): number {
    const count = focusableIndices.length;
    for (let i = 0; i < count; i++) {
      const idx = focusableIndices[(startOffset + i) % count];
      const item = items[idx];
      if (
        (item.Kind === 'action' || item.Kind === 'submenu' || item.Kind === 'swatch-row') &&
        item.Label.trim().toLowerCase().startsWith(prefix)
      ) {
        return idx;
      }
    }
    return -1;
  }

  private setLevelFocus(levelIndex: number, itemIndex: number, swatchIndex: number): void {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return;
    }
    level.FocusedIndex = itemIndex;
    level.FocusedSwatchIndex = swatchIndex;
    if (!this.destroyed) {
      this.cdr.detectChanges();
    }
    this.focusDomElement(levelIndex, itemIndex, swatchIndex);
  }

  private focusDomElement(levelIndex: number, itemIndex: number, swatchIndex: number): void {
    const level = this.MenuLevels[levelIndex];
    if (!level) {
      return;
    }
    const item = level.Items[itemIndex];
    if (!item) {
      return;
    }
    if (item.Kind === 'swatch-row') {
      const swatchEl = this.hostElement.nativeElement.querySelector<HTMLElement>(
        `[data-menu-level="${levelIndex}"][data-item-index="${itemIndex}"][data-swatch-index="${swatchIndex}"]`,
      );
      swatchEl?.focus({ preventScroll: true });
      return;
    }

    const itemEl = this.queryItemElement(levelIndex, itemIndex);
    itemEl?.focus({ preventScroll: true });
  }

  private getFocusableIndices(items: ReadonlyArray<ContextMenuItem<TCommand>>): number[] {
    const indices: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.Kind === 'action' || item.Kind === 'submenu') {
        indices.push(i);
      } else if (item.Kind === 'swatch-row' && item.Swatches.length > 0) {
        indices.push(i);
      }
    }
    return indices;
  }

  private findFirstFocusableIndex(items: ReadonlyArray<ContextMenuItem<TCommand>>): number {
    const indices = this.getFocusableIndices(items);
    return indices.length > 0 ? indices[0] : -1;
  }

  private findLastFocusableIndex(items: ReadonlyArray<ContextMenuItem<TCommand>>): number {
    const indices = this.getFocusableIndices(items);
    return indices.length > 0 ? indices[indices.length - 1] : -1;
  }

  private closeDeepestSubmenuAndRestoreFocus(): void {
    if (this.MenuLevels.length <= 1) {
      return;
    }
    this.clearHoverTimers();
    const removed = this.MenuLevels[this.MenuLevels.length - 1];
    this.MenuLevels = this.MenuLevels.slice(0, -1);
    const parentLevelIndex = this.MenuLevels.length - 1;
    const parentLevel = this.MenuLevels[parentLevelIndex];

    if (parentLevel && removed.ParentItemIndex >= 0) {
      parentLevel.FocusedIndex = removed.ParentItemIndex;
      parentLevel.FocusedSwatchIndex = 0;
    }

    if (!this.destroyed) {
      this.cdr.detectChanges();
    }

    if (parentLevel && removed.ParentItemIndex >= 0) {
      this.focusDomElement(parentLevelIndex, removed.ParentItemIndex, 0);
    }
  }

  private closeMenuAndRestoreFocus(): void {
    const restoreEl = this.restoreFocusElement;
    this.closeMenuWithoutFocusRestore();
    restoreEl?.focus({ preventScroll: true });
  }

  private closeMenuWithoutFocusRestore(): void {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.teardown();
    this.MenuLevels = [];
    if (!this.destroyed) {
      this.cdr.detectChanges();
    }
    this.Closed.emit();
  }

  private activateCommand(command: TCommand): void {
    this.isOpen = false;
    this.teardown();
    this.MenuLevels = [];
    if (!this.destroyed) {
      this.cdr.detectChanges();
    }
    this.ItemSelected.emit(command);
    this.Closed.emit();
  }

  private isCursorInsideSafeTriangle(childLevelIndex: number): boolean {
    if (!this.lastPointerPos || !this.prevPointerPos) {
      return false;
    }
    const childPanel = this.queryPanelElement(childLevelIndex);
    if (!childPanel) {
      return false;
    }
    const rect = childPanel.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    const anchorRect: ContextMenuAnchorRect = {
      Top: rect.top,
      Left: rect.left,
      Right: rect.right,
      Bottom: rect.bottom,
      Width: rect.width,
      Height: rect.height,
    };
    return IsMovingTowardSubmenu(this.lastPointerPos, this.prevPointerPos, anchorRect);
  }

  private queryPanelElement(levelIndex: number): HTMLElement | null {
    return this.hostElement.nativeElement.querySelector<HTMLElement>(
      `.mj-context-menu-panel[data-menu-level="${levelIndex}"]`,
    );
  }

  private queryItemElement(levelIndex: number, itemIndex: number): HTMLElement | null {
    return this.hostElement.nativeElement.querySelector<HTMLElement>(
      `[data-menu-level="${levelIndex}"][data-item-index="${itemIndex}"]`,
    );
  }

  private measurePanelDimensions(
    panelEl: HTMLElement | null,
    itemCount: number,
    viewport: ContextMenuViewportSize,
  ): ContextMenuPanelDimensions {
    if (panelEl) {
      const rect = panelEl.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return {
          Width: rect.width || DEFAULT_MENU_WIDTH_PX,
          Height: rect.height || Math.min(itemCount * DEFAULT_ROW_HEIGHT_PX + 8, viewport.Height - 16),
        };
      }
      if (panelEl.offsetWidth > 0 || panelEl.offsetHeight > 0) {
        return {
          Width: panelEl.offsetWidth || DEFAULT_MENU_WIDTH_PX,
          Height: panelEl.offsetHeight || Math.min(itemCount * DEFAULT_ROW_HEIGHT_PX + 8, viewport.Height - 16),
        };
      }
    }
    return {
      Width: DEFAULT_MENU_WIDTH_PX,
      Height: Math.max(40, Math.min(itemCount * DEFAULT_ROW_HEIGHT_PX + 8, viewport.Height - 16)),
    };
  }

  private measureAnchorRect(
    el: HTMLElement | null,
    parentLevel: MenuLevelState<TCommand> | undefined,
  ): ContextMenuAnchorRect {
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) {
        return {
          Top: rect.top,
          Left: rect.left,
          Right: rect.right,
          Bottom: rect.bottom,
          Width: rect.width,
          Height: rect.height,
        };
      }
    }
    const fallbackLeft = parentLevel?.Left ?? this.anchorX;
    const fallbackTop = (parentLevel?.Top ?? this.anchorY) + 4;
    return {
      Top: fallbackTop,
      Left: fallbackLeft,
      Right: fallbackLeft + DEFAULT_MENU_WIDTH_PX,
      Bottom: fallbackTop + DEFAULT_ROW_HEIGHT_PX,
      Width: DEFAULT_MENU_WIDTH_PX,
      Height: DEFAULT_ROW_HEIGHT_PX,
    };
  }

  private getViewportSize(): ContextMenuViewportSize {
    const win = this.document.defaultView;
    return {
      Width: win?.innerWidth || 1280,
      Height: win?.innerHeight || 800,
    };
  }

  private attachGlobalListeners(): void {
    if (this.listenersAttached) {
      return;
    }
    this.listenersAttached = true;
    this.document.addEventListener('keydown', this.boundKeyDownCapture, { capture: true });
    this.document.addEventListener('pointerdown', this.boundPointerDownCapture, { capture: true });
    this.document.addEventListener('scroll', this.boundScrollCapture, { capture: true });
    const win = this.document.defaultView;
    win?.addEventListener('resize', this.boundWindowDismiss);
    win?.addEventListener('blur', this.boundWindowDismiss);
  }

  private detachGlobalListeners(): void {
    if (!this.listenersAttached) {
      return;
    }
    this.listenersAttached = false;
    this.document.removeEventListener('keydown', this.boundKeyDownCapture, { capture: true });
    this.document.removeEventListener('pointerdown', this.boundPointerDownCapture, {
      capture: true,
    });
    this.document.removeEventListener('scroll', this.boundScrollCapture, { capture: true });
    const win = this.document.defaultView;
    win?.removeEventListener('resize', this.boundWindowDismiss);
    win?.removeEventListener('blur', this.boundWindowDismiss);
  }

  private clearHoverTimers(): void {
    if (this.hoverOpenTimer !== null) {
      clearTimeout(this.hoverOpenTimer);
      this.hoverOpenTimer = null;
    }
    if (this.hoverSwitchTimer !== null) {
      clearTimeout(this.hoverSwitchTimer);
      this.hoverSwitchTimer = null;
    }
  }

  private clearPositionRafs(): void {
    if (typeof cancelAnimationFrame === 'function') {
      for (const id of this.positionRafIds) {
        cancelAnimationFrame(id);
      }
    }
    this.positionRafIds = [];
    for (const timerId of this.positionTimerIds) {
      clearTimeout(timerId);
    }
    this.positionTimerIds = [];
  }

  private teardown(): void {
    this.detachGlobalListeners();
    this.clearHoverTimers();
    this.clearPositionRafs();
    if (this.typeaheadTimer !== null) {
      clearTimeout(this.typeaheadTimer);
      this.typeaheadTimer = null;
    }
    this.typeaheadBuffer = '';
    this.lastPointerPos = null;
    this.prevPointerPos = null;
  }
}
