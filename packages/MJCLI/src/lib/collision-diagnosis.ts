/**
 * Parses SQL Server error 2627 (primary-key violation) into the one row a
 * `mj migrate repair` can clear.
 *
 * Error 2627's message template is fixed, so this reads a documented shape:
 *   Violation of PRIMARY KEY constraint '<name>'.
 *   Cannot insert duplicate key in object '<schema>.<table>'.
 *   The duplicate key value is (<value>).
 *
 * Returns null unless the collision is unambiguously a single-GUID primary key.
 * Callers print the raw error when this returns null — see the fail-toward-silence
 * rule in plans/mj4503-metadata-sync-collision-repair.md.
 */
export type CollisionDiagnosis = {
  /** Schema of the colliding table, e.g. `__mj`. */
  Schema: string;
  /** Unqualified table name, e.g. `CredentialType`. */
  Table: string;
  /** The primary key of the row already present. */
  RowID: string;
};

const PK_VIOLATION = /Violation of PRIMARY KEY constraint/i;
const OBJECT = /Cannot insert duplicate key in object '([^'.]+)\.([^']+)'/i;
const KEY_VALUE = /The duplicate key value is \(([^)]*)\)/i;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function DiagnoseCollision(errorMessage: string): CollisionDiagnosis | null {
  if (!PK_VIOLATION.test(errorMessage)) return null;

  const object = OBJECT.exec(errorMessage);
  if (!object) return null;

  const keyValue = KEY_VALUE.exec(errorMessage);
  if (!keyValue) return null;

  // A composite key names more than one value; repair targets exactly one row.
  const value = keyValue[1].trim();
  if (!GUID.test(value)) return null;

  return { Schema: object[1], Table: object[2], RowID: value };
}
