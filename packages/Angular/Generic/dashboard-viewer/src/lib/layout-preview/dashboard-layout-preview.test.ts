import { describe, it, expect } from 'vitest';
import { BuildDashboardLayoutPreview } from './dashboard-layout-preview';

/**
 * Saved dashboard configurations are built the way DashboardViewerComponent saves them:
 * `{ layout: ResolvedLayoutConfig, settings }`, with each panel in a component's componentState.
 */

type SizeUnit = '%' | 'fr';

/** A saved Golden Layout component item for a dashboard panel. */
function component(title: string, icon: string | null = 'fa-solid fa-table', size = 1, sizeUnit: SizeUnit = 'fr') {
  return {
    type: 'component',
    content: [],
    size,
    sizeUnit,
    minSizeUnit: 'px',
    id: '',
    maximised: false,
    isClosable: true,
    reorderEnabled: true,
    title,
    componentType: 'dashboard-panel',
    componentState: {
      id: `panel-${title}`,
      partTypeId: 'pt-view',
      title,
      ...(icon ? { icon } : {}),
      config: { type: 'View', entityName: 'MJ: Users' },
    },
  };
}

/** A saved stack. `activeItemIndex` is left out when null. */
function stack(items: object[], size: number, sizeUnit: SizeUnit = '%', activeItemIndex: number | null = 0) {
  return {
    type: 'stack',
    content: items,
    size,
    sizeUnit,
    minSizeUnit: 'px',
    id: '',
    isClosable: true,
    maximised: false,
    ...(activeItemIndex === null ? {} : { activeItemIndex }),
  };
}

/** A saved row or column. */
function group(type: 'row' | 'column', content: object[], size = 1, sizeUnit: SizeUnit = 'fr') {
  return { type, content, size, sizeUnit, minSizeUnit: 'px', id: '', isClosable: true };
}

/** A saved dashboard configuration (UIConfigDetails) with this layout root. */
function saved(root: object | null): string {
  return JSON.stringify({
    layout: { root, openPopouts: [], settings: {}, dimensions: {}, header: {}, resolved: true },
    settings: { theme: 'light', showHeaders: true, enablePopout: false, enableMaximize: true, enableDragDrop: true, enableResize: true },
  });
}

/**
 * A layout the dashboard viewer saved: "Applications" (32.3%) and "Users" (67.7%) side by side,
 * copied from a real save (p7-warning-line.txt).
 */
const REAL_SAVED_LAYOUT =
  '{"layout":{"root":{"type":"row","content":[{"type":"stack","content":[{"type":"component","content":[],"size":1,"sizeUnit":"fr","minSizeUnit":"px","id":"","maximised":false,"isClosable":true,"reorderEnabled":true,"title":"Applications","componentType":"dashboard-panel","componentState":{"id":"panel-2c618b445f08","partTypeId":"6c975185-297c-420d-bd59-f5402af35399","title":"Applications","icon":"fa-solid fa-table","config":{"type":"View","entityName":"MJ: Applications","displayMode":"grid","allowModeSwitch":true,"enableSelection":true,"selectionMode":"single"}}}],"size":32.323232323232325,"sizeUnit":"%","minSizeUnit":"px","id":"","isClosable":true,"maximised":false,"activeItemIndex":0},{"type":"stack","content":[{"type":"component","content":[],"size":1,"sizeUnit":"fr","minSizeUnit":"px","id":"","maximised":false,"isClosable":true,"reorderEnabled":true,"title":"Users","componentType":"dashboard-panel","componentState":{"id":"panel-950d6f8548da","partTypeId":"6c975185-297c-420d-bd59-f5402af35399","title":"Users","icon":"fa-solid fa-table","config":{"type":"View","entityName":"MJ: Users","displayMode":"grid","allowModeSwitch":true,"enableSelection":true,"selectionMode":"single"}}}],"size":67.67676767676768,"sizeUnit":"%","minSizeUnit":"px","id":"","isClosable":true,"maximised":false,"activeItemIndex":0}],"size":1,"sizeUnit":"fr","minSizeUnit":"px","id":"","isClosable":true},"openPopouts":[],"settings":{"constrainDragToContainer":true,"reorderEnabled":true,"popoutWholeStack":false,"blockedPopoutsThrowError":true,"closePopoutsOnUnload":true,"responsiveMode":"none","tabOverlapAllowance":0,"reorderOnTabMenuClick":true,"tabControlOffset":10,"popInOnClose":false},"dimensions":{"borderWidth":5,"borderGrabWidth":5,"defaultMinItemHeight":0,"defaultMinItemHeightUnit":"px","defaultMinItemWidth":10,"defaultMinItemWidthUnit":"px","headerHeight":20,"dragProxyWidth":300,"dragProxyHeight":200},"header":{"show":"top","popout":false,"dock":"dock","close":"tab","maximise":false,"minimise":"minimise","tabDropdown":"additional tabs"},"resolved":true},"settings":{"theme":"light","showHeaders":true,"enablePopout":false,"enableMaximize":true,"enableDragDrop":true,"enableResize":true}}';

