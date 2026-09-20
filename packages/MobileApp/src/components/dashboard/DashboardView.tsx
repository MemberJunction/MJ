import { useMemo, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Icons } from '@/components/Icon';
import { Chart } from '@/components/charts/Chart';
import type { ChartDatum, ChartSpec } from '@/components/charts/chart-spec';
import { useDashboard, useQueryRun } from '@/hooks/useExplorer';
import type { DashboardPart, QueryRunResult } from '@/data/services/explorer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * @fileoverview Renders one MJ dashboard, chrome-free, so more than one surface can host it.
 *
 * This is deliberately not a screen. The same dashboard is reachable two ways — as its own route
 * from the Explorer browser, and as a nav item inside a hosted application's tab shell — and those
 * two hosts want different chrome around identical content. Keeping the rendering here and the
 * chrome in the host is what lets the app shell render a `Dashboards` nav item for real instead of
 * telling the user to open a desktop.
 */

/** What a host needs to draw its own header for the dashboard being rendered. */
export type DashboardHeaderState = {
    /** The dashboard's name, or a placeholder while it loads. */
    Name: string;
    /** Part count and last-updated date, pre-formatted. */
    Subtitle: string;
};

/**
 * Renders a dashboard's parts, stacked for a phone.
 *
 * Desktop-authored dashboards contain panels that genuinely do not belong on a phone — embedded web
 * content, dense entity grids — so those render an honest placeholder with an "Open on desktop"
 * link rather than a degraded imitation. Query panels are auto-classified into KPI tiles, a bar
 * chart, or a compact table by {@link analyzeResult}.
 *
 * @param id The `MJ: Dashboards` record id.
 * @param renderHeader Optional chrome, given the loaded dashboard's name and subtitle. Hosts that
 *   already have a header (an application tab shell) omit it.
 */
export function DashboardView({
    id,
    renderHeader,
}: {
    id: string;
    renderHeader?: (state: DashboardHeaderState) => ReactNode;
}) {
    const { dashboard, loading, error } = useDashboard(id);

    const subtitle = useMemo(() => {
        if (!dashboard) return 'Loading…';
        const count = `${dashboard.parts.length} part${dashboard.parts.length === 1 ? '' : 's'}`;
        const when = dashboard.updatedAt ? ` · updated ${dashboard.updatedAt.toLocaleDateString()}` : '';
        return `${count}${when}`;
    }, [dashboard]);

    return (
        <>
            {renderHeader?.({ Name: dashboard?.name ?? 'Dashboard', Subtitle: subtitle })}

            {dashboard && dashboard.desktopOnlyCount > 0 ? (
                <View style={styles.notice}>
                    <View style={{ marginTop: 1 }}>
                        <Icons.Sparkle size={14} color={Colors.warn} strokeWidth={2.2} />
                    </View>
                    <Text style={styles.noticeText}>
                        Some dashboard parts are built for larger screens. Tap "Open on desktop" to view them in your browser.
                    </Text>
                </View>
            ) : null}

            {loading && !dashboard ? (
                <View style={styles.loadingBlock}><ActivityIndicator color={Colors.brand} /></View>
            ) : error ? (
                <View style={styles.loadingBlock}><Text style={styles.errorText}>{error.message}</Text></View>
            ) : !dashboard ? (
                <View style={styles.loadingBlock}><Text style={styles.errorText}>Dashboard not found.</Text></View>
            ) : dashboard.parts.length === 0 ? (
                <View style={styles.loadingBlock}>
                    <View style={styles.emptyIcon}>
                        <Icons.Sparkle size={22} color={Colors.brand} strokeWidth={2} />
                    </View>
                    <Text style={styles.emptyTitle}>Optimized for desktop</Text>
                    <Text style={styles.emptyBody}>
                        This dashboard is built as a full-screen desktop experience, so it has no
                        stacked panels to show here. Open it in the MemberJunction web app for the
                        complete view.
                    </Text>
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.body}>
                    {dashboard.parts.map((part) => (
                        <PartCard key={part.id} part={part} />
                    ))}
                </ScrollView>
            )}
        </>
    );
}

