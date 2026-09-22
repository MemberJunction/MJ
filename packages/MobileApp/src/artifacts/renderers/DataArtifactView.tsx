import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NormalizeToTables, type DataTable } from '@memberjunction/core';
import { Icons } from '@/components/Icon';
import { HighlightCode } from '@/components/markdown/highlight';
import { Colors, Radius, Type } from '@/theme/tokens';
import type { MobileArtifactRendererProps } from '../BaseMobileArtifactRenderer';

/**
 * @fileoverview The Data artifact — what the query builder produces.
 *
 * ## Reuse
 *
 * The shape is not parsed here. `NormalizeToTables` in `@memberjunction/core` already collapses
 * both forms this artifact takes — the multi-table `tables[]` snapshot and the legacy single-table
 * Query Builder JSON with root-level `rows`/`columns` — into one `DataTable[]`. It is pure
 * TypeScript in core, so mobile uses it directly and cannot disagree with the web about what a row
 * is. Only the drawing is here.
 *
 * ## Why this does not draw a grid
 *
 * The web renders a data grid with sortable, resizable columns. A 9-column grid on a 390pt screen
 * is a horizontal scrollbar with a table hidden behind it, so this stacks each row as a card of
 * label/value pairs — the same decision every mobile database client makes, and the reason you can
 * actually read a row without panning. Wide results stay wide: a table with many columns is a long
 * card rather than an unreadable one.
 *
 * Column ORDER is honoured exactly as the artifact declares it, because that order is the answer
 * the query was asked to produce.
 */

/** How many rows render before the list asks to be expanded. */
const INITIAL_ROWS = 12;

/** The display label for a column, across both the current and legacy artifact spellings. */
function ColumnLabel(col: unknown, fallback: string): string {
    const c = col as { displayName?: unknown; headerName?: unknown; name?: unknown } | null;
    for (const v of [c?.displayName, c?.headerName, c?.name]) {
        if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return fallback;
}

/** The field a column reads. */
function ColumnField(col: unknown, index: number): string {
    const c = col as { name?: unknown; field?: unknown } | null;
    for (const v of [c?.name, c?.field]) {
        if (typeof v === 'string' && v.trim().length > 0) return v;
    }
    return String(index);
}

/**
 * Renders a cell value as text.
 *
 * Nulls print as an em dash rather than "null" — a blank cell is a fact about the data, not a
 * JavaScript value the reader should have to translate.
 */
function CellText(value: unknown): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
}