describe('BuildDashboardLayoutPreview', () => {
  describe('rows, columns and weights', () => {
    it('turns a saved row of two stacks into two panels with their saved share of the row', () => {
      expect(BuildDashboardLayoutPreview(REAL_SAVED_LAYOUT)).toEqual({
        Kind: 'row',
        Weight: 1,
        Children: [
          { Kind: 'panel', Weight: expect.closeTo(0.3232, 4), Title: 'Applications', Icon: 'fa-solid fa-table' },
          { Kind: 'panel', Weight: expect.closeTo(0.6768, 4), Title: 'Users', Icon: 'fa-solid fa-table' },
        ],
      });
    });

    it('scales % sizes that do not add up to 100 so the shares add up to 1', () => {
      const preview = BuildDashboardLayoutPreview(saved(group('row', [stack([component('A')], 30), stack([component('B')], 10)])));
      expect(preview).toEqual({
        Kind: 'row',
        Weight: 1,
        Children: [
          { Kind: 'panel', Weight: 0.75, Title: 'A', Icon: 'fa-solid fa-table' },
          { Kind: 'panel', Weight: 0.25, Title: 'B', Icon: 'fa-solid fa-table' },
        ],
      });
    });

    it('shares a column between fr sizes in proportion', () => {
      const preview = BuildDashboardLayoutPreview(saved(group('column', [stack([component('Top')], 1, 'fr'), stack([component('Bottom')], 3, 'fr')])));
      expect(preview).toEqual({
        Kind: 'column',
        Weight: 1,
        Children: [
          { Kind: 'panel', Weight: 0.25, Title: 'Top', Icon: 'fa-solid fa-table' },
          { Kind: 'panel', Weight: 0.75, Title: 'Bottom', Icon: 'fa-solid fa-table' },
        ],
      });
    });

    it('gives fr items the space the % items leave, like Golden Layout', () => {
      const preview = BuildDashboardLayoutPreview(
        saved(group('row', [stack([component('Half')], 50), stack([component('Q1')], 1, 'fr'), stack([component('Q2')], 1, 'fr')])),
      );
      expect(preview?.Kind === 'panel' ? [] : preview?.Children.map(c => c.Weight)).toEqual([0.5, 0.25, 0.25]);
    });

    it('gives fr items half again when the % items already take 100 or more, like Golden Layout', () => {
      const preview = BuildDashboardLayoutPreview(
        saved(group('row', [stack([component('A')], 80), stack([component('B')], 40), stack([component('C')], 1, 'fr')])),
      );
      // 80 : 40 : 50 of 170
      expect(preview?.Kind === 'panel' ? [] : preview?.Children.map(c => c.Weight)).toEqual([
        expect.closeTo(0.4706, 4),
        expect.closeTo(0.2353, 4),
        expect.closeTo(0.2941, 4),
      ]);
    });

    it('counts an item with no usable size as one fr', () => {
      const broken = { ...stack([component('No size')], 0), size: 'wide', sizeUnit: 'px' };
      const preview = BuildDashboardLayoutPreview(saved(group('row', [broken, stack([component('Two fr')], 2, 'fr')])));
      expect(preview?.Kind === 'panel' ? [] : preview?.Children.map(c => c.Weight)).toEqual([expect.closeTo(1 / 3, 6), expect.closeTo(2 / 3, 6)]);
    });

    it('keeps rows and columns nested, each with shares of its own parent', () => {
      const layout = group('row', [
        stack([component('Revenue', 'fa-solid fa-chart-line')], 40),
        group('column', [stack([component('Deals', 'fa-solid fa-database')], 1, 'fr'), stack([component('Churn')], 1, 'fr')], 60, '%'),
      ]);
      expect(BuildDashboardLayoutPreview(saved(layout))).toEqual({
        Kind: 'row',
        Weight: 1,
        Children: [
          { Kind: 'panel', Weight: 0.4, Title: 'Revenue', Icon: 'fa-solid fa-chart-line' },
          {
            Kind: 'column',
            Weight: 0.6,
            Children: [
              { Kind: 'panel', Weight: 0.5, Title: 'Deals', Icon: 'fa-solid fa-database' },
              { Kind: 'panel', Weight: 0.5, Title: 'Churn', Icon: 'fa-solid fa-table' },
            ],
          },
        ],
      });
    });

    it('shows a component that sits directly in a row, without a stack', () => {
      const preview = BuildDashboardLayoutPreview(saved(group('row', [component('Loose', null, 1, 'fr'), stack([component('Stacked')], 1, 'fr')])));
      expect(preview).toEqual({
        Kind: 'row',
        Weight: 1,
        Children: [
          { Kind: 'panel', Weight: 0.5, Title: 'Loose', Icon: null },
          { Kind: 'panel', Weight: 0.5, Title: 'Stacked', Icon: 'fa-solid fa-table' },
        ],
      });
    });

    it('shows a single stack at the root as one panel filling the preview', () => {
      expect(BuildDashboardLayoutPreview(saved(stack([component('Only')], 1, 'fr')))).toEqual({
        Kind: 'panel',
        Weight: 1,
        Title: 'Only',
        Icon: 'fa-solid fa-table',
      });
    });
  });

  describe('stacks', () => {
    const tabs = () => [component('First'), component('Second'), component('Third')];

    it("shows the stack's active item", () => {
      expect(BuildDashboardLayoutPreview(saved(stack(tabs(), 1, 'fr', 2)))).toMatchObject({ Kind: 'panel', Title: 'Third' });
    });

    it('shows the first item when the active item index is missing or out of range', () => {
      expect(BuildDashboardLayoutPreview(saved(stack(tabs(), 1, 'fr', null)))).toMatchObject({ Kind: 'panel', Title: 'First' });
      expect(BuildDashboardLayoutPreview(saved(stack(tabs(), 1, 'fr', 7)))).toMatchObject({ Kind: 'panel', Title: 'First' });
    });

    it('leaves out an empty stack and gives its space to the other items', () => {
      const preview = BuildDashboardLayoutPreview(saved(group('row', [stack([], 50), stack([component('Kept')], 50)])));
      expect(preview).toEqual({ Kind: 'row', Weight: 1, Children: [{ Kind: 'panel', Weight: 1, Title: 'Kept', Icon: 'fa-solid fa-table' }] });
    });
  });

  describe('titles and icons', () => {
    it("uses Golden Layout's item title when the panel has none, and no icon when the panel has none", () => {
      const item = { ...component('Tab title', null), componentState: { id: 'p1', partTypeId: 'pt-view', config: { type: 'View' } } };
      expect(BuildDashboardLayoutPreview(saved(stack([item], 1, 'fr')))).toEqual({ Kind: 'panel', Weight: 1, Title: 'Tab title', Icon: null });
    });

    it('gives a panel with no title anywhere an empty title', () => {
      const item = { type: 'component', componentState: 'not an object' };
      expect(BuildDashboardLayoutPreview(saved({ type: 'stack', content: [item] }))).toEqual({ Kind: 'panel', Weight: 1, Title: '', Icon: null });
    });
  });

  describe('no preview', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['an empty string', ''],
      ['spaces', '   '],
      ['invalid JSON', '{"layout": {'],
      ['a JSON string', '"text"'],
      ['a JSON array', '[]'],
      ['the empty object a Code dashboard saves', '{}'],
      ['the legacy tile format', '{"columns":4,"rowHeight":150,"resizable":true,"reorderable":true,"items":[]}'],
      [
        'the legacy tile format with a tile',
        '{"columns":4,"rowHeight":150,"resizable":true,"reorderable":true,"items":[{"type":"component","title":"Old tile","componentState":{"title":"Old tile"}}]}',
      ],
      ['a null layout', '{"layout":null,"settings":{"theme":"light"}}'],
      ['a layout with no root', '{"layout":{"openPopouts":[]},"settings":{}}'],
      ['a layout whose root is not an object', '{"layout":{"root":"row"},"settings":{}}'],
      ['a row whose content is not a list', '{"layout":{"root":{"type":"row","content":5}},"settings":{}}'],
      ['a stack whose content is not a list', '{"layout":{"root":{"type":"stack","content":5}},"settings":{}}'],
    ])('returns null for %s', (_label, details) => {
      expect(BuildDashboardLayoutPreview(details)).toBeNull();
    });

    it('returns null for a layout with no panels', () => {
      expect(BuildDashboardLayoutPreview(saved(group('row', [])))).toBeNull();
      expect(BuildDashboardLayoutPreview(saved(group('row', [stack([], 50), group('column', [stack([], 1, 'fr')], 50, '%')])))).toBeNull();
    });

    it('returns null for item types it does not know', () => {
      expect(BuildDashboardLayoutPreview(saved({ type: 'ground', content: [stack([component('A')], 1, 'fr')] }))).toBeNull();
    });
  });

  describe('limits', () => {
    it('draws at most 24 panels and leaves out the rest without an error', () => {
      const stacks = Array.from({ length: 30 }, (_unused, i) => stack([component(`P${i + 1}`)], 1, 'fr'));
      const preview = BuildDashboardLayoutPreview(saved(group('row', stacks)));
      const children = preview?.Kind === 'row' ? preview.Children : [];
      expect(children.map(c => (c.Kind === 'panel' ? c.Title : c.Kind))).toEqual(Array.from({ length: 24 }, (_unused, i) => `P${i + 1}`));
      expect(children.every(c => Math.abs(c.Weight - 1 / 24) < 1e-9)).toBe(true);
    });

    it('counts panels across nested groups toward the limit', () => {
      const column = (from: number) => group('column', Array.from({ length: 10 }, (_unused, i) => stack([component(`P${from + i}`)], 1, 'fr')));
      const preview = BuildDashboardLayoutPreview(saved(group('row', [column(1), column(11), column(21)])));
      const titles: string[] = [];
      const walk = (node: NonNullable<typeof preview>): void => {
        if (node.Kind === 'panel') titles.push(node.Title);
        else node.Children.forEach(walk);
      };
      if (preview) walk(preview);
      expect(titles).toEqual(Array.from({ length: 24 }, (_unused, i) => `P${i + 1}`));
    });

    it('leaves out panels nested deeper than the depth limit without an error', () => {
      let deep: object = stack([component('Deep')], 1, 'fr');
      for (let level = 0; level < 40; level++) {
        deep = group(level % 2 === 0 ? 'row' : 'column', [deep]);
      }
      const preview = BuildDashboardLayoutPreview(saved(group('row', [stack([component('Top')], 1, 'fr'), deep])));
      expect(preview).toEqual({ Kind: 'row', Weight: 1, Children: [{ Kind: 'panel', Weight: 1, Title: 'Top', Icon: 'fa-solid fa-table' }] });
    });
  });
});
