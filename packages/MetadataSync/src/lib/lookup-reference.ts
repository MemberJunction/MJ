/**
 * @fileoverview Splits a `@lookup:` reference the way push reads it, so push, validation and pull agree.
 * Format: `@lookup:Entity.Field1=Value1&Field2=Value2?create&allowDefer&CreateField=Value`.
 * The entity ends at the first `.`; the criteria end at the first `?`; the rest is flags.
 * @module lookup-reference
 */

/** A split `@lookup:` reference. */
export interface LookupSplit {
  EntityName: string;
  /** From after the entity's `.` up to the first `?`. */
  CriteriaText: string;
  /** After the first `?`, or an empty string. */
  FlagsText: string;
  /** Lowercased name of every flags item (the part before `=`). */
  FlagNames: Set<string>;
  /** Lowercased flags items without `=` other than `create` and `allowdefer`. */
  UnknownBareFlags: string[];
}

/** One `name=value` item of a lookup. */
export interface LookupPair {
  Name: string;
  Value: string;
}

/** The error text for `?optional` inside a lookup. */
export const LOOKUP_OPTIONAL_MESSAGE = '?optional is not supported in @lookup: (the ? starts lookup flags)';

const KNOWN_BARE_FLAGS = new Set(['create', 'allowdefer']);

/**
 * Splits the text after `@lookup:`.
 * @returns The split, or null when there is no entity name before a `.`
 */
export function SplitLookupReference(lookupText: string): LookupSplit | null {
  const entityMatch = lookupText.match(/^([^.]+)\./);
  if (!entityMatch) {
    return null;
  }
  const entityName = entityMatch[1];
  const remaining = lookupText.substring(entityName.length + 1);
  const questionMarkIndex = remaining.indexOf('?');
  const criteriaText = questionMarkIndex >= 0 ? remaining.substring(0, questionMarkIndex) : remaining;
  const flagsText = questionMarkIndex >= 0 ? remaining.substring(questionMarkIndex + 1) : '';
  const items = flagsText ? flagsText.split('&') : [];
  const flagNames = new Set(items.map((item) => item.split('=')[0].toLowerCase()));
  const unknownBareFlags = items
    .map((item) => item.trim())
    .filter((item) => item !== '' && !item.includes('='))
    .map((item) => item.toLowerCase())
    .filter((item) => !KNOWN_BARE_FLAGS.has(item));
  return { EntityName: entityName, CriteriaText: criteriaText, FlagsText: flagsText, FlagNames: flagNames, UnknownBareFlags: unknownBareFlags };
}

/**
 * Parses `Field1=Value1&Field2=Value2`. Names and values are trimmed; a value may hold `=`.
 * @returns The pairs, or null when an item has no `=`
 */
export function ParseLookupPairs(criteriaText: string): LookupPair[] | null {
  const pairs: LookupPair[] = [];
  for (const item of criteriaText.split('&')) {
    const match = item.match(/^(.+?)=(.+)$/);
    if (!match) {
      return null;
    }
    pairs.push({ Name: match[1].trim(), Value: match[2].trim() });
  }
  return pairs;
}

/** The `key=value` flags items that are not `create` or `allowDefer`, with URI-decoded values. */
export function ParseLookupCreateFields(flagsText: string): LookupPair[] {
  const fields: LookupPair[] = [];
  for (const item of flagsText.split('&')) {
    if (KNOWN_BARE_FLAGS.has(item.toLowerCase())) {
      continue;
    }
    const [key, value] = item.split('=');
    if (key && value) {
      fields.push({ Name: key, Value: decodeURIComponent(value) });
    }
  }
  return fields;
}
