import { describe, expect, it } from 'vitest';
import { parsePanels } from '@/data/services/explorer';

/**
 * Parsing the layout MJ Explorer actually writes.
 *
 * `Dashboard.UIConfigDetails` holds Golden Layout's native `ResolvedLayoutConfig`. The mobile
 * parser had only ever been fed its own composer's simplified output, so these fixtures are shaped
 * like the real thing: components nested in `stack` nodes, `size`/`sizeUnit` instead of
 * width/height, `componentType` instead of `componentName`, and GL's `resolved: true` marker.
 *
 * There is no Golden Layout on a phone — no tabs, no drag, no split panes. The contract is
 * therefore narrower than the desktop's: find every panel, in order, and let the renderer stack
 * them. Losing one to an unrecognised wrapper is the failure that matters, because a dashboard
 * that renders three of its four panels looks like it worked.
 */

/** A component node in GL's resolved shape. */
const component = (id: string, panel: Record<string, unknown>) => ({
    type: 'component',
    size: 50, sizeUnit: 'fractional',
    id: '', maximised: false, isClosable: true, reorderEnabled: true,
    title: panel.title,
    componentType: 'dashboard-part',
    componentState: { id, ...panel },
});

/** GL wraps components in stacks — always, even a stack of one. */
const stack = (children: unknown[]) => ({
    type: 'stack', size: 50, sizeUnit: 'fractional',
    id: '', activeItemIndex: 0, title: '', content: children,
});

const resolved = (root: unknown) => JSON.stringify({
    layout: {
        resolved: true,
        root,
        openPopouts: [],
        settings: { constrainDragToContainer: true, reorderEnabled: true },
        dimensions: { borderWidth: 5, headerHeight: 30 },
        header: { show: 'top', popout: false },
    },
    settings: { theme: 'light', showHeaders: true },
});

const queryPanel = (title: string, queryId: string) =>
    ({ title, partTypeId: 'PT-QUERY', config: { type: 'Query', queryId } });

describe('parsePanels — Golden Layout resolved format', () => {
    it('finds components nested inside stacks', () => {
        // A walk that only descends rows and columns finds NOTHING in a real Explorer dashboard,
        // because GL puts every component in a stack.
        const json = resolved({
            type: 'row', size: 100, sizeUnit: 'fractional', content: [
                stack([component('p1', queryPanel('Active users', 'Q-1'))]),
                stack([component('p2', queryPanel('Runs today', 'Q-2'))]),
            ],
        });
        const panels = parsePanels(json);
        expect(panels.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('flattens a TABBED stack — two panels in one stack are both reachable', () => {
        // On a desktop these are tabs. A phone has no tabs, so both must appear in the list or one
        // is silently unreachable.
        const json = resolved({
            type: 'row', size: 100, sizeUnit: 'fractional', content: [
                stack([
                    component('p1', queryPanel('First tab', 'Q-1')),
                    component('p2', queryPanel('Second tab', 'Q-2')),
                ]),
            ],
        });
        expect(parsePanels(json).map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('preserves layout order through nested rows and columns', () => {
        // Order is the only layout information a stacked phone view can carry, so it has to be the
        // order the author arranged.
        const json = resolved({
            type: 'column', size: 100, sizeUnit: 'fractional', content: [
                { type: 'row', size: 50, sizeUnit: 'fractional', content: [
                    stack([component('p1', queryPanel('A', 'Q-1'))]),
                    stack([component('p2', queryPanel('B', 'Q-2'))]),
                ] },
                stack([component('p3', queryPanel('C', 'Q-3'))]),
            ],
        });
        expect(parsePanels(json).map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('reads the panel payload out of componentState', () => {
        const json = resolved({ type: 'row', size: 100, sizeUnit: 'fractional', content: [
            stack([component('p1', queryPanel('Active users', 'Q-1'))]),
        ] });
        const [panel] = parsePanels(json);
        expect(panel.title).toBe('Active users');
        expect(panel.partTypeId).toBe('PT-QUERY');
        expect(panel.config).toEqual({ type: 'Query', queryId: 'Q-1' });
    });

    it('returns nothing for content it cannot read, rather than throwing', () => {
        // A dashboard written by a client this app has never seen is not its to validate.
        expect(parsePanels('')).toEqual([]);
        expect(parsePanels('not json')).toEqual([]);
        expect(parsePanels('{"layout":null}')).toEqual([]);
        expect(parsePanels('{"layout":{"resolved":true,"root":null}}')).toEqual([]);
    });

    it('still reads the simplified tree the mobile composer writes', () => {
        // Both shapes have to work — the composer's output is not GL-resolved, and a dashboard made
        // on a phone must reopen on a phone.
        const json = JSON.stringify({ layout: { root: { type: 'column', content: [
            { type: 'row', content: [
                { type: 'component', componentName: 'dashboard-part',
                  componentState: { id: 'part-1', title: 'A', partTypeId: 'PT-QUERY',
                                    config: { type: 'Query', queryId: 'Q-1' } } },
            ] },
        ] } } });
        expect(parsePanels(json).map((p) => p.id)).toEqual(['part-1']);
    });
});
