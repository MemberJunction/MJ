import { describe, it, expect, beforeEach, type Mock } from 'vitest';
import { Fragment, isValidElement, createElement } from 'react';
// 'react-native' is aliased to a stub (see vitest.config.ts) whose primitives are
// plain string tags and whose Linking.openURL is a vitest spy.
import { Linking } from 'react-native';
import { HtmlRenderer } from '@/components/artifacts/html-renderer';

const openURL = Linking.openURL as unknown as Mock;

// ---------------------------------------------------------------------------
// A tiny dependency-free renderer: recursively invokes function components and
// flattens fragments so we can assert on the produced host-element tree.
// ---------------------------------------------------------------------------

type HostNode = { type: string; props: Record<string, unknown>; children: RenderOutput };
type RenderOutput = string | number | HostNode | RenderOutput[] | null;

function render(node: unknown): RenderOutput {
    if (node == null || typeof node === 'boolean') return null;
    if (typeof node === 'string' || typeof node === 'number') return node;
    if (Array.isArray(node)) return node.map(render);
    if (isValidElement(node)) {
        const el = node as { type: unknown; props: Record<string, unknown> };
        if (el.type === Fragment) return render(el.props.children);
        if (typeof el.type === 'function') {
            const fn = el.type as (props: Record<string, unknown>) => unknown;
            return render(fn(el.props));
        }
        // Host component (string tag from the react-native mock).
        return { type: el.type as string, props: el.props, children: render(el.props.children) };
    }
    return null;
}

function renderHtml(html: string): RenderOutput {
    return render(createElement(HtmlRenderer, { html }));
}

/** Concatenate every string/number leaf in render order. */
function collectText(node: RenderOutput): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(collectText).join('');
    return collectText(node.children);
}

/** Find every host node of a given tag. */
function findHosts(node: RenderOutput, type: string): HostNode[] {
    if (node == null || typeof node === 'string' || typeof node === 'number') return [];
    if (Array.isArray(node)) return node.flatMap((n) => findHosts(n, type));
    const here = node.type === type ? [node] : [];
    return [...here, ...findHosts(node.children, type)];
}

beforeEach(() => {
    openURL.mockClear();
});

describe('HtmlRenderer', () => {
    it('renders paragraph text and collapses insignificant whitespace', () => {
        const tree = renderHtml('<p>Hello   world\n  again</p>');
        expect(collectText(tree)).toContain('Hello world again');
    });

    it('renders headings as Text and preserves their content', () => {
        const tree = renderHtml('<h1>Title</h1><h2>Subtitle</h2>');
        const text = collectText(tree);
        expect(text).toContain('Title');
        expect(text).toContain('Subtitle');
        expect(findHosts(tree, 'Text').length).toBeGreaterThanOrEqual(2);
    });

    it('renders unordered lists with bullet markers', () => {
        const tree = renderHtml('<ul><li>one</li><li>two</li></ul>');
        const text = collectText(tree);
        expect(text).toContain('•');
        expect(text).toContain('one');
        expect(text).toContain('two');
    });

    it('renders ordered lists with numeric markers', () => {
        const tree = renderHtml('<ol><li>first</li><li>second</li></ol>');
        const text = collectText(tree);
        expect(text).toContain('1.');
        expect(text).toContain('2.');
    });

    it('renders links as pressable Text that opens the href', () => {
        const tree = renderHtml('<p>See <a href="https://example.com">the site</a></p>');
        const pressable = findHosts(tree, 'Text').find((n) => typeof n.props.onPress === 'function');
        expect(pressable).toBeDefined();
        (pressable!.props.onPress as () => void)();
        expect(openURL).toHaveBeenCalledWith('https://example.com');
    });

    it('does not attempt to open an anchor with no href', () => {
        const tree = renderHtml('<a>no target</a>');
        const pressable = findHosts(tree, 'Text').find((n) => typeof n.props.onPress === 'function');
        pressable?.props.onPress && (pressable.props.onPress as () => void)();
        expect(openURL).not.toHaveBeenCalled();
    });

    it('decodes named and numeric HTML entities', () => {
        const tree = renderHtml('<p>a &amp; b &lt;x&gt; &#65; &#x42; &mdash; &nbsp;end</p>');
        const text = collectText(tree);
        expect(text).toContain('a & b <x>');
        expect(text).toContain('A');
        expect(text).toContain('B');
        expect(text).toContain('—');
    });

    it('renders tables including header and body cells', () => {
        const tree = renderHtml(
            '<table><thead><tr><th>Name</th><th>Age</th></tr></thead>' +
                '<tbody><tr><td>Alice</td><td>30</td></tr></tbody></table>',
        );
        const text = collectText(tree);
        expect(text).toContain('Name');
        expect(text).toContain('Age');
        expect(text).toContain('Alice');
        expect(text).toContain('30');
    });

    it('renders preformatted code blocks with their raw text', () => {
        const tree = renderHtml('<pre><code>const x = 1;</code></pre>');
        expect(collectText(tree)).toContain('const x = 1;');
        // A <pre> is wrapped in a horizontally-scrollable ScrollView.
        expect(findHosts(tree, 'ScrollView').length).toBeGreaterThanOrEqual(1);
    });

    it('renders unknown tags by surfacing their text children', () => {
        const tree = renderHtml('<custom-widget>surfaced text</custom-widget>');
        expect(collectText(tree)).toContain('surfaced text');
    });

    it('applies inline emphasis without dropping content', () => {
        const tree = renderHtml('<p>plain <strong>bold</strong> and <em>italic</em></p>');
        const text = collectText(tree);
        expect(text).toContain('bold');
        expect(text).toContain('italic');
        expect(text).toContain('plain');
    });

    it('tolerates malformed / unclosed markup without throwing', () => {
        expect(() => renderHtml('<p>oops <b>unclosed')).not.toThrow();
        expect(collectText(renderHtml('<p>oops <b>unclosed'))).toContain('oops');
    });
});