/** Dispatch a dashboard part to its renderer by kind. */
function PartCard({ part }: { part: DashboardPart }) {
    switch (part.kind) {
        case 'query':
            return <QueryPart part={part} />;
        case 'artifact':
            return <ArtifactPart part={part} />;
        case 'view':
        case 'weburl':
        case 'unknown':
        default:
            return <DesktopOnlyPart part={part} />;
    }
}

/** A query part: runs the query and renders KPI / chart / table. */
function QueryPart({ part }: { part: DashboardPart }) {
    const queryId = typeof part.config.queryId === 'string' ? part.config.queryId : undefined;
    const { result, loading } = useQueryRun(queryId);
    const { width } = useWindowDimensions();
    const chartWidth = width - 72;

    if (!queryId) return <DesktopOnlyPart part={part} />;

    return (
        <Panel title={part.title}>
            {loading && !result ? (
                <View style={styles.partLoading}><ActivityIndicator color={Colors.brand} /></View>
            ) : !result || !result.success ? (
                <Text style={styles.partError}>{result?.errorMessage ?? 'Query failed.'}</Text>
            ) : (
                <QueryResultView result={result} width={chartWidth} />
            )}
        </Panel>
    );
}

/** Render a query result as the best-fitting native view. */
function QueryResultView({ result, width }: { result: QueryRunResult; width: number }) {
    const view = useMemo(() => analyzeResult(result), [result]);
    switch (view.mode) {
        case 'empty':
            return <Text style={styles.partEmpty}>No rows returned.</Text>;
        case 'kpi':
            return (
                <View style={styles.kpiGrid}>
                    {view.tiles.map((tile) => (
                        <View key={tile.label} style={styles.kpi}>
                            <Text style={styles.kpiLabel}>{tile.label.toUpperCase()}</Text>
                            <Text style={styles.kpiValue}>{tile.value}</Text>
                        </View>
                    ))}
                </View>
            );
        case 'chart':
            return <Chart spec={view.spec} width={width} />;
        case 'table':
        default:
            return <ResultTable columns={view.columns} rows={view.rows} />;
    }
}

/**
 * Tabular query results, stacked as one card per row.
 *
 * This WAS a horizontally-scrolling grid showing the first four columns. On a phone that produced
 * exactly what you would expect: a row of GUIDs, each clipped mid-value, with the columns that
 * actually meant something pushed off the right edge. The reader could see that data existed and
 * not what it was.
 *
 * Stacking label above value is the same decision the Data artifact renderer makes, and for the
 * same reason — it is the only layout where a wide row stays readable without panning. A wide
 * result becomes a taller card rather than an unreadable one.
 */
function ResultTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
    // Six, not four: the constraint is vertical now, and cutting columns is throwing away the
    // answer. The cap only exists to keep one panel from dominating the dashboard.
    const cols = columns.slice(0, 6);
    return (
        <View style={styles.rowCards}>
            {rows.slice(0, 5).map((row, r) => (
                <View key={r} style={styles.rowCard}>
                    {cols.map((c) => (
                        <View key={c} style={styles.rowField}>
                            <Text style={styles.rowFieldLabel} numberOfLines={1}>{c}</Text>
                            <Text style={styles.rowFieldValue} numberOfLines={2}>{formatCell(row[c])}</Text>
                        </View>
                    ))}
                </View>
            ))}
            {rows.length > 5 ? (
                <Text style={styles.rowCardsMore}>
                    +{rows.length - 5} more row{rows.length - 5 === 1 ? '' : 's'}
                </Text>
            ) : null}
        </View>
    );
}

