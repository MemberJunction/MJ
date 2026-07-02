import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MarkdownView } from '@/components/markdown/MarkdownView';
import { Colors, Spacing, Type } from '@/theme/tokens';

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

export default function MarkdownPreviewScreen() {
    return (
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.banner}>
                <Text style={styles.bannerText}>DEV · MarkdownView preview</Text>
            </View>
            <ScrollView contentContainerStyle={styles.body}>
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
});
