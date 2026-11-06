/**
 * @fileoverview Pure edits of a dashboard's saved Golden Layout tree (`ResolvedLayoutConfig`):
 * find a panel, insert, remove, move and resize panels, and describe the layout for an agent.
 * Every edit works on a copy and returns a new layout; the input is never changed.
 */
import { ResolvedLayoutConfig } from 'golden-layout';
import type { DashboardPanel } from './dashboard-types';

/** The placements beside another panel, and `tab` to join that panel's stack. */
export const PANEL_PLACEMENTS = ['left', 'right', 'above', 'below', 'tab'] as const;

/** Where a panel goes beside another panel, or `tab` to join that panel's stack. */
export type PanelPlacement = (typeof PANEL_PLACEMENTS)[number];

/** Where a panel goes, relative to another panel or at the end of the root. */
export type PanelPosition =
  | { relativeTo: string; placement: PanelPlacement } // case-violation-ok-legacy-back-compat: camelCase JSON keys that agent tools send
  | { placement: 'end' }; // case-violation-ok-legacy-back-compat: camelCase JSON keys that agent tools send

/** One step from the root to a panel: the container kind and the child index taken. */
export interface LayoutPathStep {
  kind: 'row' | 'column' | 'stack'; // case-violation-ok-legacy-back-compat: camelCase keys, like the other layout shapes in this file
  index: number; // case-violation-ok-legacy-back-compat: camelCase keys, like the other layout shapes in this file
}

/** A compact description of a layout for an agent. */
export interface SimplifiedLayoutNode {
  kind: 'row' | 'column' | 'stack' | 'panel'; // case-violation-ok-legacy-back-compat: camelCase JSON keys that agent tools read
  sizePct?: number; // case-violation-ok-legacy-back-compat: camelCase JSON keys that agent tools read
  panelId?: string; // case-violation-ok-legacy-back-compat: camelCase JSON keys that agent tools read
  title?: string; // case-violation-ok-legacy-back-compat: camelCase JSON keys that agent tools read
  children?: SimplifiedLayoutNode[]; // case-violation-ok-legacy-back-compat: camelCase JSON keys that agent tools read
}

/** A layout edit that cannot be applied: an unknown panel, an invalid position or axis. */
export class LayoutEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutEditError';
  }
}

/** The Golden Layout item shape this editor reads and writes: the JSON that Golden Layout saves. */
interface LayoutItem {
  type: 'row' | 'column' | 'stack' | 'component';
  content: LayoutItem[];
  size: number;
  sizeUnit: string;
  minSizeUnit?: string;
  id?: string;
  isClosable?: boolean;
  maximised?: boolean;
  activeItemIndex?: number;
  reorderEnabled?: boolean;
  title?: string;
  componentType?: string;
  componentState?: DashboardPanel;
}

/** A saved layout as this editor changes it: Golden Layout's saved layout with a root this editor can replace. */
type EditableLayout = Omit<ResolvedLayoutConfig, 'root'> & { root?: LayoutItem };

/** The stack that holds a panel, with the stack's parent container and its index there. The root stack has no parent. */
interface PanelLocation {
  stack: LayoutItem;
  parent: LayoutItem | null;
  indexInParent: number;
}

/** An item in a row or column, and the index of that item. */
interface ItemSlot {
  container: LayoutItem;
  index: number;
}

/** An item's size in its row or column. */
interface ItemSize {
  unit: '%' | 'fr';
  value: number;
}

/** A side placement: the new panel goes left, right, above or below the target. */
type SidePlacement = Exclude<PanelPlacement, 'tab'>;

const MIN_PCT = 5;
const MAX_PCT = 95;

/** The path from the root to the panel; the last step is the panel's tab in its stack. Null when the panel is not in the layout. */
export function FindPanelPath(layout: ResolvedLayoutConfig | null, panelId: string): LayoutPathStep[] | null {
  const root = rootOf(layout);
  return root ? findPath(root, panelId, []) : null;
}

/** A readable address for a path, for example `row/1 › column/0 › tab 2`. */
export function DescribePath(path: LayoutPathStep[]): string {
  return path.map(step => (step.kind === 'stack' ? `tab ${step.index}` : `${step.kind}/${step.index}`)).join(' › ');
}