/** An artifact part: links into the artifact viewer (which renders the payload). */
function ArtifactPart({ part }: { part: DashboardPart }) {
    const artifactId = typeof part.config.artifactId === 'string' ? part.config.artifactId : undefined;
    if (!artifactId) return <DesktopOnlyPart part={part} />;
    return (
        <Panel title={part.title}>
            <Pressable
                style={styles.artifactRow}
                onPress={() => router.push({ pathname: '/artifact/[id]', params: { id: artifactId } })}
            >
                <View style={styles.artifactIcon}>
                    <Icons.Database size={18} color={Colors.brand} strokeWidth={2.2} />
                </View>
                <Text style={styles.artifactText}>Open artifact</Text>
                <Icons.ChevronRight size={16} color={Colors.ink3} strokeWidth={2} />
            </Pressable>
        </Panel>
    );
}

/** A placeholder card for parts that render best on desktop. */
function DesktopOnlyPart({ part }: { part: DashboardPart }) {
    const url = typeof part.config.url === 'string' ? part.config.url : undefined;
    const entityName = typeof part.config.entityName === 'string' ? part.config.entityName : undefined;
    return (
        <Panel title={part.title}>
            <View style={styles.stub}>
                <Text style={styles.stubLabel}>OPTIMIZED FOR DESKTOP</Text>
                <Text style={styles.stubName}>{describePart(part, entityName)}</Text>
                <Text style={styles.stubHint}>This {part.typeName.toLowerCase()} panel renders best on a larger screen.</Text>
                <Pressable style={styles.stubBtn} onPress={() => openTarget(url)}>
                    <Icons.ChevronRight size={11} color={Colors.brand} strokeWidth={2.2} />
                    <Text style={styles.stubBtnText}>Open on desktop</Text>
                </Pressable>
            </View>
        </Panel>
    );
}

/** Card wrapper with an uppercase title header. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={styles.panel}>
            <View style={styles.panelHead}>
                <Text style={styles.panelTitle} numberOfLines={1}>{title.toUpperCase()}</Text>
            </View>
            {children}
        </View>
    );
}

// ---------------------------------------------------------------------------
// Query-result analysis
// ---------------------------------------------------------------------------

type KpiTile = { label: string; value: string };
type QueryView =
    | { mode: 'empty' }
    | { mode: 'kpi'; tiles: KpiTile[] }
    | { mode: 'chart'; spec: ChartSpec }
    | { mode: 'table'; columns: string[]; rows: Record<string, unknown>[] };

/** Coerce a cell to a finite number, or null. */
function toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

/** Columns whose sampled values are all numeric. */
function numericColumns(columns: string[], rows: Record<string, unknown>[]): string[] {
    return columns.filter((c) => rows.length > 0 && rows.every((r) => toNumber(r[c]) !== null));
}

/**
 * Choose the best native representation for a query result:
 * single row → KPI tiles; a label + value column with a handful of rows →
 * bar chart; otherwise a compact table.
 */
function analyzeResult(result: QueryRunResult): QueryView {
    const { columns, rows } = result;
    if (rows.length === 0 || columns.length === 0) return { mode: 'empty' };

    const numeric = numericColumns(columns, rows);

    if (rows.length === 1) {
        const cols = numeric.length > 0 ? numeric : columns;
        const tiles = cols.slice(0, 4).map((c) => ({ label: c, value: formatCell(rows[0][c]) }));
        return { mode: 'kpi', tiles };
    }

    const labelCol = columns.find((c) => !numeric.includes(c));
    if (labelCol && numeric.length > 0 && rows.length <= 12) {
        const valueCol = numeric[0];
        const data: ChartDatum[] = rows.map((r) => ({ label: String(r[labelCol] ?? ''), value: toNumber(r[valueCol]) ?? 0 }));
        return { mode: 'chart', spec: { kind: 'bar', data } };
    }

    return { mode: 'table', columns, rows };
}

/** Format a raw cell value for display. */
function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
        const abs = Math.abs(value);
        if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
        if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    }
    return String(value);
}

