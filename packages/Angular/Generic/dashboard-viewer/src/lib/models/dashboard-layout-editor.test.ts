import { describe, it, expect } from 'vitest';
import type { ResolvedLayoutConfig } from 'golden-layout';
import { DescribePath, FindPanelPath, InsertPanel, MovePanel, RemovePanelFromLayout, ResizePanel, SimplifyLayout, LayoutEditError } from './dashboard-layout-editor';
import { ExtractPanelsFromLayout, type DashboardPanel } from './dashboard-types';
import { LayoutConfig } from 'golden-layout';
import { PANEL_PLACEMENTS, type PanelPosition } from './dashboard-layout-editor';

function panel(id: string, title = id): DashboardPanel {
  return { id, title, partTypeId: '6C975185-297C-420D-BD59-F5402AF35399', config: { type: 'View', entityName: 'MJ: Users' } };
}
function component(p: DashboardPanel) {
  return { type: 'component', content: [], size: 1, sizeUnit: 'fr', minSizeUnit: 'px', id: '', maximised: false, isClosable: true, reorderEnabled: true, title: p.title, componentType: 'dashboard-panel', componentState: p };
}
function stack(items: object[], size = 50, sizeUnit = '%') {
  return { type: 'stack', content: items, size, sizeUnit, minSizeUnit: 'px', id: '', isClosable: true, maximised: false, activeItemIndex: 0 };
}
function group(type: 'row' | 'column', content: object[], size = 1, sizeUnit = 'fr') {
  return { type, content, size, sizeUnit, minSizeUnit: 'px', id: '', isClosable: true };
}
function layout(root: object | null): ResolvedLayoutConfig {
  return { root, openPopouts: [], settings: {}, dimensions: {}, header: {}, resolved: true } as unknown as ResolvedLayoutConfig;
}
/** Two stacks side by side: A (32%) | B (68%). */
function twoAcross(): ResolvedLayoutConfig {
  return layout(group('row', [stack([component(panel('A'))], 32), stack([component(panel('B'))], 68)]));
}
const ids = (l: ResolvedLayoutConfig) => ExtractPanelsFromLayout(l).map(p => p.id);
const root = (l: ResolvedLayoutConfig) => l.root as unknown as { type: string; content: Array<{ type: string; size: number; sizeUnit: string; content: unknown[] }> };

describe('FindPanelPath / DescribePath', () => {
  it('finds a panel and describes its path', () => {
    const path = FindPanelPath(twoAcross(), 'B');
    expect(path).toEqual([{ kind: 'row', index: 1 }, { kind: 'stack', index: 0 }]);
    expect(DescribePath(path!)).toBe('row/1 › tab 0');
  });
  it('returns null for an unknown panel', () => expect(FindPanelPath(twoAcross(), 'nope')).toBeNull());
});