/**
 * The layout with a copy of `panel` added at `position`. Beside another panel, the new panel joins
 * the target's row or column, or the target is wrapped in a new one; the items of that container
 * share it evenly as integer percentages. `tab` adds the panel to the target's stack and shows it;
 * `end` adds it at the right end of the root, and an empty layout gets a root stack.
 * @throws LayoutEditError when the placement is not one of PANEL_PLACEMENTS or `end`, when a placement
 * other than `end` has no `relativeTo`, or when `relativeTo` is not in the layout.
 */
export function InsertPanel(layout: ResolvedLayoutConfig | null, panel: DashboardPanel, position: PanelPosition): ResolvedLayoutConfig {
  assertValidPosition(position);
  const copy = cloneLayout(layout);
  const item = componentItem(cloneJson(panel));
  if (position.placement === 'end') {
    copy.root = copy.root ? appendToRoot(copy.root, stackItem([item])) : stackItem([item]);
    return toResolved(copy);
  }
  const root = copy.root;
  const location = root ? locate(root, position.relativeTo) : null;
  if (!root || !location) throw new LayoutEditError(`Panel "${position.relativeTo}" is not in the layout.`);
  if (position.placement === 'tab') {
    addTab(location.stack, item);
  } else {
    copy.root = splitBeside(root, location, stackItem([item]), position.placement);
  }
  return toResolved(copy);
}

/**
 * The layout without the panel. Its stack keeps showing the same tab when that tab remains. An
 * empty stack is removed, a container left with one item is replaced by that item, and the items of
 * a container that lost one share it evenly unless their sizes still add up to 100%. A layout left
 * with no panels has no root.
 * @throws LayoutEditError when the panel is not in the layout.
 */
export function RemovePanelFromLayout(layout: ResolvedLayoutConfig | null, panelId: string): ResolvedLayoutConfig {
  const copy = cloneLayout(layout);
  const location = copy.root ? locate(copy.root, panelId) : null;
  if (!copy.root || !location) throw new LayoutEditError(`Panel "${panelId}" is not in the layout.`);
  removeTab(location.stack, panelId);
  copy.root = prune(copy.root);
  return toResolved(copy);
}

/**
 * The layout with the panel removed from where it is and inserted at `position`.
 * @throws LayoutEditError when the position is not valid (as for InsertPanel), when the panel or
 * `relativeTo` is not in the layout, or when `relativeTo` is the panel itself.
 */
export function MovePanel(layout: ResolvedLayoutConfig | null, panelId: string, position: PanelPosition): ResolvedLayoutConfig {
  assertValidPosition(position);
  if (position.placement !== 'end' && position.relativeTo === panelId) {
    throw new LayoutEditError('A panel cannot be placed relative to itself.');
  }
  const current = findComponent(rootOf(layout), panelId);
  if (!current?.componentState) throw new LayoutEditError(`Panel "${panelId}" is not in the layout.`);
  return InsertPanel(RemovePanelFromLayout(layout, panelId), current.componentState, position);
}

/**
 * The layout with the panel resized. `widthPct` sets the panel's share of the nearest row that it
 * shares with other items, and `heightPct` its share of the nearest such column; give either or both.
 * The share is kept between 5% and 95%, and low enough that every other item in the container keeps
 * at least 5%. The other items share the rest in proportion to their current shares. Sizes are integer
 * percentages that add up to 100.
 * @throws LayoutEditError when the panel is not in the layout, no size or a non-finite size is given,
 * or the panel shares no row (for a width) or column (for a height) with other items.
 */
export function ResizePanel(
  layout: ResolvedLayoutConfig | null,
  panelId: string,
  size: { widthPct?: number; heightPct?: number },
): ResolvedLayoutConfig {
  const copy = cloneLayout(layout);
  const path = copy.root ? findPath(copy.root, panelId, []) : null;
  if (!copy.root || !path) throw new LayoutEditError(`Panel "${panelId}" is not in the layout.`);
  if (size.widthPct === undefined && size.heightPct === undefined) throw new LayoutEditError('Give widthPct, heightPct or both.');
  if (size.widthPct !== undefined) resizeAlong(copy.root, path, 'row', size.widthPct, panelId);
  if (size.heightPct !== undefined) resizeAlong(copy.root, path, 'column', size.heightPct, panelId);
  return toResolved(copy);
}

