import { describe, expect, it } from 'vitest';
import {
    BuildDashboardConfig,
    ReadDashboardQueryIDs,
    QUERY_PART_TYPE_ID,
} from '@/dashboards/dashboard-config';

/**
 * A dashboard built on a phone has to open on a desktop.
 *
 * `Dashboard.UIConfigDetails` is a Golden Layout tree that MJ Explorer writes and that this app's
 * own `LoadDashboard` parses. Writing a simpler mobile-shaped config with a converter would
 * produce dashboards only one client can open, which defeats building them from metadata at all.
 * These tests pin the shape against the parser that has to read it.
 */

const panels = [
    { QueryID: 'Q-1', Title: 'Active users' },
    { QueryID: 'Q-2', Title: 'Runs today' },
    { QueryID: 'Q-3', Title: 'Errors' },
];

/** The same walk `LoadDashboard` performs, so the assertions test compatibility, not a rewording. */
function collectComponentStates(json: string): Array<Record<string, unknown>> {
    const parsed = JSON.parse(json) as { layout?: { root?: unknown } };
    const out: Array<Record<string, unknown>> = [];
    const visit = (node: unknown): void => {
        if (!node || typeof node !== 'object') return;
        const n = node as { type?: string; content?: unknown[]; componentState?: unknown };
        if (n.type === 'component' && n.componentState && typeof n.componentState === 'object') {
            out.push(n.componentState as Record<string, unknown>);
        }
        if (Array.isArray(n.content)) n.content.forEach(visit);
    };
    visit(parsed.layout?.root);
    return out;
}

describe('BuildDashboardConfig', () => {
    it('writes a layout the existing parser finds every panel in', () => {
        const states = collectComponentStates(BuildDashboardConfig(panels));
        expect(states).toHaveLength(3);
        expect(states.map((s) => (s.config as { queryId: string }).queryId)).toEqual(['Q-1', 'Q-2', 'Q-3']);
    });

    it('stamps the Query part type on every panel', () => {
        // The parser resolves a part type by id first; a wrong or missing id degrades the panel to
        // "desktop-optimized" and the dashboard silently renders nothing useful.
        for (const s of collectComponentStates(BuildDashboardConfig(panels))) {
            expect(s.partTypeId).toBe(QUERY_PART_TYPE_ID);
        }
    });

    it('also names the type in config, so a failed part-type lookup does not blank the dashboard', () => {
        for (const s of collectComponentStates(BuildDashboardConfig(panels))) {
            expect((s.config as { type: string }).type).toBe('Query');
        }
    });

    it('gives every panel a distinct id', () => {
        const ids = collectComponentStates(BuildDashboardConfig(panels)).map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('lays panels out two to a row, so a desktop inherits a dashboard and not a list', () => {
        const parsed = JSON.parse(BuildDashboardConfig(panels)) as
            { layout: { root: { content: Array<{ type: string; content: unknown[] }> } } };
        const rows = parsed.layout.root.content;
        expect(rows.map((r) => r.type)).toEqual(['row', 'row']);
        expect(rows[0].content).toHaveLength(2);
        expect(rows[1].content).toHaveLength(1);
    });

    it('writes a valid empty dashboard rather than malformed JSON', () => {
        const parsed = JSON.parse(BuildDashboardConfig([])) as { layout: { root: { content: unknown[] } } };
        expect(parsed.layout.root.content).toEqual([]);
        expect(collectComponentStates(BuildDashboardConfig([]))).toEqual([]);
    });
});

describe('ReadDashboardQueryIDs', () => {
    it('round-trips what BuildDashboardConfig wrote, in order', () => {
        expect(ReadDashboardQueryIDs(BuildDashboardConfig(panels))).toEqual(panels);
    });

    it('returns nothing for content it cannot read, rather than throwing', () => {
        // A dashboard written by another client is not this app's to validate.
        expect(ReadDashboardQueryIDs(null)).toEqual([]);
        expect(ReadDashboardQueryIDs('')).toEqual([]);
        expect(ReadDashboardQueryIDs('not json')).toEqual([]);
        expect(ReadDashboardQueryIDs('{"layout":{}}')).toEqual([]);
    });

    it('ignores component panels that are not queries', () => {
        const mixed = JSON.stringify({
            layout: { root: { type: 'column', content: [
                { type: 'component', componentState: { title: 'A web page', config: { type: 'WebURL', url: 'x' } } },
                { type: 'component', componentState: { title: 'Runs', config: { type: 'Query', queryId: 'Q-9' } } },
            ] } },
        });
        expect(ReadDashboardQueryIDs(mixed)).toEqual([{ QueryID: 'Q-9', Title: 'Runs' }]);
    });
});
