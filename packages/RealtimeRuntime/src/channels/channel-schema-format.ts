/**
 * @fileoverview Renders a JSON Schema's top-level parameters as a compact, model-readable list —
 * `row:integer, col:integer, note?:string` — for error messages and the channel catalog note.
 *
 * Intentionally shallow: a speaking model needs the names, rough types and which are optional to
 * form a call, not a schema dump. Nested structure collapses to its type (`object`, `array`).
 *
 * @module @memberjunction/realtime-runtime
 */

import { IsPlainObject } from '@memberjunction/global';

/** Renders one property's type: its `enum` as `a|b|c`, else its `type` (a union joined with `|`), else `any`. */
function describePropertyType(schema: unknown): string {
  if (!IsPlainObject(schema)) {
    return 'any';
  }
  const options = schema['enum'];
  if (Array.isArray(options) && options.length > 0) {
    return options.map((o) => String(o)).join('|');
  }
  const type = schema['type'];
  if (typeof type === 'string') {
    return type;
  }
  if (Array.isArray(type)) {
    const names = type.filter((t): t is string => typeof t === 'string');
    return names.length > 0 ? names.join('|') : 'any';
  }
  return 'any';
}

/**
 * Lists a schema's top-level properties as `name:type`, with `?` after the name of optional ones.
 * An empty or property-less schema renders as an empty string.
 *
 * @param schema A JSON Schema object.
 */
export function FormatParameterList(schema: unknown): string {
  if (!IsPlainObject(schema) || !IsPlainObject(schema['properties'])) {
    return '';
  }
  const required = new Set(Array.isArray(schema['required']) ? schema['required'].filter((r): r is string => typeof r === 'string') : []);
  return Object.entries(schema['properties'])
    .map(([name, property]) => `${name}${required.has(name) ? '' : '?'}:${describePropertyType(property)}`)
    .join(', ');
}
