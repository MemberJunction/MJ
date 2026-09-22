/**
 * Pure validation for `mj migrate repair`'s two identifying flags.
 *
 * Both checks run before any database connection is attempted. `--id` must be
 * a GUID — it is later bound via `.input('id', sql.UniqueIdentifier, ...)`,
 * never interpolated. `--entity` is interpolated into the SELECT/DELETE text
 * because schema and table names cannot be parameterised, so instead they are
 * validated strictly: exactly one dot, and each side a plain identifier
 * (letters, digits, underscore; not starting with a digit) — nothing else,
 * no brackets, quotes, semicolons, or whitespace.
 *
 * Extracted out of `commands/migrate/repair.ts` so the refusal paths — the
 * only barrier in front of a string interpolated into a DELETE — can be unit
 * tested without booting oclif or a database.
 */

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** True when `id` is shaped like a GUID this command can bind as a parameter. */
export function IsValidRepairId(id: string): boolean {
  return GUID_PATTERN.test(id);
}

export type EntityRef = {
  /** e.g. `__mj` */
  Schema: string;
  /** e.g. `CredentialType` */
  Table: string;
};

/**
 * Parses `schema.table` into its two parts. Returns null for anything that
 * isn't exactly one dot separating two plain identifiers — including an
 * empty schema or table, a missing or extra dot, or an identifier containing
 * a character outside `[A-Za-z0-9_]` or starting with a digit.
 */
export function ParseEntityRef(entity: string): EntityRef | null {
  const parts = entity.split('.');
  if (parts.length !== 2) return null;

  const [schema, table] = parts;
  if (!IDENTIFIER_PATTERN.test(schema) || !IDENTIFIER_PATTERN.test(table)) return null;

  return { Schema: schema, Table: table };
}
