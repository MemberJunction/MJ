/**
 * Semantic HTML comparison — the measuring instrument for the fidelity contract.
 *
 * A raw string comparison is useless here: the browser's own parser reorders attributes,
 * normalizes entities, and re-serializes quoting, so `SetHTML(x)` followed by `GetHTML()`
 * differs from `x` textually even when nothing was changed. This module compares what the
 * markup *means* and reports precisely where two documents diverge.
 *
 * The allowances are enumerated and named rather than folded into a fuzzy match, because
 * the whole point of Acceptance A is knowing exactly which transformations the editor is
 * permitted to make.
 */

/** A single point of divergence, addressed by a readable node path. */
export interface SemanticDifference {
    /** Where the difference is, e.g. `root > DIV[1] > B`. */
    Path: string;
    /** What kind of divergence: tag name, attributes, text, or child count. */
    Kind: 'tag' | 'attribute' | 'text' | 'children' | 'nodeType';
    Expected: string;
    Actual: string;
}

/** Result of a comparison. */
export interface SemanticDiffResult {
    Equal: boolean;
    Differences: SemanticDifference[];
}

/** Transformations the comparison is allowed to overlook. */
export interface SemanticDiffOptions {
    /**
     * Treat a block that gained exactly one filler `<br>` as unchanged.
     *
     * The editor adds these to make empty blocks focusable and to make blank lines render
     * in mail clients — it is a product requirement, not drift. Off by default so a test
     * has to opt in and thereby state that it expects fillers.
     */
    AllowFillerLineBreaks?: boolean;

    /**
     * Ignore whitespace-only text nodes entirely.
     *
     * Source HTML is usually indented; the indentation between blocks is not content.
     */
    IgnoreFormattingWhitespace?: boolean;
}

/** Compare two HTML strings semantically. */
export function diffHtml(
    expected: string,
    actual: string,
    options: SemanticDiffOptions = {},
): SemanticDiffResult {
    const differences: SemanticDifference[] = [];
    compareChildren(parseToFragment(expected), parseToFragment(actual), 'root', options, differences);
    return { Equal: differences.length === 0, Differences: differences };
}

/** Convenience predicate over {@link diffHtml}. */
export function isSemanticallyEqual(
    expected: string,
    actual: string,
    options: SemanticDiffOptions = {},
): boolean {
    return diffHtml(expected, actual, options).Equal;
}

/** Render differences as a readable multi-line report for assertion messages. */
export function formatDifferences(result: SemanticDiffResult): string {
    if (result.Equal) {
        return 'no differences';
    }
    return result.Differences.map(
        (difference) =>
            `${difference.Path} [${difference.Kind}]\n  expected: ${difference.Expected}\n  actual:   ${difference.Actual}`,
    ).join('\n');
}

/** Parse a string into a fragment using the browser's own parser. */
function parseToFragment(html: string): DocumentFragment {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
}

/** Compare two nodes' child lists. */
function compareChildren(
    expected: Node,
    actual: Node,
    path: string,
    options: SemanticDiffOptions,
    differences: SemanticDifference[],
): void {
    const expectedChildren = significantChildren(expected, options);
    const actualChildren = significantChildren(actual, options);

    if (options.AllowFillerLineBreaks && isFillerAddition(expectedChildren, actualChildren)) {
        return;
    }

    if (expectedChildren.length !== actualChildren.length) {
        differences.push({
            Path: path,
            Kind: 'children',
            Expected: `${expectedChildren.length} child node(s): ${describeAll(expectedChildren)}`,
            Actual: `${actualChildren.length} child node(s): ${describeAll(actualChildren)}`,
        });
        return;
    }

    for (let index = 0; index < expectedChildren.length; index += 1) {
        compareNode(expectedChildren[index], actualChildren[index], `${path} > ${describe(expectedChildren[index])}[${index}]`, options, differences);
    }
}

/** Compare two individual nodes. */
function compareNode(
    expected: Node,
    actual: Node,
    path: string,
    options: SemanticDiffOptions,
    differences: SemanticDifference[],
): void {
    if (expected.nodeType !== actual.nodeType) {
        differences.push({
            Path: path,
            Kind: 'nodeType',
            Expected: describe(expected),
            Actual: describe(actual),
        });
        return;
    }

    if (expected.nodeType === Node.TEXT_NODE || expected.nodeType === Node.COMMENT_NODE) {
        compareCharacterData(expected, actual, path, differences);
        return;
    }

    if (expected.nodeName !== actual.nodeName) {
        differences.push({ Path: path, Kind: 'tag', Expected: expected.nodeName, Actual: actual.nodeName });
        return;
    }

    compareAttributes(expected as Element, actual as Element, path, differences);
    compareChildren(expected, actual, path, options, differences);
}

