import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { HtmlRenderer } from '@/components/artifacts/html-renderer';
import { Chart } from '@/components/charts/Chart';
import { HighlightCode } from '@/components/markdown/highlight';
import type { LoadedArtifact } from '@/data/services/artifacts';
import { DesktopFallback } from '@/interactive/InteractiveComponentRenderer';
import { ComponentRenderer } from '@/interactive/ComponentRenderer';
import { ResolveMobileArtifactRenderer } from '@/artifacts/BaseMobileArtifactRenderer';
import { Colors, Radius, Shadow, Type } from '@/theme/tokens';

/**
 * @fileoverview Rendering an artifact's CONTENT, wherever it is being shown.
 *
 * Extracted from the artifact detail route because a dashboard panel needs the same thing. A
 * dashboard whose artifact part renders "Open artifact" as a link is not showing you the artifact —
 * it is showing you a door to it, and a dashboard exists precisely so you do not have to open
 * things one at a time. Both surfaces now dispatch through one function, so an interactive
 * component drawn in a thread and the same component drawn on a dashboard cannot diverge.
 *
 * Chrome stays with the host: the detail route keeps its header and bottom bar, the dashboard panel
 * keeps its card. Only the content is shared.
 */

/** Horizontal padding a host applies around this content, used to size charts. */
const BODY_PADDING = 16;

/**
 * Dispatches a loaded artifact to its renderer.
 *
 * A REGISTERED renderer wins, resolved by artifact type name the same way `ng-conversations`
 * resolves its viewer plugins — so an artifact type added to MJ metadata reaches a renderer by
 * registration rather than by someone extending a sniffing heuristic.
 *
 * The `kind` switch below remains as the fallback for the types that have not moved onto the
 * registry yet. It classifies by looking at the content, which works and is honest about being a
 * guess, but it is not a contract.
 */
export function ArtifactContentView({ artifact }: { artifact: LoadedArtifact }) {
    const { width } = useWindowDimensions();
    const contentWidth = width - BODY_PADDING * 2;

    const Registered = ResolveMobileArtifactRenderer(artifact.TypeName, artifact.ContentType);
    if (Registered) {
        return (
            <Registered
                TypeName={artifact.TypeName}
                ContentType={artifact.ContentType}
                Content={artifact.content}
                Name={artifact.name}
            />
        );
    }

    switch (artifact.kind) {
        case 'json-table':
            return (
                <View style={styles.cards}>
                    {(artifact.Rows ?? []).slice(0, 100).map((row, idx) => {
                        const keys = Object.keys(row).slice(0, 6);
                        return (
                            <View key={idx} style={styles.recordCard}>
                                {keys.map((k) => (
                                    <View key={k} style={styles.cell}>
                                        <Text style={styles.cellKey}>{k}</Text>
                                        <Text style={styles.cellVal} numberOfLines={2}>
                                            {row[k] === null || row[k] === undefined ? '—' : String(row[k])}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        );
                    })}
                </View>
            );
        case 'json':
            return <Text style={styles.code}>{JSON.stringify(artifact.Json, null, 2)}</Text>;
        case 'chart':
            return artifact.chart
                ? <View style={styles.chartCard}><Chart Spec={artifact.chart} Width={contentWidth - 28} /></View>
                : <Text style={styles.code}>{JSON.stringify(artifact.Json, null, 2)}</Text>;
        case 'interactive':
            return <InteractiveArtifact artifact={artifact} />;
        case 'html':
            return <HtmlRenderer html={artifact.content} />;
        case 'code':
            return <CodeView code={artifact.content} language={artifact.Language} />;
        case 'markdown':
            return <MarkdownView source={artifact.content} />;
        case 'text':
        default:
            return <Text style={styles.text}>{artifact.content}</Text>;
    }
}

/**
 * Interactive artifact dispatcher.
 *
 * Which renderer a component gets — native, or a real browser document for the ones needing a
 * canvas — is decided by `ComponentRenderer`, so every surface that shows an artifact makes the
 * same choice.
 */
function InteractiveArtifact({ artifact }: { artifact: LoadedArtifact }) {
    if (!artifact.Spec) {
        return <DesktopFallback reason="This artifact does not contain a renderable component." />;
    }
    return <ComponentRenderer spec={artifact.Spec} />;
}

/**
 * Syntax-highlighted, horizontally-scrollable code block. Reuses the shared
 * prismjs-based highlighter so code artifacts match fenced code in markdown.
 */
function CodeView({ code, language }: { code: string; language?: string }) {
    return (
        <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
            <Text style={styles.code}>
                {HighlightCode(code, language).map((run, i) => (
                    <Text key={i} style={{ color: run.Color }}>{run.Text}</Text>
                ))}
            </Text>
        </ScrollView>
    );
}

/**
 * Lightweight markdown renderer — headings, bold, and bullet lists.
 * Phase 1 placeholder until the shared @memberjunction/markdown-core
 * extraction lands (plan §4.3).
 */
function MarkdownView({ source }: { source: string }) {
    const lines = source.split('\n');
    return (
        <View>
            {lines.map((line, idx) => {
                if (/^#{1,6}\s/.test(line)) {
                    const level = line.match(/^#+/)?.[0].length ?? 1;
                    return <Text key={idx} style={[styles.mdH, level <= 2 ? styles.mdH1 : styles.mdH2]}>{line.replace(/^#+\s/, '')}</Text>;
                }
                if (/^[-*]\s/.test(line)) {
                    return <Text key={idx} style={styles.mdBullet}>• {renderBold(line.replace(/^[-*]\s/, ''))}</Text>;
                }
                if (line.trim() === '') return <View key={idx} style={{ height: 8 }} />;
                return <Text key={idx} style={styles.mdP}>{renderBold(line)}</Text>;
            })}
        </View>
    );
}

/** Inline `**bold**` → `<Text>` runs; non-bold spans pass through unchanged. */
function renderBold(text: string): React.ReactNode {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) =>
        part.startsWith('**') && part.endsWith('**')
            ? <Text key={idx} style={styles.bold}>{part.slice(2, -2)}</Text>
            : part,
    );
}

const styles = StyleSheet.create({
    cards: { gap: 6 },
    recordCard: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, marginBottom: 6, ...Shadow.card },
    cell: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 3 },
    cellKey: { fontSize: 12, color: Colors.ink3, flexShrink: 0, maxWidth: '45%' },
    cellVal: { fontSize: 13, color: Colors.ink, fontWeight: Type.medium, textAlign: 'right', flex: 1 },

    code: { fontFamily: 'Menlo', fontSize: 12.5, color: Colors.ink, backgroundColor: Colors.surface2, padding: 14, borderRadius: Radius.lg, lineHeight: 18 },
    codeScroll: { backgroundColor: Colors.surface2, borderRadius: Radius.lg },
    chartCard: { backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: Colors.line2, borderRadius: Radius.lg, padding: 14, ...Shadow.card },
    text: { fontSize: 15, color: Colors.ink, lineHeight: 23 },

    mdH: { color: Colors.ink, fontWeight: Type.bold, marginTop: 12, marginBottom: 4 },
    mdH1: { fontSize: 20, letterSpacing: -0.3 },
    mdH2: { fontSize: 16 },
    mdP: { fontSize: 15, color: Colors.ink, lineHeight: 23, marginBottom: 2 },
    mdBullet: { fontSize: 15, color: Colors.ink, lineHeight: 23, marginBottom: 2, paddingLeft: 4 },
    bold: { fontWeight: Type.semibold },
});
