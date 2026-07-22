import { Fragment, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing, Type } from '@/theme/tokens';

/**
 * A small, dependency-free HTML renderer for server-generated artifact HTML.
 *
 * This is intentionally NOT a full HTML engine: it tokenizes a flat subset of
 * markup into a node tree and maps common tags to React Native primitives —
 * headings, paragraphs, lists, emphasis, links, inline/block code, rules,
 * tables, and blockquotes. Unknown tags render their text children; a small set
 * of HTML entities is decoded. It covers the "clean report HTML" agents emit,
 * not arbitrary web pages.
 */

// ---------------------------------------------------------------------------
// Node model + parser
// ---------------------------------------------------------------------------

/** A run of raw text between tags. */
type HtmlTextNode = { type: 'text'; text: string };
/** A parsed element with its lowercased `tag`, decoded `attrs`, and child nodes. */
type HtmlElementNode = { type: 'element'; tag: string; attrs: Record<string, string>; children: HtmlNode[] };
/** Any node in the parsed tree: either text or an element. */
type HtmlNode = HtmlTextNode | HtmlElementNode;

/** Tags that never have children / closing tags. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'col']);

/** Tags rendered inline (as `<Text>` spans) rather than as block containers. */
const INLINE_TAGS = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'span', 'small', 'mark', 'sub', 'sup', 'abbr', 'cite', 'q']);

/** Parse a limited subset of HTML into a node tree. */
function parseHtml(html: string): HtmlNode[] {
    const root: HtmlElementNode = { type: 'element', tag: '#root', attrs: {}, children: [] };
    const stack: HtmlElementNode[] = [root];
    const tagRe = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    const pushText = (raw: string): void => {
        if (!raw) return;
        stack[stack.length - 1].children.push({ type: 'text', text: raw });
    };

    while ((match = tagRe.exec(html)) !== null) {
        pushText(html.slice(lastIndex, match.index));
        lastIndex = tagRe.lastIndex;
        const token = match[0];
        if (token.startsWith('<!--') || token.startsWith('<![CDATA[') || token.startsWith('<!')) continue;
        applyTag(token, stack);
    }
    pushText(html.slice(lastIndex));
    return root.children;
}

/** Mutate the parse stack for a single `<...>` tag token. */
function applyTag(token: string, stack: HtmlElementNode[]): void {
    const isClose = token.startsWith('</');
    const nameMatch = /^<\/?\s*([a-zA-Z][a-zA-Z0-9]*)/.exec(token);
    if (!nameMatch) return;
    const tag = nameMatch[1].toLowerCase();

    if (isClose) {
        // Pop up to and including the matching open tag (tolerates bad nesting).
        for (let i = stack.length - 1; i >= 1; i--) {
            if (stack[i].tag === tag) {
                stack.length = i;
                return;
            }
        }
        return;
    }

    const node: HtmlElementNode = { type: 'element', tag, attrs: parseAttrs(token), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!VOID_TAGS.has(tag) && !token.endsWith('/>')) stack.push(node);
}

/** Extract attributes from an opening tag token (quoted values only). */
function parseAttrs(token: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"|([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*'([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(token)) !== null) {
        const name = (m[1] ?? m[3]).toLowerCase();
        attrs[name] = decodeEntities(m[2] ?? m[4] ?? '');
    }
    return attrs;
}

/** Decode the common named + numeric HTML entities. */
function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&mdash;/g, '—')
        .replace(/&ndash;/g, '–')
        .replace(/&hellip;/g, '…')
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

