/**
 * @fileoverview Pure parser for MetadataSync reference strings.
 * @module reference-parser
 *
 * Parses the `@`-prefixed reference syntax used in metadata JSON files
 * (`@file:`, `@lookup:`, `@template:`, `@parent:`, `@root:`, `@env:`) into a
 * structured {@link ParsedReference}. Extracted from `ValidationService` so the
 * real production parser is directly unit-testable as a pure function — tests
 * drive this code, not re-declared copies of its regexes.
 *
 * NOTE: this is the *validation-side* parser. The push-side runtime resolution
 * in `sync-engine.ts` (`processFieldValue`) has its own parsing that
 * additionally understands `@url:` and the `?allowDefer` flag.
 */

import { METADATA_KEYWORDS } from '../constants/metadata-keywords';
import type { ParsedReference, ReferenceType } from '../types/validation';

/**
 * Ordered reference patterns. Each entry pairs a reference type with the exact
 * regex that recognizes it. `@lookup:` captures the entity name (everything up
 * to the first dot) and the remaining criteria string separately.
 */
const REFERENCE_PATTERNS: ReadonlyArray<readonly [ReferenceType, RegExp]> = [
  [METADATA_KEYWORDS.FILE, /^@file:(.+)$/],
  [METADATA_KEYWORDS.LOOKUP, /^@lookup:([^.]+)\.(.+)$/],
  [METADATA_KEYWORDS.TEMPLATE, /^@template:(.+)$/],
  [METADATA_KEYWORDS.PARENT, /^@parent:(.+)$/],
  [METADATA_KEYWORDS.ROOT, /^@root:(.+)$/],
  [METADATA_KEYWORDS.ENV, /^@env:(.+)$/],
];

/**
 * Parses a metadata reference string into its structured form.
 *
 * @param reference - The raw field value (e.g. `"@lookup:Users.Email=a@b.c"`)
 * @returns The parsed reference, or `null` when the string is not a
 *          recognized reference (including bare prefixes like `"@file:"`)
 */
export function parseMetadataReference(reference: string): ParsedReference | null {
  for (const [type, pattern] of REFERENCE_PATTERNS) {
    const match = reference.match(pattern);
    if (!match) {
      continue;
    }
    if (type === METADATA_KEYWORDS.LOOKUP) {
      const [, entity, remaining] = match;
      return parseLookupReference(entity, remaining);
    }
    return { type, value: match[1] };
  }

  return null;
}

/**
 * Parses the portion of a `@lookup:` reference after the entity name.
 *
 * Handles single-field (`Name=X`) and multi-field (`Name=X&Status=Y`)
 * criteria, the `?create` flag, and `?create&Field=Value` additional
 * creation fields (values URI-decoded).
 */
function parseLookupReference(entity: string, remaining: string): ParsedReference {
  // Check if this has ?create syntax
  const hasCreate = remaining.includes('?create');
  const lookupPart = hasCreate ? remaining.split('?')[0] : remaining;

  // Parse all lookup fields (can be multiple with &)
  const fields = parseLookupCriteria(lookupPart);

  // For backward compatibility, use the first field as primary
  const primaryField = fields.length > 0 ? fields[0] : { field: '', value: '' };

  return {
    type: METADATA_KEYWORDS.LOOKUP,
    value: primaryField.value,
    entity,
    field: primaryField.field,
    fields, // Include all fields for validation
    createIfMissing: hasCreate,
    additionalFields: parseCreateFields(remaining, hasCreate),
  };
}

/**
 * Splits `Field1=Value1&Field2=Value2` criteria into field/value pairs.
 * Pairs without an `=` are skipped; names and values are trimmed.
 */
function parseLookupCriteria(lookupPart: string): Array<{ field: string; value: string }> {
  const fields: Array<{ field: string; value: string }> = [];

  for (const pair of lookupPart.split('&')) {
    const fieldMatch = pair.match(/^(.+?)=(.+)$/);
    if (fieldMatch) {
      const [, field, value] = fieldMatch;
      fields.push({ field: field.trim(), value: value.trim() });
    }
  }

  return fields;
}

/**
 * Parses additional creation fields following `?create&` (e.g.
 * `?create&Description=Auto%20created`). Values are URI-decoded.
 */
function parseCreateFields(remaining: string, hasCreate: boolean): Record<string, string> {
  const additionalFields: Record<string, string> = {};

  if (hasCreate && remaining.includes('?create&')) {
    const createPart = remaining.split('?create&')[1];
    for (const pair of createPart.split('&')) {
      const [key, val] = pair.split('=');
      if (key && val) {
        additionalFields[key] = decodeURIComponent(val);
      }
    }
  }

  return additionalFields;
}
