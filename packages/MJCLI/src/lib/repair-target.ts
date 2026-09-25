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

/**
 * True when `entity` is a name `mj migrate repair` can actually target — the
 * same predicate `ParseEntityRef` applies, exposed as a boolean so the
 * collision guidance can decide whether to print a paste-ready command without
 * duplicating the rule. `DiagnoseCollision`'s object capture admits dots,
 * brackets and whitespace (a temp table reports as `tempdb.dbo.#Foo`), so a
 * guidance line built from it can name something `repair` will refuse; this
 * shared check is what stops the two modules disagreeing.
 */
export function IsRepairableEntityRef(entity: string): boolean {
  return ParseEntityRef(entity) !== null;
}

/**
 * True when `migrationSql` mentions `id` — the spec's third refusal: an ID
 * present in the database but in an entity the failing migration does not
 * touch must be refused rather than deleted.
 *
 * A plain case-insensitive substring test, deliberately. The migration is a
 * recording of `spCreate<X> @ID = '<fixed GUID>'` calls, so the GUID appears
 * literally; parsing T-SQL to do better is exactly the general-purpose SQL
 * parsing the spec rules out of scope.
 */
export function MigrationMentionsId(migrationSql: string, id: string): boolean {
  return migrationSql.toLowerCase().includes(id.toLowerCase());
}