/** Renders one `DataTable` as a stack of row cards. */
function TableView({ Table }: { Table: DataTable }) {
    const [expanded, setExpanded] = useState(false);
    const rows = Table.rows ?? [];
    const shown = expanded ? rows : rows.slice(0, INITIAL_ROWS);

    // An artifact may declare columns, or leave them implied by the first row's keys.
    const columns = useMemo(() => {
        const declared = (Table.columns ?? []) as unknown[];
        if (declared.length > 0) {
            return declared.map((c, i) => ({ Field: ColumnField(c, i), Label: ColumnLabel(c, ColumnField(c, i)) }));
        }
        const first = rows[0] as Record<string, unknown> | undefined;
        return Object.keys(first ?? {}).map((k) => ({ Field: k, Label: k }));
    }, [Table.columns, rows]);

    if (rows.length === 0) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>This query returned no rows.</Text>
            </View>
        );
    }

    return (
        <View style={styles.tableBlock}>
            {shown.map((row, idx) => (
                <View key={idx} style={styles.rowCard}>
                    {columns.map((col) => (
                        <View key={col.Field} style={styles.cell}>
                            <Text style={styles.cellLabel} numberOfLines={1}>{col.Label}</Text>
                            <Text style={styles.cellValue} selectable>
                                {CellText((row as Record<string, unknown>)[col.Field])}
                            </Text>
                        </View>
                    ))}
                </View>
            ))}

            {rows.length > INITIAL_ROWS ? (
                <Pressable
                    style={styles.moreBtn}
                    accessibilityRole="button"
                    onPress={() => setExpanded((v) => !v)}
                >
                    <Text style={styles.moreText}>
                        {expanded ? 'Show fewer' : `Show all ${rows.length} rows`}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/** A collapsible block — used for the SQL and the plan, which are reference, not headline. */
function Disclosure({ Title, children }: { Title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <View style={styles.disclosure}>
            <Pressable
                style={styles.disclosureHead}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                onPress={() => setOpen((v) => !v)}
            >
                <Text style={styles.disclosureTitle}>{Title}</Text>
                {open
                    ? <Icons.ChevronUp size={16} color={Colors.ink3} strokeWidth={2} />
                    : <Icons.ChevronDown size={16} color={Colors.ink3} strokeWidth={2} />}
            </Pressable>
            {open ? <View style={styles.disclosureBody}>{children}</View> : null}
        </View>
    );
}

/**
 * Renders a Data artifact: its interpretation, its tables, and the SQL behind them.
 *
 * @param Content The raw artifact version content (JSON).
 */
export function DataArtifactView({ Content }: MobileArtifactRendererProps) {
    const parsed = useMemo(() => {
        try {
            return JSON.parse(Content) as Record<string, unknown>;
        } catch {
            return null;
        }
    }, [Content]);

    const tables = useMemo(() => (parsed ? NormalizeToTables(parsed) : []), [parsed]);

    if (!parsed) {
        return (
            <View style={styles.empty}>
                <Text style={styles.emptyText}>This artifact&apos;s content is not valid JSON.</Text>
            </View>
        );
    }

    const interpretation = typeof parsed.interpretation === 'string' ? parsed.interpretation : null;
    const plan = typeof parsed.plan === 'string' ? parsed.plan : null;
    const meta = (parsed.metadata ?? {}) as { sql?: unknown; rowCount?: unknown; executionTimeMs?: unknown };
    const sql = typeof meta.sql === 'string' ? meta.sql : null;

    return (
        <View style={styles.root}>
            {/* The agent's reading of the result comes first — it is the answer; the rows are the
                evidence. */}
            {interpretation ? <Text style={styles.interpretation}>{interpretation}</Text> : null}

            {tables.map((table, i) => (
                <View key={table.name ?? i} style={styles.table}>
                    {tables.length > 1 || table.name ? (
                        <Text style={styles.tableName}>{table.name ?? `Table ${i + 1}`}</Text>
                    ) : null}
                    <Text style={styles.tableMeta}>
                        {(table.rows ?? []).length} row{(table.rows ?? []).length === 1 ? '' : 's'}
                        {typeof meta.executionTimeMs === 'number' ? ` · ${meta.executionTimeMs} ms` : ''}
                    </Text>
                    <TableView Table={table} />
                </View>
            ))}

            {plan ? (
                <Disclosure Title="How this was built">
                    <Text style={styles.planText}>{plan}</Text>
                </Disclosure>
            ) : null}

            {sql ? (
                <Disclosure Title="SQL">
                    <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator>
                        {/* Same highlighter fenced code uses, so SQL here reads as SQL there. */}
                        <Text style={styles.sqlText}>
                            {HighlightCode(sql, 'sql').map((run, i) => (
                                <Text key={i} style={{ color: run.color }}>{run.text}</Text>
                            ))}
                        </Text>
                    </ScrollView>
                </Disclosure>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 14 },
    interpretation: { fontSize: 15, color: Colors.ink, lineHeight: 22 },

    table: { gap: 6 },
    tableName: { fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, color: Colors.ink3, textTransform: 'uppercase' },
    tableMeta: { fontSize: 12, color: Colors.ink3 },
    tableBlock: { gap: 8 },

    rowCard: {
        backgroundColor: Colors.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
        padding: 12,
        gap: 8,
    },
    cell: { gap: 2 },
    cellLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: Colors.ink3, textTransform: 'uppercase' },
    cellValue: { fontSize: 14.5, color: Colors.ink, lineHeight: 20 },

    moreBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 2 },
    moreText: { fontSize: 13.5, fontWeight: Type.semibold, color: Colors.brand },

    empty: { paddingVertical: 20 },
    emptyText: { fontSize: 14, color: Colors.ink3 },

    disclosure: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: Colors.line2,
        borderRadius: Radius.lg,
        backgroundColor: Colors.surface,
        overflow: 'hidden',
    },
    disclosureHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
    disclosureTitle: { fontSize: 13, fontWeight: Type.semibold, color: Colors.ink },
    disclosureBody: { paddingHorizontal: 12, paddingBottom: 12 },
    planText: { fontSize: 13.5, color: Colors.ink2, lineHeight: 20 },
    sqlText: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12.5, lineHeight: 19 },
});