describe('InsertPanel', () => {
  it('adds to the right by splitting the sibling list of a row', () => {
    const out = InsertPanel(twoAcross(), panel('C'), { relativeTo: 'A', placement: 'right' });
    expect(ids(out)).toEqual(['A', 'C', 'B']);
    const sizes = root(out).content.map(c => c.size);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(100);
    expect(root(out).content.every(c => Number.isInteger(c.size) && c.sizeUnit === '%')).toBe(true);
  });
  it('adds below by wrapping the target stack in a column', () => {
    const out = InsertPanel(twoAcross(), panel('C'), { relativeTo: 'A', placement: 'below' });
    expect(root(out).content[0].type).toBe('column');
    expect(ids(out)).toEqual(['A', 'C', 'B']);
    const column = root(out).content[0];
    expect(column.content.map(c => (c as { size: number }).size)).toEqual([50, 50]);
  });
  it('adds as a tab of the target stack', () => {
    const out = InsertPanel(twoAcross(), panel('C'), { relativeTo: 'B', placement: 'tab' });
    expect(root(out).content[1].content).toHaveLength(2);
    expect(ids(out)).toEqual(['A', 'B', 'C']);
  });
  it('appends at the end of the root row', () => {
    const out = InsertPanel(twoAcross(), panel('C'), { placement: 'end' });
    expect(ids(out)).toEqual(['A', 'B', 'C']);
    expect(root(out).content).toHaveLength(3);
  });
  it('creates a root stack on an empty layout', () => {
    const out = InsertPanel(layout(null), panel('A'), { placement: 'end' });
    expect(ids(out)).toEqual(['A']);
  });
  it('throws for an unknown target', () => {
    expect(() => InsertPanel(twoAcross(), panel('C'), { relativeTo: 'zzz', placement: 'left' })).toThrow(LayoutEditError);
  });
  it('does not mutate the input', () => {
    const input = twoAcross();
    const before = JSON.stringify(input);
    InsertPanel(input, panel('C'), { placement: 'end' });
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('RemovePanelFromLayout', () => {
  it('removes the panel and collapses a single-child row', () => {
    const out = RemovePanelFromLayout(twoAcross(), 'A');
    expect(ids(out)).toEqual(['B']);
    expect((out.root as unknown as { type: string }).type).toBe('stack');
  });
  it('removes a tab and keeps the stack', () => {
    const withTab = InsertPanel(twoAcross(), panel('C'), { relativeTo: 'B', placement: 'tab' });
    const out = RemovePanelFromLayout(withTab, 'C');
    expect(ids(out)).toEqual(['A', 'B']);
  });
  it('returns an empty root when the last panel goes', () => {
    const out = RemovePanelFromLayout(RemovePanelFromLayout(twoAcross(), 'A'), 'B');
    expect(out.root).toBeUndefined();
  });
});

describe('MovePanel', () => {
  it('moves A to the right of B', () => {
    const out = MovePanel(twoAcross(), 'A', { relativeTo: 'B', placement: 'right' });
    expect(ids(out)).toEqual(['B', 'A']);
  });
  it('throws when moving relative to itself', () => {
    expect(() => MovePanel(twoAcross(), 'A', { relativeTo: 'A', placement: 'left' })).toThrow(LayoutEditError);
  });
});

describe('ResizePanel', () => {
  it('sets the width and renormalises siblings to 100', () => {
    const out = ResizePanel(twoAcross(), 'A', { widthPct: 50 });
    expect(root(out).content.map(c => c.size)).toEqual([50, 50]);
  });
  it('clamps between 5 and 95', () => {
    const out = ResizePanel(twoAcross(), 'A', { widthPct: 120 });
    expect(root(out).content.map(c => c.size)).toEqual([95, 5]);
  });
  it('throws when the axis does not exist for the panel', () => {
    expect(() => ResizePanel(twoAcross(), 'A', { heightPct: 40 })).toThrow(LayoutEditError);
  });
});

describe('SimplifyLayout', () => {
  it('describes rows, stacks and panels with integer sizes', () => {
    expect(SimplifyLayout(twoAcross())).toEqual({
      kind: 'row',
      children: [
        { kind: 'stack', sizePct: 32, children: [{ kind: 'panel', panelId: 'A', title: 'A' }] },
        { kind: 'stack', sizePct: 68, children: [{ kind: 'panel', panelId: 'B', title: 'B' }] },
      ],
    });
  });
  it('is null for an empty layout', () => expect(SimplifyLayout(layout(null))).toBeNull());
});

// ── more fixtures ───────────────────────────────────────────────────────────

/** A saved item as these tests read it. */
interface SavedItem {
  type: string;
  size: number;
  sizeUnit: string;
  activeItemIndex?: number;
  content: SavedItem[];
  componentState?: DashboardPanel;
}
type LayoutEdit = (l: ResolvedLayoutConfig) => ResolvedLayoutConfig;

/** The item reached from the root through the given child indexes. */
const at = (l: ResolvedLayoutConfig, ...indexes: number[]): SavedItem => indexes.reduce((node, i) => node.content[i], l.root as unknown as SavedItem);
const sizes = (node: SavedItem) => node.content.map(c => c.size);
const shownTab = (stackItem: SavedItem) => stackItem.content[stackItem.activeItemIndex ?? 0].componentState?.id;
const pathOf = (l: ResolvedLayoutConfig, panelId: string) => {
  const path = FindPanelPath(l, panelId);
  return path ? DescribePath(path) : null;
};
/** A row with three stacks: A (34%) | C (33%) | B (33%). */
const threeAcross = () => InsertPanel(twoAcross(), panel('C'), { relativeTo: 'A', placement: 'right' });
/** A in a column with C below it (32% of the row), beside B (68%). */
const aOverC = () => InsertPanel(twoAcross(), panel('C'), { relativeTo: 'A', placement: 'below' });

/**
 * A layout the dashboard viewer saved: "Applications" (32.3%) and "Users" (67.7%) side by side.
 * Copied from dashboard-layout-preview.test.ts (a real save).
 */
const REAL_SAVED_LAYOUT =
  '{"layout":{"root":{"type":"row","content":[{"type":"stack","content":[{"type":"component","content":[],"size":1,"sizeUnit":"fr","minSizeUnit":"px","id":"","maximised":false,"isClosable":true,"reorderEnabled":true,"title":"Applications","componentType":"dashboard-panel","componentState":{"id":"panel-2c618b445f08","partTypeId":"6c975185-297c-420d-bd59-f5402af35399","title":"Applications","icon":"fa-solid fa-table","config":{"type":"View","entityName":"MJ: Applications","displayMode":"grid","allowModeSwitch":true,"enableSelection":true,"selectionMode":"single"}}}],"size":32.323232323232325,"sizeUnit":"%","minSizeUnit":"px","id":"","isClosable":true,"maximised":false,"activeItemIndex":0},{"type":"stack","content":[{"type":"component","content":[],"size":1,"sizeUnit":"fr","minSizeUnit":"px","id":"","maximised":false,"isClosable":true,"reorderEnabled":true,"title":"Users","componentType":"dashboard-panel","componentState":{"id":"panel-950d6f8548da","partTypeId":"6c975185-297c-420d-bd59-f5402af35399","title":"Users","icon":"fa-solid fa-table","config":{"type":"View","entityName":"MJ: Users","displayMode":"grid","allowModeSwitch":true,"enableSelection":true,"selectionMode":"single"}}}],"size":67.67676767676768,"sizeUnit":"%","minSizeUnit":"px","id":"","isClosable":true,"maximised":false,"activeItemIndex":0}],"size":1,"sizeUnit":"fr","minSizeUnit":"px","id":"","isClosable":true},"openPopouts":[],"settings":{"constrainDragToContainer":true,"reorderEnabled":true,"popoutWholeStack":false,"blockedPopoutsThrowError":true,"closePopoutsOnUnload":true,"responsiveMode":"none","tabOverlapAllowance":0,"reorderOnTabMenuClick":true,"tabControlOffset":10,"popInOnClose":false},"dimensions":{"borderWidth":5,"borderGrabWidth":5,"defaultMinItemHeight":0,"defaultMinItemHeightUnit":"px","defaultMinItemWidth":10,"defaultMinItemWidthUnit":"px","headerHeight":20,"dragProxyWidth":300,"dragProxyHeight":200},"header":{"show":"top","popout":false,"dock":"dock","close":"tab","maximise":false,"minimise":"minimise","tabDropdown":"additional tabs"},"resolved":true},"settings":{"theme":"light","showHeaders":true,"enablePopout":false,"enableMaximize":true,"enableDragDrop":true,"enableResize":true}}';
const APPLICATIONS = 'panel-2c618b445f08';
const USERS = 'panel-950d6f8548da';
const realSaved = (): ResolvedLayoutConfig => (JSON.parse(REAL_SAVED_LAYOUT) as { layout: ResolvedLayoutConfig }).layout;

// ── more cases ──────────────────────────────────────────────────────────────

describe('InsertPanel at each placement', () => {
  it.each([
    ['left', ['C', 'A', 'B'], 'row/0 › tab 0'],
    ['right', ['A', 'C', 'B'], 'row/1 › tab 0'],
    ['above', ['C', 'A', 'B'], 'row/0 › column/0 › tab 0'],
    ['below', ['A', 'C', 'B'], 'row/0 › column/1 › tab 0'],
    ['tab', ['A', 'C', 'B'], 'row/0 › tab 1'],
  ] as const)('puts C %s of A', (placement, order, path) => {
    const out = InsertPanel(twoAcross(), panel('C'), { relativeTo: 'A', placement });
    expect(ids(out)).toEqual(order);
    expect(pathOf(out, 'C')).toBe(path);
  });
  it('wraps the target in a column that takes its place and size, and leaves the row alone', () => {
    const out = InsertPanel(twoAcross(), panel('C'), { relativeTo: 'B', placement: 'above' });
    expect(at(out, 1)).toMatchObject({ type: 'column', size: 68, sizeUnit: '%' });
    expect(sizes(at(out, 1))).toEqual([50, 50]);
    expect(sizes(at(out))).toEqual([32, 68]);
  });
  it('joins a column that already runs the right way and shares it evenly', () => {
    const out = InsertPanel(aOverC(), panel('D'), { relativeTo: 'A', placement: 'below' });
    expect(ids(out)).toEqual(['A', 'D', 'C', 'B']);
    expect(sizes(at(out, 0))).toEqual([34, 33, 33]);
    expect(sizes(at(out))).toEqual([32, 68]);
  });
  it('shows the new tab', () => {
    const out = InsertPanel(twoAcross(), panel('C'), { relativeTo: 'B', placement: 'tab' });
    expect(shownTab(at(out, 1))).toBe('C');
  });
  it('wraps a root stack in a new row or column', () => {
    const single = layout(stack([component(panel('A'))], 1, 'fr'));
    const beside = InsertPanel(single, panel('B'), { relativeTo: 'A', placement: 'right' });
    expect(at(beside)).toMatchObject({ type: 'row', size: 1, sizeUnit: 'fr' });
    expect(sizes(at(beside))).toEqual([50, 50]);
    expect(ids(beside)).toEqual(['A', 'B']);
    expect(at(InsertPanel(single, panel('B'), { relativeTo: 'A', placement: 'below' })).type).toBe('column');
  });
  it('puts the root in a new row when it appends to a root that is not a row', () => {
    const out = InsertPanel(layout(stack([component(panel('A'))], 1, 'fr')), panel('B'), { placement: 'end' });
    expect(at(out).type).toBe('row');
    expect(sizes(at(out))).toEqual([50, 50]);
    expect(ids(out)).toEqual(['A', 'B']);
  });
  it('throws for a target on an empty layout', () => {
    expect(() => InsertPanel(layout(null), panel('A'), { relativeTo: 'X', placement: 'left' })).toThrow('Panel "X" is not in the layout.');
  });
  it('puts a copy of the panel in the layout', () => {
    const added = panel('C');
    const state = at(InsertPanel(twoAcross(), added, { placement: 'end' }), 2, 0).componentState;
    expect(state).toEqual(added);
    expect(state).not.toBe(added);
  });
});

describe('RemovePanelFromLayout in nested layouts', () => {
  it('keeps showing the same tab when an earlier tab goes, and shows the next tab when the shown tab goes', () => {
    const tabs = (activeItemIndex: number) =>
      layout({ ...stack(['A', 'B', 'C', 'D'].map(id => component(panel(id))), 1, 'fr'), activeItemIndex });
    expect(shownTab(at(RemovePanelFromLayout(tabs(1), 'A')))).toBe('B');
    expect(shownTab(at(RemovePanelFromLayout(tabs(1), 'B')))).toBe('C');
  });
  it('lifts the last item of a column into its place', () => {
    const out = RemovePanelFromLayout(aOverC(), 'C');
    expect(at(out, 0)).toMatchObject({ type: 'stack', size: 32, sizeUnit: '%' });
    expect(sizes(at(out))).toEqual([32, 68]);
    expect(ids(out)).toEqual(['A', 'B']);
  });
  it('shares the space of a row that lost a panel evenly', () => {
    expect(sizes(at(RemovePanelFromLayout(threeAcross(), 'C')))).toEqual([50, 50]);
  });
  it('leaves the sizes of containers that lost nothing', () => {
    const input = layout(
      group('row', [
        group('column', [stack([component(panel('X'))], 1, 'fr'), stack([component(panel('Y'))], 3, 'fr')], 50, '%'),
        stack([component(panel('A'))], 25),
        stack([component(panel('B'))], 25),
      ]),
    );
    const out = RemovePanelFromLayout(input, 'A');
    expect(sizes(at(out))).toEqual([50, 50]);
    expect(at(out, 0).content.map(c => [c.size, c.sizeUnit])).toEqual([[1, 'fr'], [3, 'fr']]);
  });
  it('throws for an unknown panel or an empty layout', () => {
    expect(() => RemovePanelFromLayout(twoAcross(), 'nope')).toThrow('Panel "nope" is not in the layout.');
    expect(() => RemovePanelFromLayout(null, 'A')).toThrow(LayoutEditError);
  });
});

describe('MovePanel to other places', () => {
  it('moves a panel into another stack as its shown tab', () => {
    const out = MovePanel(twoAcross(), 'A', { relativeTo: 'B', placement: 'tab' });
    expect(at(out).type).toBe('stack');
    expect(ids(out)).toEqual(['B', 'A']);
    expect(shownTab(at(out))).toBe('A');
  });
  it('moves a panel to the end', () => {
    const out = MovePanel(threeAcross(), 'A', { placement: 'end' });
    expect(ids(out)).toEqual(['C', 'B', 'A']);
    expect(sizes(at(out))).toEqual([34, 33, 33]);
  });
  it('keeps the panel data and gives the result its own copy of it', () => {
    const input = twoAcross();
    const moved = at(MovePanel(input, 'A', { relativeTo: 'B', placement: 'right' }), 1, 0).componentState;
    expect(moved).toEqual(panel('A'));
    expect(moved).not.toBe(at(input, 0, 0).componentState);
  });
  it('throws for an unknown panel or target and leaves the input unchanged', () => {
    const input = twoAcross();
    const before = JSON.stringify(input);
    expect(() => MovePanel(input, 'nope', { placement: 'end' })).toThrow('Panel "nope" is not in the layout.');
    expect(() => MovePanel(input, 'A', { relativeTo: 'zzz', placement: 'left' })).toThrow('Panel "zzz" is not in the layout.');
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('ResizePanel renormalisation', () => {
  it('clamps so that every sibling keeps 5%', () => {
    expect(sizes(at(ResizePanel(threeAcross(), 'A', { widthPct: 95 })))).toEqual([90, 5, 5]);
    expect(sizes(at(ResizePanel(twoAcross(), 'A', { widthPct: 0 })))).toEqual([5, 95]);
  });
  it('shares the rest in proportion to the current shares, as integers that add up to 100', () => {
    const input = layout(group('row', [stack([component(panel('A'))], 20), stack([component(panel('B'))], 50), stack([component(panel('C'))], 30)]));
    expect(sizes(at(ResizePanel(input, 'A', { widthPct: 33 })))).toEqual([33, 42, 25]);
  });
  it('reads fr sizes the way Golden Layout does and writes percentages', () => {
    const input = layout(group('row', [stack([component(panel('A'))], 1, 'fr'), stack([component(panel('B'))], 40), stack([component(panel('C'))], 1, 'fr')]));
    const out = ResizePanel(input, 'A', { widthPct: 20 });
    expect(sizes(at(out))).toEqual([20, 46, 34]);
    expect(at(out).content.every(c => c.sizeUnit === '%')).toBe(true);
  });
  it('changes the nearest row that holds the panel', () => {
    const nested = layout(
      group('row', [
        stack([component(panel('A'))], 50),
        group(
          'column',
          [stack([component(panel('B'))], 50), group('row', [stack([component(panel('C'))], 50), stack([component(panel('D'))], 50)], 50, '%')],
          50,
          '%',
        ),
      ]),
    );
    const inner = ResizePanel(nested, 'D', { widthPct: 70 });
    expect(sizes(at(inner, 1, 1))).toEqual([30, 70]);
    expect(sizes(at(inner))).toEqual([50, 50]);
    const outer = ResizePanel(nested, 'B', { widthPct: 70 });
    expect(sizes(at(outer))).toEqual([30, 70]);
  });
  it('sets the width and the height together', () => {
    const out = ResizePanel(aOverC(), 'A', { widthPct: 60, heightPct: 30 });
    expect(sizes(at(out))).toEqual([60, 40]);
    expect(sizes(at(out, 0))).toEqual([30, 70]);
  });
  it('throws when the panel is the only item in its row', () => {
    const alone = layout(group('row', [stack([component(panel('A'))], 100)]));
    expect(() => ResizePanel(alone, 'A', { widthPct: 50 })).toThrow('Panel "A" has no width to change: it does not share a row with other panels.');
  });
  it('throws for an unknown panel, no size, or a size that is not a finite number', () => {
    expect(() => ResizePanel(twoAcross(), 'nope', { widthPct: 50 })).toThrow('Panel "nope" is not in the layout.');
    expect(() => ResizePanel(twoAcross(), 'A', {})).toThrow(LayoutEditError);
    expect(() => ResizePanel(twoAcross(), 'A', { widthPct: Number.NaN })).toThrow(LayoutEditError);
  });
});

describe('SimplifyLayout for nested layouts', () => {
  it('describes columns, tabs and nested sizes', () => {
    const tabbed = InsertPanel(aOverC(), panel('D'), { relativeTo: 'B', placement: 'tab' });
    expect(SimplifyLayout(tabbed)).toEqual({
      kind: 'row',
      children: [
        {
          kind: 'column',
          sizePct: 32,
          children: [
            { kind: 'stack', sizePct: 50, children: [{ kind: 'panel', panelId: 'A', title: 'A' }] },
            { kind: 'stack', sizePct: 50, children: [{ kind: 'panel', panelId: 'C', title: 'C' }] },
          ],
        },
        { kind: 'stack', sizePct: 68, children: [{ kind: 'panel', panelId: 'B', title: 'B' }, { kind: 'panel', panelId: 'D', title: 'D' }] },
      ],
    });
  });
});

describe('immutability', () => {
  it.each<[string, LayoutEdit]>([
    ['InsertPanel', l => InsertPanel(l, panel('C'), { relativeTo: 'A', placement: 'below' })],
    ['RemovePanelFromLayout', l => RemovePanelFromLayout(l, 'A')],
    ['MovePanel', l => MovePanel(l, 'A', { relativeTo: 'B', placement: 'above' })],
    ['ResizePanel', l => ResizePanel(l, 'A', { widthPct: 70 })],
  ])('%s returns a new layout and leaves its input unchanged', (_name, edit) => {
    const input = twoAcross();
    const before = JSON.stringify(input);
    const out = edit(input);
    expect(out).not.toBe(input);
    expect(out.root).not.toBe(input.root);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('LayoutEditError', () => {
  it('is an Error named LayoutEditError', () => {
    let caught: Error | null = null;
    try {
      ResizePanel(twoAcross(), 'A', { heightPct: 40 });
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).toBeInstanceOf(LayoutEditError);
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.name).toBe('LayoutEditError');
    expect(caught?.message).toBe('Panel "A" has no height to change: it does not share a column with other panels.');
  });
});

describe('loading in Golden Layout', () => {
  it('builds a layout from nothing that Golden Layout can load', () => {
    const out = InsertPanel(null, panel('A'), { placement: 'end' });
    expect(LayoutConfig.fromResolved(out).root?.type).toBe('stack');
    expect(ids(out)).toEqual(['A']);
  });
  it('gives edits of a saved layout that Golden Layout can load', () => {
    const moved = MovePanel(realSaved(), APPLICATIONS, { relativeTo: USERS, placement: 'below' });
    expect(LayoutConfig.fromResolved(moved).root?.type).toBe('column');
    const resized = ResizePanel(realSaved(), APPLICATIONS, { widthPct: 40 });
    expect(LayoutConfig.fromResolved(resized).root?.content?.map(c => c.size)).toEqual(['40%', '60%']);
  });
});

describe('the real saved layout', () => {
  it('finds, describes and simplifies its panels', () => {
    expect(FindPanelPath(realSaved(), USERS)).toEqual([{ kind: 'row', index: 1 }, { kind: 'stack', index: 0 }]);
    expect(pathOf(realSaved(), USERS)).toBe('row/1 › tab 0');
    expect(SimplifyLayout(realSaved())).toEqual({
      kind: 'row',
      children: [
        { kind: 'stack', sizePct: 32, children: [{ kind: 'panel', panelId: APPLICATIONS, title: 'Applications' }] },
        { kind: 'stack', sizePct: 68, children: [{ kind: 'panel', panelId: USERS, title: 'Users' }] },
      ],
    });
  });
  it('inserts beside a panel and keeps the layout settings', () => {
    const input = realSaved();
    const out = InsertPanel(input, panel('C'), { relativeTo: APPLICATIONS, placement: 'right' });
    expect(ids(out)).toEqual([APPLICATIONS, 'C', USERS]);
    expect(sizes(at(out))).toEqual([34, 33, 33]);
    expect({ settings: out.settings, dimensions: out.dimensions, header: out.header, openPopouts: out.openPopouts, resolved: out.resolved }).toEqual({
      settings: input.settings,
      dimensions: input.dimensions,
      header: input.header,
      openPopouts: input.openPopouts,
      resolved: true,
    });
  });
  it('moves, resizes and removes panels without changing the input', () => {
    const input = realSaved();
    const before = JSON.stringify(input);
    const moved = MovePanel(input, APPLICATIONS, { relativeTo: USERS, placement: 'below' });
    expect(at(moved).type).toBe('column');
    expect(pathOf(moved, APPLICATIONS)).toBe('column/1 › tab 0');
    expect(ExtractPanelsFromLayout(moved).find(p => p.id === APPLICATIONS)?.config).toEqual(ExtractPanelsFromLayout(input)[0].config);
    expect(sizes(at(ResizePanel(input, APPLICATIONS, { widthPct: 40 })))).toEqual([40, 60]);
    const removed = RemovePanelFromLayout(input, USERS);
    expect(at(removed).type).toBe('stack');
    expect(ids(removed)).toEqual([APPLICATIONS]);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('invalid positions', () => {
  /** A position as agent tools send it: parsed from JSON, so TypeScript does not check its shape. */
  const fromJson = (json: string) => JSON.parse(json) as PanelPosition;
  /** The error that `edit` throws, or null when it throws none. */
  const thrownBy = (edit: () => void): Error | null => {
    try {
      edit();
    } catch (error) {
      return error as Error;
    }
    return null;
  };
  const allowed = 'left, right, above, below, tab, end';
  const cases: Array<[string, string]> = [
    ['{"relativeTo":"B","placement":"center"}', `position.placement must be one of ${allowed}; got "center".`],
    ['{"relativeTo":"B","placement":"top"}', `position.placement must be one of ${allowed}; got "top".`],
    ['{"relativeTo":"B"}', `position.placement must be one of ${allowed}; got undefined.`],
    ['{"placement":"left"}', 'position.relativeTo is required for placement "left".'],
    ['{"relativeTo":"","placement":"tab"}', 'position.relativeTo is required for placement "tab".'],
  ];

  it('exports the placements beside or into another panel', () => {
    expect(PANEL_PLACEMENTS).toEqual(['left', 'right', 'above', 'below', 'tab']);
  });
  it.each(cases)('InsertPanel throws for %s and leaves the input unchanged', (json, message) => {
    const input = twoAcross();
    const before = JSON.stringify(input);
    const error = thrownBy(() => InsertPanel(input, panel('C'), fromJson(json)));
    expect(error).toBeInstanceOf(LayoutEditError);
    expect(error?.message).toBe(message);
    expect(JSON.stringify(input)).toBe(before);
  });
  it.each(cases)('MovePanel throws for %s and leaves the input unchanged', (json, message) => {
    const input = twoAcross();
    const before = JSON.stringify(input);
    const error = thrownBy(() => MovePanel(input, 'A', fromJson(json)));
    expect(error).toBeInstanceOf(LayoutEditError);
    expect(error?.message).toBe(message);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('checks the position before it checks for a move relative to the panel itself', () => {
    const error = thrownBy(() => MovePanel(twoAcross(), 'A', fromJson('{"relativeTo":"A","placement":"top"}')));
    expect(error?.message).toBe(`position.placement must be one of ${allowed}; got "top".`);
  });
});
