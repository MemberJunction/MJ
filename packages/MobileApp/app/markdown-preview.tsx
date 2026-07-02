import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { Chart } from '@/components/charts/Chart';
import { HtmlRenderer } from '@/components/artifacts/html-renderer';
import { Colors, Spacing, Type } from '@/theme/tokens';

/** Code-focused markdown so prismjs syntax highlighting is visible up top. */
const CODE_SAMPLE = `\`\`\`typescript
interface Agent { id: string; name: string; active: boolean; }

function greet(agent: Agent): string {
  // return a friendly line
  return \`Hello, \${agent.name}!\`;
}
\`\`\`

\`\`\`json
{ "kind": "bar", "data": [{ "label": "Won", "value": 11 }] }
\`\`\``;

/** Sample HTML exercising the dependency-free HTML → RN renderer. */
const SAMPLE_HTML = `<h3>HTML artifact renderer</h3>
<p>Renders <strong>bold</strong>, <em>italic</em>, <a href="https://memberjunction.com">links</a>, and <code>inline code</code> without a WebView.</p>
<ul><li>First bullet</li><li>Second bullet</li></ul>
<blockquote>Server-generated HTML artifacts render natively.</blockquote>`;

/**
 * DEV-ONLY on-device preview of the native MarkdownView (markdown-core AST → RN).
 *
 * Renders without auth or a backend so the markdown renderer can be QA'd on the
 * simulator/device directly:
 *   xcrun simctl openurl booted "org.memberjunction.mobile:///markdown-preview"
 *
 * Not linked from any in-app navigation; safe to leave or remove.
 */
const SAMPLE = `## Inline SVG (react-native-svg)

\`\`\`svg
<svg width="120" height="60" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="116" height="56" rx="10" fill="#264FAF"/><circle cx="30" cy="30" r="16" fill="#fff"/><text x="58" y="36" fill="#fff" font-size="16">MJ</text></svg>
\`\`\`

## A table

| Feature | Web | Mobile |
|---------|-----|--------|
| Headings | yes | yes |
| Code | yes | yes |
| SVG | yes | yes |

## Blockquote

> The token tree renders to View/Text/Pressable — no DOM required.

# Markdown on Mobile

This validates the **native renderer** built on \`@memberjunction/markdown-core\`.
The *same engine* drives the web \`ng-markdown\` component.

## Inline formatting

Supports **bold**, *italic*, ~~strikethrough~~, \`inline code\`, and
[links](https://memberjunction.com). A line with a hard break\\
continues here.

## A code block

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

## Lists

- First item
- Second item with **emphasis**
  - Nested item
- Third item

1. Ordered one
2. Ordered two

- [x] Done task
- [ ] Pending task

## A table

| Feature | Web | Mobile |
|---------|-----|--------|
| Headings | yes | yes |
| Code | yes | yes |
| SVG | yes | yes |

## Blockquote

> The token tree renders to View/Text/Pressable — no DOM required.

## Inline SVG

\`\`\`svg
<svg width="120" height="60" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="116" height="56" rx="10" fill="#264FAF"/><circle cx="30" cy="30" r="16" fill="#fff"/><text x="58" y="36" fill="#fff" font-size="16">MJ</text></svg>
\`\`\`

---

End of preview.
`;

/**
 * DEV HARNESS — not a shipping screen; not linked from in-app navigation.
 *
 * Route: `/markdown-preview` (Expo Router, `app/markdown-preview.tsx`), reached
 *   via deep link:
 *   `xcrun simctl openurl booted "org.memberjunction.mobile:///markdown-preview"`.
 * Purpose: on-device render showcase / QA for the native rendering stack with no
 *   auth or backend — the markdown renderer ({@link MarkdownView}, markdown-core
 *   AST -> RN), the SVG-capable {@link Chart} component (pie/bar/line specs), and
 *   the dependency-free {@link HtmlRenderer} (HTML -> RN, no WebView), all fed by
 *   the static `CODE_SAMPLE` / `SAMPLE_HTML` / `SAMPLE` fixtures above.
 * Interactions: none — scrollable static gallery; `chartWidth` is derived from
 *   `useWindowDimensions()`.
 * Mockup: none (dev harness).
 */
export default function MarkdownPreviewScreen() {
    const { width } = useWindowDimensions();
    const chartWidth = width - Spacing.lg * 2;
    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.banner}>
                <Text style={styles.bannerText}>DEV · render showcase</Text>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
                <Text style={styles.section}>Pie chart</Text>
                <Chart
                    width={chartWidth}
                    spec={{
                        kind: 'pie',
                        title: 'Agent share',
                        data: [
                            { label: 'Skip', value: 40 },
                            { label: 'Research', value: 25 },
                            { label: 'Analyst', value: 20 },
                            { label: 'Other', value: 15 },
                        ],
                    }}
                />
                <View style={styles.htmlWrap}>
                    <HtmlRenderer html={SAMPLE_HTML} />
                </View>

                <Text style={styles.section}>Code highlighting (prismjs)</Text>
                <MarkdownView value={CODE_SAMPLE} />

                <Text style={styles.section}>Bar chart (react-native-svg)</Text>
                <Chart
                    width={chartWidth}
                    spec={{
                        kind: 'bar',
                        title: 'Pipeline by stage',
                        data: [
                            { label: 'Lead', value: 42 },
                            { label: 'Qual', value: 30 },
                            { label: 'Prop', value: 18 },
                            { label: 'Won', value: 11 },
                        ],
                    }}
                />

                <Text style={styles.section}>Line chart</Text>
                <Chart
                    width={chartWidth}
                    spec={{
                        kind: 'line',
                        title: 'Weekly runs',
                        data: [
                            { label: 'W1', value: 12 },
                            { label: 'W2', value: 19 },
                            { label: 'W3', value: 14 },
                            { label: 'W4', value: 23 },
                        ],
                    }}
                />

                <Text style={styles.section}>Pie chart</Text>
                <Chart
                    width={chartWidth}
                    spec={{
                        kind: 'pie',
                        title: 'Agent share',
                        data: [
                            { label: 'Skip', value: 40 },
                            { label: 'Research', value: 25 },
                            { label: 'Analyst', value: 20 },
                            { label: 'Other', value: 15 },
                        ],
                    }}
                />

                <View style={styles.htmlWrap}>
                    <HtmlRenderer html={SAMPLE_HTML} />
                </View>

                <Text style={styles.section}>Full markdown sample</Text>
                <MarkdownView value={SAMPLE} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.bg },
    banner: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.surface2 },
    bannerText: { fontSize: Type.caption, fontWeight: Type.bold, color: Colors.ink3, letterSpacing: 1.2 },
    body: { padding: Spacing.lg, paddingBottom: 60 },
    section: { marginTop: Spacing.xl, marginBottom: Spacing.sm, fontSize: Type.body, fontWeight: Type.bold, color: Colors.ink },
    htmlWrap: { marginTop: Spacing.xl },
});
