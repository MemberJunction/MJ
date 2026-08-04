import { JSONPath } from 'jsonpath-plus';
import type { FieldTransformPlugin, JsonPathConfig } from '@memberjunction/global';

/**
 * `jsonpath` transform — extracts value(s) from a JSON value via a JSONPath expression.
 *
 * The input may be a JSON string (it is `JSON.parse`d) or an already-parsed object/array. By default the
 * FIRST match is returned (the common "grab one value" case); set `First: false` to get the full array
 * of matches. Lives here, not in `@memberjunction/global`, because it needs `jsonpath-plus`.
 */
export const jsonPathTransform: FieldTransformPlugin = (value, _fields, config) => {
    const c = config as JsonPathConfig;
    const json: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    const matches = JSONPath({ path: c.Path, json: json as object, wrap: true }) as unknown[];
    if (c.First === false) {
        return matches;
    }
    return Array.isArray(matches) && matches.length > 0 ? matches[0] : null;
};
