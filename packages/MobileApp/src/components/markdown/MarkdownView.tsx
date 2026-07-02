import { useCallback, useMemo, useState } from 'react';
import {
    Linking,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import type { Token, Tokens } from 'marked';
import {
    MarkdownEngine,
    formatLanguageName,
    type SvgCodeBlockToken,
} from '@memberjunction/markdown-core';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';

/**
 * Native markdown renderer.
 *
 * Parses markdown into a token tree with `@memberjunction/markdown-core`
 * (`parseToTokens`, the same engine that drives the web `ng-markdown`
 * component) and renders that AST into React Native primitives — no DOM,
 * no `dangerouslySetInnerHTML`. The web component renders the same tokens to
 * HTML; this renders them to <View>/<Text>/<Pressable>.
 *
 * Coverage: headings, paragraphs, lists (incl. task lists), blockquotes,
 * tables, code blocks (with copy), inline code, bold/italic/strikethrough,
 * links, horizontal rules, and ```svg``` blocks (via react-native-svg).
 *
 * NOT yet handled (tracked for on-device QA, blocked on simulator/Xcode):
 * - Syntax highlighting inside code blocks (planned: react-native-syntax-highlighter / Prism).
 * - Mermaid diagrams (web-only; needs a browser render step — likely a WebView on mobile).
 */

// Single shared engine. The token path ignores the (web-only) highlight fn,
// and svg block tokenization is on by default.
const engine = new MarkdownEngine();

export function MarkdownView({ value, style }: { value: string; style?: StyleProp<ViewStyle> }) {
    const tokens = useMemo<Token[] | null>(() => {
        if (!value) return [];
        try {
            return engine.parseToTokens(value);
        } catch {
            return null;
        }
    }, [value]);

    // Parsing failure → show the raw text rather than nothing.
    if (tokens === null) {
        return <Text style={styles.paragraph}>{value}</Text>;
    }

    return <View style={style}>{renderBlocks(tokens, 'b')}</View>;
}

// ---------------------------------------------------------------------------
// Block-level rendering
// ---------------------------------------------------------------------------

function renderBlocks(tokens: Token[], keyPrefix: string): React.ReactNode[] {
    return tokens.map((token, i) => renderBlock(token, `${keyPrefix}-${i}`));
}

function renderBlock(token: Token, key: string): React.ReactNode {
    switch (token.type) {
        case 'space':
            return null;

        case 'heading': {
            const h = token as Tokens.Heading;
            return (
                <View key={key} style={styles.headingWrap}>
                    <Text style={[styles.heading, headingSize(h.depth)]}>{renderInline(h.tokens, key)}</Text>
                </View>
            );
        }

        case 'paragraph': {
            const p = token as Tokens.Paragraph;
            return (
                <Text key={key} style={styles.paragraph}>
                    {renderInline(p.tokens, key)}
                </Text>
            );
        }

        case 'text': {
            const t = token as Tokens.Text;
            return (
                <Text key={key} style={styles.paragraph}>
                    {t.tokens ? renderInline(t.tokens, key) : decodeEntities(t.text)}
                </Text>
            );
        }

        case 'code': {
            const c = token as Tokens.Code;
            return <CodeBlock key={key} code={c.text} lang={c.lang} />;
        }

        case 'blockquote': {
            const bq = token as Tokens.Blockquote;
            return (
                <View key={key} style={styles.blockquote}>
                    {renderBlocks(bq.tokens, key)}
                </View>
            );
        }

        case 'list':
            return <ListView key={key} list={token as Tokens.List} keyPrefix={key} />;

        case 'table':
            return <TableView key={key} table={token as Tokens.Table} keyPrefix={key} />;

        case 'hr':
            return <View key={key} style={styles.hr} />;

        case 'svgCodeBlock': {
            const svg = token as Tokens.Generic as SvgCodeBlockToken;
            return <SvgBlock key={key} xml={svg.svgContent} />;
        }

        case 'def':
            return null;

        default: {
            // Includes raw inline/block 'html' and any unmodeled token: show its
            // text if present, otherwise skip.
            const g = token as Tokens.Generic;
            return typeof g.text === 'string'
                ? <Text key={key} style={styles.paragraph}>{decodeEntities(g.text)}</Text>
                : null;
        }
    }
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

function renderInline(tokens: Token[] | undefined, keyPrefix: string): React.ReactNode {
    if (!tokens) return null;
    return tokens.map((token, i) => {
        const key = `${keyPrefix}-i${i}`;
        switch (token.type) {
            case 'text': {
                const t = token as Tokens.Text;
                return t.tokens
                    ? <Text key={key}>{renderInline(t.tokens, key)}</Text>
                    : decodeEntities(t.text);
            }
            case 'strong':
                return <Text key={key} style={styles.bold}>{renderInline((token as Tokens.Strong).tokens, key)}</Text>;
            case 'em':
                return <Text key={key} style={styles.italic}>{renderInline((token as Tokens.Em).tokens, key)}</Text>;
            case 'del':
                return <Text key={key} style={styles.del}>{renderInline((token as Tokens.Del).tokens, key)}</Text>;
            case 'codespan':
                return <Text key={key} style={styles.codespan}>{decodeEntities((token as Tokens.Codespan).text)}</Text>;
            case 'link': {
                const l = token as Tokens.Link;
                return (
                    <Text key={key} style={styles.link} onPress={() => openUrl(l.href)}>
                        {renderInline(l.tokens, key)}
                    </Text>
                );
            }
            case 'image': {
                const img = token as Tokens.Image;
                return <Text key={key} style={styles.muted}>{img.text || img.title || 'image'}</Text>;
            }
            case 'br':
                return <Text key={key}>{'\n'}</Text>;
            case 'escape':
                return (token as Tokens.Escape).text;
            default: {
                const g = token as Tokens.Generic;
                return typeof g.text === 'string' ? decodeEntities(g.text) : null;
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
    const [copied, setCopied] = useState(false);

    const onCopy = useCallback(async () => {
        try {
            await Clipboard.setStringAsync(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard failures are non-fatal; leave the label unchanged.
        }
    }, [code]);

    return (
        <View style={styles.codeBlock}>
            <View style={styles.codeHeader}>
                <Text style={styles.codeLang}>{lang ? formatLanguageName(lang) : 'Code'}</Text>
                <Pressable onPress={onCopy} hitSlop={8}>
                    <Text style={styles.codeCopy}>{copied ? 'Copied' : 'Copy'}</Text>
                </Pressable>
            </View>
            <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false}>
                <Text style={styles.codeText}>{code}</Text>
            </ScrollView>
        </View>
    );
}

function ListView({ list, keyPrefix }: { list: Tokens.List; keyPrefix: string }) {
    const start = typeof list.start === 'number' ? list.start : 1;
    return (
        <View style={styles.list}>
            {list.items.map((item, i) => {
                const marker = item.task
                    ? (item.checked ? '☑' : '☐')
                    : list.ordered ? `${start + i}.` : '•';
                return (
                    <View key={`${keyPrefix}-li${i}`} style={styles.listItem}>
                        <Text style={styles.listMarker}>{marker}</Text>
                        <View style={styles.listItemBody}>
                            {renderBlocks(item.tokens, `${keyPrefix}-li${i}`)}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

function TableView({ table, keyPrefix }: { table: Tokens.Table; keyPrefix: string }) {
    return (
        <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
            <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                    {table.header.map((cell, c) => (
                        <View key={`${keyPrefix}-h${c}`} style={styles.tableCell}>
                            <Text style={[styles.tableCellText, styles.bold]}>{renderInline(cell.tokens, `${keyPrefix}-h${c}`)}</Text>
                        </View>
                    ))}
                </View>
                {table.rows.map((row, r) => (
                    <View key={`${keyPrefix}-r${r}`} style={styles.tableRow}>
                        {row.map((cell, c) => (
                            <View key={`${keyPrefix}-r${r}c${c}`} style={styles.tableCell}>
                                <Text style={styles.tableCellText}>{renderInline(cell.tokens, `${keyPrefix}-r${r}c${c}`)}</Text>
                            </View>
                        ))}
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

function SvgBlock({ xml }: { xml: string }) {
    return (
        <View style={styles.svgBlock}>
            <SvgXml xml={xml} width="100%" />
        </View>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function openUrl(href: string | null | undefined): void {
    if (!href) return;
    Linking.openURL(href).catch(() => {
        // Ignore failures (e.g. unsupported scheme) — nothing else to do.
    });
}

/** Decode the handful of HTML entities marked may emit in token text. */
function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'");
}

function headingSize(depth: number) {
    switch (depth) {
        case 1: return styles.h1;
        case 2: return styles.h2;
        case 3: return styles.h3;
        default: return styles.h4;
    }
}

const styles = StyleSheet.create({
    headingWrap: {
        marginTop: Spacing.lg,
        marginBottom: Spacing.xs,
    },
    heading: {
        color: Colors.ink,
        fontWeight: Type.bold,
    },
    h1: { fontSize: Type.heading },
    h2: { fontSize: Type.title },
    h3: { fontSize: Type.bodyLarge, fontWeight: Type.semibold },
    h4: { fontSize: Type.body, fontWeight: Type.semibold },
    paragraph: {
        color: Colors.ink2,
        fontSize: Type.body,
        lineHeight: 22,
        marginBottom: Spacing.sm,
    },
    bold: { fontWeight: Type.bold, color: Colors.ink },
    italic: { fontStyle: 'italic' },
    del: { textDecorationLine: 'line-through', color: Colors.ink3 },
    link: { color: Colors.brand, textDecorationLine: 'underline' },
    muted: { color: Colors.ink3 },
    codespan: {
        fontFamily: 'Menlo',
        fontSize: Type.small,
        color: Colors.ink,
        backgroundColor: Colors.surface2,
    },
    blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: Colors.line2,
        paddingLeft: Spacing.md,
        marginBottom: Spacing.sm,
    },
    list: { marginBottom: Spacing.sm },
    listItem: { flexDirection: 'row', marginBottom: Spacing.xs },
    listMarker: {
        color: Colors.ink3,
        fontSize: Type.body,
        lineHeight: 22,
        width: 22,
    },
    listItemBody: { flex: 1 },
    hr: {
        height: 1,
        backgroundColor: Colors.line2,
        marginVertical: Spacing.md,
    },
    codeBlock: {
        backgroundColor: Colors.surface2,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.line,
        marginBottom: Spacing.sm,
        overflow: 'hidden',
    },
    codeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        borderBottomWidth: 1,
        borderBottomColor: Colors.line,
    },
    codeLang: { color: Colors.ink3, fontSize: Type.caption, fontWeight: Type.medium },
    codeCopy: { color: Colors.brand, fontSize: Type.caption, fontWeight: Type.semibold },
    codeText: {
        fontFamily: 'Menlo',
        fontSize: Type.small,
        color: Colors.ink,
        padding: Spacing.md,
    },
    tableScroll: { marginBottom: Spacing.sm },
    table: {
        borderWidth: 1,
        borderColor: Colors.line2,
        borderRadius: Radius.sm,
        overflow: 'hidden',
    },
    tableRow: { flexDirection: 'row' },
    tableHeaderRow: { backgroundColor: Colors.surface2 },
    tableCell: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderWidth: 0.5,
        borderColor: Colors.line2,
        minWidth: 96,
    },
    tableCellText: { color: Colors.ink2, fontSize: Type.small },
    svgBlock: {
        marginBottom: Spacing.sm,
        alignItems: 'center',
    },
});
