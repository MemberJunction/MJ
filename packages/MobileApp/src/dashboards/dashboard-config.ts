/**
 * @fileoverview Writing the dashboard layout MJ already reads.
 *
 * ## Why this shape and not a simpler one
 *
 * `Dashboard.UIConfigDetails` holds a Golden Layout tree: `{ layout: { root } }`, where each
 * component node carries its panel in `componentState` as `{ id, title, partTypeId, config }`.
 * That is what MJ Explorer writes and what this app's own `LoadDashboard` already parses.
 *
 * A dashboard created on a phone therefore writes the SAME tree rather than a mobile-shaped one.
 * The alternative — a simpler mobile format with a converter — produces a dashboard that only one
 * client can open, which defeats the point of building it from metadata at all. The layout is
 * generated rather than dragged, because a phone has no room for a drag-and-drop canvas; the rows
 * and columns it emits are ordinary Golden Layout and the desktop can rearrange them.
 *
 * Pure, and free of any React Native or MJ-entity import, so the thing that has to stay compatible
 * with another client is directly testable.
 */

/** `MJ: Dashboard Part Types` id for a Query panel. */
export const QUERY_PART_TYPE_ID = '0EBDB415-EE18-46D4-B12E-03F3770921BA';

/** `MJ: Dashboard Part Types` id for an Artifact panel. */
export const ARTIFACT_PART_TYPE_ID = '7191FBEE-C686-4D5F-94BA-1B4C6BF700C5';

/**
 * One panel a user picked for their dashboard.
 *
 * A panel is either a saved query or an artifact. Artifacts matter here because an agent-authored
 * interactive component IS an artifact — putting one on a dashboard is how a chart with a
 * drill-down stops being something you open from a chat thread and starts being something you
 * check.
 */
export type DashboardPanelSpec = {
    /** `MJ: Queries.ID` when the panel runs a query. */
    QueryID?: string;
    /** `MJ: Conversation Artifacts.ID` when the panel shows an artifact. */
    ArtifactID?: string;
    /** Panel heading. */
    Title: string;
};

/** A Golden Layout node, narrowed to what is written here. */
type LayoutNode = {
    type: 'row' | 'column' | 'stack' | 'component';
    content?: LayoutNode[];
    title?: string;
    width?: number;
    height?: number;
    componentName?: string;
    componentState?: unknown;
};

/**
 * How many panels sit side by side on a desktop row.
 *
 * Two, because a dashboard of one-per-row reads as a list rather than a dashboard when it is opened
 * on a desktop, and three columns makes each panel too narrow for a chart. A phone stacks every
 * panel regardless — this number only shapes what the desktop inherits.
 */
const PANELS_PER_ROW = 2;

/** Builds the component node for one panel. */
function ComponentNode(panel: DashboardPanelSpec, index: number): LayoutNode {
    const isArtifact = typeof panel.ArtifactID === 'string' && panel.ArtifactID.length > 0;
    return {
        type: 'component',
        componentName: 'dashboard-part',
        title: panel.Title,
        componentState: {
            id: `part-${index + 1}`,
            title: panel.Title,
            partTypeId: isArtifact ? ARTIFACT_PART_TYPE_ID : QUERY_PART_TYPE_ID,
            // `type` duplicates the part type by NAME because `LoadDashboard` falls back to it when
            // the part-type lookup is unavailable — a dashboard should still open if that read fails.
            config: isArtifact
                ? { type: 'Artifact', artifactId: panel.ArtifactID }
                : { type: 'Query', queryId: panel.QueryID },
        },
    };
}

/**
 * Builds the `UIConfigDetails` value for a set of panels.
 *
 * @param panels The panels, in the order the user arranged them.
 * @returns A JSON string ready for `Dashboard.UIConfigDetails`.
 */
export function BuildDashboardConfig(panels: readonly DashboardPanelSpec[]): string {
    const rows: LayoutNode[] = [];
    for (let i = 0; i < panels.length; i += PANELS_PER_ROW) {
        const slice = panels.slice(i, i + PANELS_PER_ROW);
        rows.push({
            type: 'row',
            content: slice.map((p, j) => ComponentNode(p, i + j)),
        });
    }

    return JSON.stringify({
        // `settings` and `dimensions` are Golden Layout's own defaults. Writing them explicitly
        // means a desktop opening this dashboard does not have to infer them.
        layout: {
            settings: { hasHeaders: true, showPopoutIcon: false, showCloseIcon: true },
            root: rows.length === 0
                ? { type: 'column', content: [] }
                : { type: 'column', content: rows },
        },
    });
}

/**
 * Reads the panels out of a config, in layout order.
 *
 * The inverse of {@link BuildDashboardConfig}, used to reopen a dashboard for editing without
 * re-deriving the panel list from the rendered parts.
 *
 * Tolerant: anything unparseable yields an empty list rather than throwing, because a dashboard
 * written by another client is not this app's to validate.
 *
 * @param uiConfigDetails The stored `UIConfigDetails` value.
 */
export function ReadDashboardQueryIDs(uiConfigDetails: string | null | undefined): DashboardPanelSpec[] {
    if (!uiConfigDetails?.trim()) return [];
    try {
        const parsed = JSON.parse(uiConfigDetails) as { layout?: { root?: LayoutNode } };
        const out: DashboardPanelSpec[] = [];
        const visit = (node: LayoutNode | undefined): void => {
            if (!node) return;
            if (node.type === 'component') {
                const state = node.componentState as
                    | { title?: unknown; config?: { queryId?: unknown; artifactId?: unknown } }
                    | undefined;
                const title = typeof state?.title === 'string' ? state.title : 'Panel';
                const queryId = state?.config?.queryId;
                const artifactId = state?.config?.artifactId;
                if (typeof queryId === 'string' && queryId.length > 0) {
                    out.push({ QueryID: queryId, Title: title });
                } else if (typeof artifactId === 'string' && artifactId.length > 0) {
                    out.push({ ArtifactID: artifactId, Title: title });
                }
            }
            node.content?.forEach(visit);
        };
        visit(parsed.layout?.root);
        return out;
    } catch {
        return [];
    }
}