/** Compare text/comment payloads, normalizing runs of whitespace. */
function compareCharacterData(
    expected: Node,
    actual: Node,
    path: string,
    differences: SemanticDifference[],
): void {
    const expectedText = normalizeText(expected.nodeValue ?? '');
    const actualText = normalizeText(actual.nodeValue ?? '');
    if (expectedText !== actualText) {
        differences.push({
            Path: path,
            Kind: 'text',
            Expected: JSON.stringify(expectedText),
            Actual: JSON.stringify(actualText),
        });
    }
}

/**
 * Compare attributes as an order-independent set.
 *
 * Attribute order is a serialization detail the parser does not preserve, so comparing it
 * would report failures for documents that are identical in every way that matters.
 */
function compareAttributes(
    expected: Element,
    actual: Element,
    path: string,
    differences: SemanticDifference[],
): void {
    const expectedAttributes = attributeMap(expected);
    const actualAttributes = attributeMap(actual);
    const names = new Set([...expectedAttributes.keys(), ...actualAttributes.keys()]);

    for (const name of [...names].sort()) {
        const expectedValue = expectedAttributes.get(name);
        const actualValue = actualAttributes.get(name);
        if (expectedValue !== actualValue) {
            differences.push({
                Path: path,
                Kind: 'attribute',
                Expected: `${name}=${JSON.stringify(expectedValue ?? null)}`,
                Actual: `${name}=${JSON.stringify(actualValue ?? null)}`,
            });
        }
    }
}

/** Attributes as a name→value map, with `style` and `class` normalized. */
function attributeMap(element: Element): Map<string, string> {
    const map = new Map<string, string>();
    for (const name of element.getAttributeNames()) {
        map.set(name.toLowerCase(), normalizeAttributeValue(name, element.getAttribute(name) ?? ''));
    }
    return map;
}

/**
 * Normalize an attribute value.
 *
 * `style` and `class` are whitespace- and order-insensitive in practice; comparing them
 * literally turns `margin:0; color:red` and `margin:0;color:red` into a false failure.
 */
function normalizeAttributeValue(name: string, value: string): string {
    const lowered = name.toLowerCase();
    if (lowered === 'style') {
        return value
            .split(';')
            .map((declaration) => declaration.trim().replace(/\s*:\s*/, ':'))
            .filter(Boolean)
            .sort()
            .join(';');
    }
    if (lowered === 'class') {
        return value.split(/\s+/).filter(Boolean).sort().join(' ');
    }
    return value;
}

/** Collapse whitespace runs so indentation differences do not register as text changes. */
function normalizeText(text: string): string {
    return text.replace(/[ \t\r\n]+/g, ' ');
}

/** A node's children, minus anything the options say to ignore. */
function significantChildren(node: Node, options: SemanticDiffOptions): Node[] {
    const children = Array.from(node.childNodes);
    if (!options.IgnoreFormattingWhitespace) {
        return children;
    }
    return children.filter(
        (child) => !(child.nodeType === Node.TEXT_NODE && normalizeText(child.nodeValue ?? '').trim() === ''),
    );
}

/**
 * True when the only difference is that `actual` gained a single filler `<br>`.
 *
 * Recognizes the two shapes the editor produces: an empty block that became `<br>`, and a
 * block whose content gained a trailing `<br>`.
 */
function isFillerAddition(expected: readonly Node[], actual: readonly Node[]): boolean {
    if (actual.length !== expected.length + 1) {
        return false;
    }
    const last = actual[actual.length - 1];
    if (last.nodeName !== 'BR') {
        return false;
    }
    return expected.every((node, index) => nodesLookEqual(node, actual[index]));
}

/** Shallow structural equality, used only by the filler heuristic. */
function nodesLookEqual(a: Node, b: Node): boolean {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) {
        return false;
    }
    if (a.nodeType === Node.TEXT_NODE) {
        return normalizeText(a.nodeValue ?? '') === normalizeText(b.nodeValue ?? '');
    }
    return (a as Element).outerHTML === (b as Element).outerHTML;
}

/** Short human-readable label for a node. */
function describe(node: Node): string {
    switch (node.nodeType) {
        case Node.TEXT_NODE:
            return `#text${JSON.stringify(normalizeText(node.nodeValue ?? ''))}`;
        case Node.COMMENT_NODE:
            return `#comment${JSON.stringify(node.nodeValue ?? '')}`;
        default:
            return node.nodeName;
    }
}

/** Label a whole child list. */
function describeAll(nodes: readonly Node[]): string {
    return nodes.map(describe).join(', ') || '(none)';
}