/** A compact tree of the layout: containers with integer percentage sizes and panels with their IDs. */
export function SimplifyLayout(layout: ResolvedLayoutConfig | null): SimplifiedLayoutNode | null {
  const root = rootOf(layout);
  return root ? simplify(root, false) : null;
}

// ── positions ───────────────────────────────────────────────────────────────

/**
 * Throws when the position is not one this editor can apply: a placement that is not one of
 * PANEL_PLACEMENTS or `end`, or a placement other than `end` without a `relativeTo`. Positions can come
 * from agent JSON, so this checks values that the types cannot.
 */
function assertValidPosition(position: PanelPosition): void {
  const placement: string | undefined = position.placement;
  if (placement === 'end') return;
  if (!PANEL_PLACEMENTS.some(allowed => allowed === placement)) {
    const shown = typeof placement === 'string' ? `"${placement}"` : String(placement);
    throw new LayoutEditError(`position.placement must be one of ${[...PANEL_PLACEMENTS, 'end'].join(', ')}; got ${shown}.`);
  }
  const relativeTo: string | undefined = 'relativeTo' in position ? position.relativeTo : undefined;
  if (typeof relativeTo !== 'string' || !relativeTo.trim()) {
    throw new LayoutEditError(`position.relativeTo is required for placement "${placement}".`);
  }
}

// ── layout copies ───────────────────────────────────────────────────────────

/** A deep copy of JSON data. */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A deep copy of the layout to edit, or Golden Layout's default empty layout when there is none. */
function cloneLayout(layout: ResolvedLayoutConfig | null): EditableLayout {
  return JSON.parse(JSON.stringify(layout ?? ResolvedLayoutConfig.createDefault())) as EditableLayout;
}

/** The root item of a saved layout, read as the item shape that Golden Layout saves. */
function rootOf(layout: ResolvedLayoutConfig | null): LayoutItem | undefined {
  return (layout as EditableLayout | null)?.root;
}

/** The edited copy as Golden Layout's saved-layout type; its items keep the shape that Golden Layout saves. */
function toResolved(copy: EditableLayout): ResolvedLayoutConfig {
  return copy as ResolvedLayoutConfig;
}

// ── items ───────────────────────────────────────────────────────────────────

function componentItem(panel: DashboardPanel): LayoutItem {
  return {
    type: 'component', content: [], size: 1, sizeUnit: 'fr', minSizeUnit: 'px', id: '', maximised: false, isClosable: true,
    reorderEnabled: true, title: panel.title, componentType: 'dashboard-panel', componentState: panel,
  };
}

function stackItem(content: LayoutItem[]): LayoutItem {
  return { type: 'stack', content, size: 50, sizeUnit: '%', minSizeUnit: 'px', id: '', isClosable: true, maximised: false, activeItemIndex: 0 };
}

function groupItem(type: 'row' | 'column', content: LayoutItem[]): LayoutItem {
  return { type, content, size: 1, sizeUnit: 'fr', minSizeUnit: 'px', id: '', isClosable: true };
}

// ── finding panels ──────────────────────────────────────────────────────────

function findPath(node: LayoutItem, panelId: string, path: LayoutPathStep[]): LayoutPathStep[] | null {
  if (node.type === 'component') return node.componentState?.id === panelId ? path : null;
  for (let i = 0; i < node.content.length; i++) {
    const found = findPath(node.content[i], panelId, [...path, { kind: node.type, index: i }]);
    if (found) return found;
  }
  return null;
}

function findComponent(node: LayoutItem | undefined, panelId: string): LayoutItem | null {
  if (!node) return null;
  if (node.type === 'component') return node.componentState?.id === panelId ? node : null;
  for (const child of node.content) {
    const found = findComponent(child, panelId);
    if (found) return found;
  }
  return null;
}

/** The stack that holds the panel, with its parent container and index. */
function locate(node: LayoutItem, panelId: string, parent: LayoutItem | null = null, indexInParent = -1): PanelLocation | null {
  if (node.type === 'stack') {
    return node.content.some(c => c.componentState?.id === panelId) ? { stack: node, parent, indexInParent } : null;
  }
  if (node.type === 'component') return null;
  for (let i = 0; i < node.content.length; i++) {
    const found = locate(node.content[i], panelId, node, i);
    if (found) return found;
  }
  return null;
}

// ── inserting ───────────────────────────────────────────────────────────────