/** Collapse insignificant whitespace in flow text (HTML-style). */
function collapseWhitespace(text: string): string {
    return decodeEntities(text).replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

/**
 * Render a subset of HTML content as native React Native views.
 * @param html The raw HTML string (typically a whole artifact document).
 */
export function HtmlRenderer({ html }: { html: string }) {
    const nodes = parseHtml(html);
    return <View>{renderBlockNodes(nodes, 'h')}</View>;
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

/** Whether a node participates in inline flow (text or an inline element). */
function isInline(node: HtmlNode): boolean {
    return node.type === 'text' || INLINE_TAGS.has(node.tag);
}

/**
 * Render children as a sequence of blocks, grouping runs of adjacent inline
 * nodes into paragraph `<Text>` elements.
 */
function renderBlockNodes(nodes: HtmlNode[], keyPrefix: string): ReactNode[] {
    const out: ReactNode[] = [];
    let inlineRun: HtmlNode[] = [];

    const flush = (): void => {
        if (inlineRun.length === 0) return;
        const key = `${keyPrefix}-p${out.length}`;
        const rendered = renderInlineNodes(inlineRun, key);
        if (hasVisibleContent(inlineRun)) {
            out.push(<Text key={key} style={styles.paragraph}>{rendered}</Text>);
        }
        inlineRun = [];
    };

    nodes.forEach((node) => {
        if (isInline(node)) {
            inlineRun.push(node);
        } else {
            flush();
            out.push(renderBlock(node, `${keyPrefix}-b${out.length}`));
        }
    });
    flush();
    return out;
}

/** True if an inline run has any non-whitespace text or element content. */
function hasVisibleContent(nodes: HtmlNode[]): boolean {
    return nodes.some((n) => (n.type === 'text' ? collapseWhitespace(n.text).trim() !== '' : true));
}

/** Render a single block-level element node. */
function renderBlock(node: HtmlNode, key: string): ReactNode {
    if (node.type === 'text') return null;
    switch (node.tag) {
        case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
            return <Text key={key} style={[styles.heading, headingStyle(node.tag)]}>{renderInlineNodes(node.children, key)}</Text>;
        case 'p':
            return <Text key={key} style={styles.paragraph}>{renderInlineNodes(node.children, key)}</Text>;
        case 'ul': case 'ol':
            return <ListBlock key={key} node={node} keyPrefix={key} />;
        case 'pre':
            return <PreBlock key={key} node={node} />;
        case 'hr':
            return <View key={key} style={styles.hr} />;
        case 'blockquote':
            return <View key={key} style={styles.blockquote}>{renderBlockNodes(node.children, key)}</View>;
        case 'table':
            return <TableBlock key={key} node={node} keyPrefix={key} />;
        case 'br':
            return null;
        default:
            // div/section/unknown container → render its children as blocks.
            return <Fragment key={key}>{renderBlockNodes(node.children, key)}</Fragment>;
    }
}

/** Ordered/unordered list. */
function ListBlock({ node, keyPrefix }: { node: HtmlElementNode; keyPrefix: string }) {
    const ordered = node.tag === 'ol';
    const items = node.children.filter((c): c is HtmlElementNode => c.type === 'element' && c.tag === 'li');
    return (
        <View style={styles.list}>
            {items.map((item, idx) => (
                <View key={`${keyPrefix}-li${idx}`} style={styles.listItem}>
                    <Text style={styles.listMarker}>{ordered ? `${idx + 1}.` : '•'}</Text>
                    <View style={styles.listBody}>{renderBlockNodes(item.children, `${keyPrefix}-li${idx}`)}</View>
                </View>
            ))}
        </View>
    );
}

/** Preformatted / code block. */
function PreBlock({ node }: { node: HtmlElementNode }) {
    return (
        <View style={styles.codeBlock}>
            <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false}>
                <Text style={styles.codeText}>{decodeEntities(textContent(node))}</Text>
            </ScrollView>
        </View>
    );
}

/** Table, rendered as a horizontally-scrollable grid. */
function TableBlock({ node, keyPrefix }: { node: HtmlElementNode; keyPrefix: string }) {
    const rows = collectRows(node);
    if (rows.length === 0) return null;
    return (
        <ScrollView horizontal directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
            <View style={styles.table}>
                {rows.map((row, r) => (
                    <View key={`${keyPrefix}-r${r}`} style={[styles.tableRow, row.header && styles.tableHeaderRow]}>
                        {row.cells.map((cell, c) => (
                            <View key={`${keyPrefix}-r${r}c${c}`} style={styles.tableCell}>
                                <Text style={[styles.tableCellText, row.header && styles.bold]}>
                                    {renderInlineNodes(cell.children, `${keyPrefix}-r${r}c${c}`)}
                                </Text>
                            </View>
                        ))}
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

/** A single table row: its `<td>`/`<th>` cells and whether it is a header row (all `<th>`). */
type TableRow = { header: boolean; cells: HtmlElementNode[] };

/** Walk a table subtree collecting rows of cells (flattens thead/tbody). */
function collectRows(table: HtmlElementNode): TableRow[] {
    const rows: TableRow[] = [];
    const visit = (node: HtmlNode): void => {
        if (node.type !== 'element') return;
        if (node.tag === 'tr') {
            const cells = node.children.filter((c): c is HtmlElementNode => c.type === 'element' && (c.tag === 'td' || c.tag === 'th'));
            const header = cells.length > 0 && cells.every((c) => c.tag === 'th');
            rows.push({ header, cells });
            return;
        }
        node.children.forEach(visit);
    };
    table.children.forEach(visit);
    return rows;
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

/** Render inline nodes into `<Text>`-embeddable content. */
function renderInlineNodes(nodes: HtmlNode[], keyPrefix: string): ReactNode {
    return nodes.map((node, idx) => renderInline(node, `${keyPrefix}-i${idx}`));
}

/** Render a single inline node. */
function renderInline(node: HtmlNode, key: string): ReactNode {
    if (node.type === 'text') return collapseWhitespace(node.text);
    switch (node.tag) {
        case 'b': case 'strong':
            return <Text key={key} style={styles.bold}>{renderInlineNodes(node.children, key)}</Text>;
        case 'i': case 'em': case 'cite':
            return <Text key={key} style={styles.italic}>{renderInlineNodes(node.children, key)}</Text>;
        case 'u':
            return <Text key={key} style={styles.underline}>{renderInlineNodes(node.children, key)}</Text>;
        case 's': case 'strike': case 'del':
            return <Text key={key} style={styles.strike}>{renderInlineNodes(node.children, key)}</Text>;
        case 'code':
            return <Text key={key} style={styles.codespan}>{decodeEntities(textContent(node))}</Text>;
        case 'a':
            return <Text key={key} style={styles.link} onPress={() => openUrl(node.attrs.href)}>{renderInlineNodes(node.children, key)}</Text>;
        case 'br':
            return <Text key={key}>{'\n'}</Text>;
        default:
            // span/mark/unknown inline → render children inline.
            return <Text key={key}>{renderInlineNodes(node.children, key)}</Text>;
    }
}

/** Concatenate all descendant text of a node (for code/pre). */
function textContent(node: HtmlNode): string {
    if (node.type === 'text') return node.text;
    return node.children.map(textContent).join('');
}

/** Open a link URL, swallowing unsupported-scheme failures. */
function openUrl(href: string | undefined): void {
    if (!href) return;
    Linking.openURL(href).catch(() => {
        // Non-fatal: nothing else to do for an unopenable link.
    });
}

/** Map a heading tag to its size style. */
function headingStyle(tag: string) {
    switch (tag) {
        case 'h1': return styles.h1;
        case 'h2': return styles.h2;
        case 'h3': return styles.h3;
        default: return styles.h4;
    }
}

const styles = StyleSheet.create({
    heading: { color: Colors.ink, fontWeight: Type.bold, marginTop: Spacing.lg, marginBottom: Spacing.xs },
    h1: { fontSize: Type.heading },
    h2: { fontSize: Type.title },
    h3: { fontSize: Type.bodyLarge, fontWeight: Type.semibold },
    h4: { fontSize: Type.body, fontWeight: Type.semibold },
    paragraph: { color: Colors.ink2, fontSize: Type.body, lineHeight: 22, marginBottom: Spacing.sm },
    bold: { fontWeight: Type.bold, color: Colors.ink },
    italic: { fontStyle: 'italic' },
    underline: { textDecorationLine: 'underline' },
    strike: { textDecorationLine: 'line-through', color: Colors.ink3 },
    link: { color: Colors.brand, textDecorationLine: 'underline' },
    codespan: { fontFamily: 'Menlo', fontSize: Type.small, color: Colors.ink, backgroundColor: Colors.surface2 },
    blockquote: { borderLeftWidth: 3, borderLeftColor: Colors.line2, paddingLeft: Spacing.md, marginBottom: Spacing.sm },
    list: { marginBottom: Spacing.sm },
    listItem: { flexDirection: 'row', marginBottom: Spacing.xs },
    listMarker: { color: Colors.ink3, fontSize: Type.body, lineHeight: 22, width: 22 },
    listBody: { flex: 1 },
    hr: { height: 1, backgroundColor: Colors.line2, marginVertical: Spacing.md },
    codeBlock: { backgroundColor: Colors.surface2, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.line, marginBottom: Spacing.sm, overflow: 'hidden' },
    codeText: { fontFamily: 'Menlo', fontSize: Type.small, color: Colors.ink, padding: Spacing.md },
    tableScroll: { marginBottom: Spacing.sm },
    table: { borderWidth: 1, borderColor: Colors.line2, borderRadius: Radius.sm, overflow: 'hidden' },
    tableRow: { flexDirection: 'row' },
    tableHeaderRow: { backgroundColor: Colors.surface2 },
    tableCell: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderWidth: 0.5, borderColor: Colors.line2, minWidth: 96 },
    tableCellText: { color: Colors.ink2, fontSize: Type.small },
});
