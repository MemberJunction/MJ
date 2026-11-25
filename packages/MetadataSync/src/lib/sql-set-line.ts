/**
 * @fileoverview Shared helpers for the push SQL log rewrites that work on the
 * `SET @<CodeName>_<12 hex>[_n] = <literal>` lines of a SQL Server save statement.
 * Used by the env redactor (env-sql-redactor.ts) and the lookup rewriter (lookup-sql.ts).
 * @module sql-set-line
 */
import type { BaseEntity } from '@memberjunction/core';

/** Registrations made without a save-call hash, which match any 12-hex suffix. */
export const ANY_SAVE_CALL_SUFFIX = '';

/** The 12-hex save-call hash of a variable suffix in a statement (`_<hash>` or `_<hash>_<n>`). */
const SAVE_CALL_SUFFIX = /_([0-9a-fA-F]{12})(?![0-9a-fA-F])/g;

/** The lower-cased save-call hashes named in a statement, plus `ANY_SAVE_CALL_SUFFIX`. */
export function SaveCallHashesIn(sql: string): Set<string> {
  const hashes = new Set<string>([ANY_SAVE_CALL_SUFFIX]);
  for (const match of sql.matchAll(SAVE_CALL_SUFFIX)) {
    hashes.add(match[1].toLowerCase());
  }
  return hashes;
}

/** `text` with every regular-expression metacharacter escaped. */
export function EscapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One whole `SET @<codeName>_<suffix>[_n] = <literal>` line. Group 1 is the indent, group 2 the
 * variable name. The suffix is the given hash, or any 12 hex when the hash is `ANY_SAVE_CALL_SUFFIX`.
 * `flags` must include `g` and `m`.
 */
export function SetLinePattern(codeName: string, hash: string, literals: string[], flags = 'gm'): RegExp {
  const alternatives = literals.map(EscapeRegExp).join('|');
  const suffix = hash === ANY_SAVE_CALL_SUFFIX ? '[0-9a-fA-F]{12}' : EscapeRegExp(hash);
  return new RegExp(`^([ \\t]*)SET (@${EscapeRegExp(codeName)}_${suffix}(?:_\\d+)?) = (?:${alternatives})[ \\t]*$`, flags);
}

/** The literal forms SQL Server writes for a value in a SET line. Empty when none can be matched. */
export function SqlLiteralsOf(value: unknown): string[] {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? [] : [`'${value.toISOString()}'`];
  }
  if (typeof value === 'boolean') {
    return [value ? '1' : '0'];
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    return [String(value)];
  }
  if (value !== null && typeof value === 'object') {
    return quotedLiterals(JSON.stringify(value));
  }
  if (typeof value !== 'string') {
    return [];
  }
  return [...quotedLiterals(value), ...stringValueLiterals(value)];
}

/** The IS-A level of `entity` whose table holds the field: walks up while a parent holds it. */
export function OwningLevel(entity: BaseEntity, fieldName: string): BaseEntity {
  let level = entity;
  while (level.ISAParent && level.EntityInfo.ParentEntityFieldNames?.has(fieldName)) {
    level = level.ISAParent;
  }
  return level;
}

/** `entity` and each IS-A parent above it, leaf first. */
export function IsALevels(entity: BaseEntity): BaseEntity[] {
  const levels: BaseEntity[] = [];
  let level: BaseEntity | null = entity;
  while (level) {
    levels.push(level);
    level = level.ISAParent;
  }
  return levels;
}

/** The number or bit literal forms of a string value that holds a number or a boolean. */
function stringValueLiterals(value: string): string[] {
  const trimmed = value.trim();
  const literals: string[] = [];
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    literals.push(trimmed);
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true') {
    literals.push('1');
  } else if (lower === 'false') {
    literals.push('0');
  }
  return literals;
}

function quotedLiterals(text: string): string[] {
  const escaped = text.replace(/'/g, "''");
  return [`N'${escaped}'`, `'${escaped}'`];
}