/** The root with `newStack` at its right end: appended to a root row, or beside any other root in a new row. */
function appendToRoot(root: LayoutItem, newStack: LayoutItem): LayoutItem {
  const row = root.type === 'row' ? root : groupItem('row', [root]);
  row.content.push(newStack);
  shareEvenly(row.content);
  return row;
}

/** Adds the item to the stack as its last tab and shows it. */
function addTab(stack: LayoutItem, item: LayoutItem): void {
  stack.content.push(item);
  stack.activeItemIndex = stack.content.length - 1;
}

/**
 * Puts `newStack` beside the target stack: into the parent when the parent runs along the needed axis,
 * otherwise into a new row or column that takes the target's place and size. The items of the changed
 * container share it evenly. Returns the layout's root, which is the new container when the target was the root.
 */
function splitBeside(root: LayoutItem, location: PanelLocation, newStack: LayoutItem, placement: SidePlacement): LayoutItem {
  const { stack, parent, indexInParent } = location;
  const axis: 'row' | 'column' = placement === 'left' || placement === 'right' ? 'row' : 'column';
  const after = placement === 'right' || placement === 'below';
  if (parent && parent.type === axis) {
    parent.content.splice(indexInParent + (after ? 1 : 0), 0, newStack);
    shareEvenly(parent.content);
    return root;
  }
  const wrapper = groupItem(axis, after ? [stack, newStack] : [newStack, stack]);
  wrapper.size = stack.size;
  wrapper.sizeUnit = stack.sizeUnit;
  shareEvenly(wrapper.content);
  if (!parent) return wrapper;
  parent.content[indexInParent] = wrapper;
  return root;
}

// ── removing ────────────────────────────────────────────────────────────────

/** Removes the panel's tab from the stack. The stack keeps showing the same tab when that tab remains. */
function removeTab(stack: LayoutItem, panelId: string): void {
  const index = stack.content.findIndex(c => c.componentState?.id === panelId);
  stack.content.splice(index, 1);
  const active = stack.activeItemIndex ?? 0;
  stack.activeItemIndex = clamp(active > index ? active - 1 : active, 0, Math.max(0, stack.content.length - 1));
}

/**
 * Removes empty stacks and containers and lifts single-child rows and columns. A container that lost
 * an item shares its space evenly unless its sizes still add up to 100%. Returns undefined when nothing is left.
 */
function prune(node: LayoutItem): LayoutItem | undefined {
  if (node.type === 'component') return node;
  if (node.type === 'stack') return node.content.length ? node : undefined;
  const kept = node.content.map(prune).filter((c): c is LayoutItem => !!c);
  if (kept.length === 0) return undefined;
  if (kept.length === 1) {
    const only = kept[0];
    only.size = node.size;
    only.sizeUnit = node.sizeUnit;
    return only;
  }
  if (kept.length < node.content.length) shareEvenlyIfNeeded(kept);
  node.content = kept;
  return node;
}

// ── sizes ───────────────────────────────────────────────────────────────────

/** Gives each sibling an equal integer percentage; the first child takes the rounding remainder. */
function shareEvenly(items: LayoutItem[]): void {
  const each = Math.floor(100 / items.length);
  items.forEach((item, i) => setPercent(item, i === 0 ? 100 - each * (items.length - 1) : each));
}

function shareEvenlyIfNeeded(items: LayoutItem[]): void {
  const percentTotal = sum(items.map(item => (item.sizeUnit === '%' ? item.size : 0)));
  if (Math.round(percentTotal) !== 100) shareEvenly(items);
}

/** Sets the panel's share along `axis` in the nearest container of that kind where it has siblings. */
function resizeAlong(root: LayoutItem, path: LayoutPathStep[], axis: 'row' | 'column', pct: number, panelId: string): void {
  const dimension = axis === 'row' ? 'width' : 'height';
  if (!Number.isFinite(pct)) throw new LayoutEditError(`The ${dimension} must be a finite percentage.`);
  const slot = nearestSlot(root, path, axis);
  if (!slot) throw new LayoutEditError(`Panel "${panelId}" has no ${dimension} to change: it does not share a ${axis} with other panels.`);
  setShare(slot.container.content, slot.index, pct);
}

