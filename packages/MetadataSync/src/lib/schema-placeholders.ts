/**
 * @fileoverview Which schema names a captured push log turns into Flyway placeholders (#3618).
 *
 * `formatAsMigration` alone rewrites only the core schema to `${flyway:defaultSchema}`. That is right
 * in MJ's own repo and wrong in an Open App repo, where `${flyway:defaultSchema}` is the app schema
 * and core is `${mjSchema}`. A repo states its mapping once: `.mj-sync.json`
 * `sqlLogging.schemaPlaceholders`, else `mj.config.cjs` `SQLOutput.schemaPlaceholders` (the array
 * CodeGen already reads).
 * @module schema-placeholders
 */
import type { SqlSchemaPlaceholder } from '@memberjunction/generic-database-provider';
import type { MJConfig, SyncConfig } from '../config';
import { EscapeRegExp } from './sql-set-line';

/** The rule used when no mapping is configured: the core schema becomes `${flyway:defaultSchema}`. */
export const DEFAULT_SCHEMA_PLACEHOLDER: SqlSchemaPlaceholder = { schema: '__mj', placeholder: '${flyway:defaultSchema}' };

/**
 * The schema placeholder rules for a push or watch log: `.mj-sync.json` `sqlLogging.schemaPlaceholders`
 * when it has a rule, else `mj.config.cjs` `SQLOutput.schemaPlaceholders`. Undefined when neither has
 * one, so the logger keeps its single-schema default. Entries without both a schema and a placeholder
 * are dropped.
 */
export function ResolveSchemaPlaceholders(syncConfig: SyncConfig | null | undefined, mjConfig: MJConfig | null | undefined): SqlSchemaPlaceholder[] | undefined {
  const fromSync = validRules(syncConfig?.sqlLogging?.schemaPlaceholders);
  if (fromSync.length > 0) {
    return fromSync;
  }
  const fromMjConfig = validRules(sqlOutputRules(mjConfig));
  return fromMjConfig.length > 0 ? fromMjConfig : undefined;
}

/**
 * Rewrites each `schema.` / `[schema].` in `sql` to its placeholder in one pass, longest schema first,
 * so `__mj` never matches the start of `__mj_BizApps`. A match needs a following `.` and no word
 * character before it, so a schema name inside string data is left alone. Brackets are kept.
 */
export function ApplySchemaPlaceholders(sql: string, rules: readonly SqlSchemaPlaceholder[]): string {
  const bySchema = new Map<string, string>();
  for (const rule of rules) {
    if (rule.schema && rule.placeholder && !bySchema.has(rule.schema)) {
      bySchema.set(rule.schema, rule.placeholder);
    }
  }
  if (bySchema.size === 0) {
    return sql;
  }
  const alternatives = [...bySchema.keys()].sort((a, b) => b.length - a.length).map(EscapeRegExp).join('|');
  const pattern = new RegExp(`(?<![\\w$])(\\[?)(${alternatives})(\\]?)\\.`, 'g');
  return sql.replace(pattern, (_match, open: string, schema: string, close: string) => `${open}${bySchema.get(schema)}${close}.`);
}

/** `SQLOutput.schemaPlaceholders` of an `mj.config.cjs`, read without trusting its shape. */
function sqlOutputRules(mjConfig: MJConfig | null | undefined): unknown {
  const sqlOutput: unknown = mjConfig?.SQLOutput;
  if (sqlOutput === null || typeof sqlOutput !== 'object' || !('schemaPlaceholders' in sqlOutput)) {
    return undefined;
  }
  return sqlOutput.schemaPlaceholders;
}

function validRules(value: unknown): SqlSchemaPlaceholder[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const rules: SqlSchemaPlaceholder[] = [];
  for (const entry of value) {
    if (entry !== null && typeof entry === 'object' && 'schema' in entry && 'placeholder' in entry) {
      const { schema, placeholder } = entry;
      if (typeof schema === 'string' && schema.length > 0 && typeof placeholder === 'string' && placeholder.length > 0) {
        rules.push({ schema, placeholder });
      }
    }
  }
  return rules;
}
