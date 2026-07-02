import * as xpath from 'xpath';
import { DOMParser } from '@xmldom/xmldom';
import type { FieldTransformPlugin, XPathConfig } from '@memberjunction/global';

/** Coerces an XPath node/result to a scalar value (element/attr text, or the raw scalar). */
function nodeValue(n: unknown): unknown {
    if (n && typeof n === 'object') {
        const node = n as { nodeValue?: string | null; textContent?: string | null };
        if (node.nodeValue != null) return node.nodeValue;
        if (node.textContent != null) return node.textContent;
    }
    return n;
}

/**
 * `xpath` transform — extracts value(s) from an XML string via an XPath expression.
 *
 * The input is parsed with `@xmldom/xmldom`. For node-set expressions, each match is reduced to its text
 * (`nodeValue`/`textContent`); for scalar expressions (e.g. `count(...)`, `.../text()`) the scalar is
 * returned. By default the FIRST match is returned; set `First: false` to get the full array. Lives here,
 * not in `@memberjunction/global`, because it needs `xpath` + `@xmldom/xmldom`.
 */
export const xPathTransform: FieldTransformPlugin = (value, _fields, config) => {
    const c = config as XPathConfig;
    const doc = new DOMParser().parseFromString(String(value ?? ''), 'text/xml');
    const result = xpath.select(c.Path, doc as unknown as Node);
    if (Array.isArray(result)) {
        const values = result.map(nodeValue);
        return c.First === false ? values : (values.length > 0 ? values[0] : null);
    }
    return result ?? null; // string / number / boolean (e.g. count(), normalize-space())
};