/** The nearest container of kind `axis` on the path that holds more than one item, with the index of the item on the path. */
function nearestSlot(root: LayoutItem, path: LayoutPathStep[], axis: 'row' | 'column'): ItemSlot | null {
  let node = root;
  let slot: ItemSlot | null = null;
  for (const step of path) {
    if (node.type === axis && node.content.length > 1) slot = { container: node, index: step.index };
    node = node.content[step.index];
  }
  return slot;
}

/**
 * Gives `items[index]` `pct` percent, clamped so that every item keeps at least 5% (less only when
 * more than 20 items share the container), and shares the rest among the other items in proportion
 * to their current shares. All sizes become integer percentages that add up to 100.
 */
function setShare(items: LayoutItem[], index: number, pct: number): void {
  const floor = Math.min(MIN_PCT, Math.floor(100 / items.length));
  const target = clamp(Math.round(pct), floor, Math.min(MAX_PCT, 100 - floor * (items.length - 1)));
  const otherShares = currentShares(items).filter((_, i) => i !== index);
  const otherSizes = apportion(100 - target, otherShares, floor);
  items.filter((_, i) => i !== index).forEach((item, i) => setPercent(item, otherSizes[i]));
  setPercent(items[index], target);
}

/**
 * Each item's share of its row or column in percent, read the way Golden Layout reads sizes: `%`
 * sizes first, then the `fr` sizes share the space left (50% more when none is left). The shares add up to 100.
 */
function currentShares(items: LayoutItem[]): number[] {
  const sizes = items.map(readSize);
  const percentTotal = sum(sizes.filter(s => s.unit === '%').map(s => s.value));
  const fractionTotal = sum(sizes.filter(s => s.unit === 'fr').map(s => s.value));
  const fractionSpace = Math.round(percentTotal) < 100 ? 100 - percentTotal : 50;
  const amounts = sizes.map(s => (s.unit === '%' ? s.value : (fractionSpace * s.value) / fractionTotal));
  const total = sum(amounts);
  return amounts.map(amount => (amount * 100) / total);
}

/** An item's size. A missing size, one that is not positive, or one in another unit counts as one `fr`. */
function readSize(item: LayoutItem): ItemSize {
  if (Number.isFinite(item.size) && item.size > 0) {
    if (item.sizeUnit === '%') return { unit: '%', value: item.size };
    if (item.sizeUnit === 'fr') return { unit: 'fr', value: item.size };
  }
  return { unit: 'fr', value: 1 };
}

/**
 * Splits `total` into integers in proportion to `weights`, with every part at least `floor`. Parts that
 * would fall below `floor` get exactly `floor` and the others share what is left. The caller makes sure
 * that `total` is at least `floor` times the number of parts.
 */
function apportion(total: number, weights: number[], floor: number, atFloor: ReadonlySet<number> = new Set()): number[] {
  const freeTotal = total - floor * atFloor.size;
  const freeWeight = sum(weights.filter((_, i) => !atFloor.has(i)));
  const parts = weights.map((weight, i) => (atFloor.has(i) ? floor : (freeTotal * weight) / freeWeight));
  const below = parts.flatMap((part, i) => (!atFloor.has(i) && part < floor ? [i] : []));
  return below.length > 0 ? apportion(total, weights, floor, new Set([...atFloor, ...below])) : roundToTotal(parts, total);
}

/** Rounds parts that add up to `total` down to integers, then gives the units left over to the largest remainders. */
function roundToTotal(parts: number[], total: number): number[] {
  const rounded = parts.map(part => Math.floor(part));
  const left = total - sum(rounded);
  const byRemainder = parts.map((_, i) => i).sort((a, b) => parts[b] - rounded[b] - (parts[a] - rounded[a]));
  byRemainder.slice(0, left).forEach(i => rounded[i]++);
  return rounded;
}

function setPercent(item: LayoutItem, pct: number): void {
  item.size = pct;
  item.sizeUnit = '%';
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// ── describing ──────────────────────────────────────────────────────────────

function simplify(node: LayoutItem, sized: boolean): SimplifiedLayoutNode {
  if (node.type === 'component') {
    return { kind: 'panel', panelId: node.componentState?.id, title: node.componentState?.title ?? node.title };
  }
  const out: SimplifiedLayoutNode = { kind: node.type, children: node.content.map(c => simplify(c, true)) };
  if (sized && node.sizeUnit === '%') out.sizePct = Math.round(node.size);
  return out;
}