/** A human description of a placeholder part. */
function describePart(part: DashboardPart, entityName: string | undefined): string {
    if (part.kind === 'view') return entityName ? `${entityName} view` : 'Entity view';
    if (part.kind === 'weburl') return 'Embedded web content';
    return `${part.typeName} panel`;
}

/** Open a desktop target URL if one is configured. */
function openTarget(url: string | undefined): void {
    if (!url) return;
    Linking.openURL(url).catch(() => {
        // Non-fatal: nothing else to do for an unopenable link.
    });
}

const styles = StyleSheet.create({
    notice: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', margin: 16, marginBottom: 0, padding: 12, backgroundColor: Colors.warnSoft, borderWidth: 1, borderColor: Colors.warn, borderRadius: 12 },
    noticeText: { flex: 1, fontSize: 12.5, color: Colors.warn, lineHeight: 17 },

    loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    errorText: { fontSize: 13, color: Colors.danger, textAlign: 'center' },
    emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 16, fontWeight: Type.semibold, color: Colors.ink, marginBottom: 6 },
    emptyBody: { fontSize: 13, color: Colors.ink3, textAlign: 'center', lineHeight: 19, maxWidth: 300 },

    body: { padding: 14, paddingBottom: 40 },
    panel: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 16, padding: 14, marginBottom: 10, ...Shadow.card },
    panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    panelTitle: { flex: 1, fontSize: 13, fontWeight: '700', letterSpacing: 0.5, color: Colors.ink3 },

    partLoading: { paddingVertical: 20, alignItems: 'center' },
    partError: { fontSize: 12.5, color: Colors.danger },
    partEmpty: { fontSize: 12.5, color: Colors.ink3 },

    kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    kpi: { width: '47%', backgroundColor: Colors.surface2, borderRadius: 10, padding: 12 },
    kpiLabel: { fontSize: 10.5, color: Colors.ink3, fontWeight: Type.semibold, letterSpacing: 0.8 },
    kpiValue: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: Colors.ink, marginTop: 4 },

    rowCards: { gap: 8 },
    rowCard: {
        backgroundColor: Colors.surface2,
        borderRadius: Radius.md,
        padding: 11,
        gap: 7,
    },
    rowField: { gap: 1 },
    rowFieldLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: Colors.ink3, textTransform: 'uppercase' },
    rowFieldValue: { fontSize: 13.5, color: Colors.ink, lineHeight: 18 },
    rowCardsMore: { fontSize: 12, color: Colors.ink3, paddingTop: 2 },
    table: { borderWidth: 1, borderColor: Colors.line2, borderRadius: Radius.sm, overflow: 'hidden' },
    tableRow: { flexDirection: 'row' },
    tableHeaderRow: { backgroundColor: Colors.surface2 },
    tableCell: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 0.5, borderColor: Colors.line2, minWidth: 96, fontSize: 12, color: Colors.ink2 },
    tableHeadCell: { fontWeight: Type.semibold, color: Colors.ink },

    artifactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface2, borderRadius: 10, padding: 12 },
    artifactIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: Colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
    artifactText: { flex: 1, fontSize: 13.5, fontWeight: Type.medium, color: Colors.ink },

    stub: { backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.line2, borderStyle: 'dashed', borderRadius: 12, padding: 28, alignItems: 'center' },
    stubLabel: { fontSize: 11, color: Colors.ink3, fontWeight: '700', letterSpacing: 1.4 },
    stubName: { fontSize: 14.5, fontWeight: Type.semibold, marginTop: 8, color: Colors.ink, textAlign: 'center' },
    stubHint: { fontSize: 12, color: Colors.ink3, marginTop: 4, textAlign: 'center', lineHeight: 17 },
    stubBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 14, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
    stubBtnText: { fontSize: 12.5, fontWeight: Type.semibold, color: Colors.brand },
});
