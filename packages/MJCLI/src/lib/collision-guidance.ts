import type { CollisionDiagnosis } from './collision-diagnosis';
import { IsRepairableEntityRef } from './repair-target';

/**
 * The outcome of checking whether the colliding row's ID appears in the failing
 * migration — the spec's third refusal ("ID present but in an entity the failing
 * migration does not touch → refuse"), evaluated at the moment the guidance is
 * printed rather than left to the operator to remember.
 *
 * The check itself is a file read, so it happens at the call site (see
 * `commands/migrate/index.ts`) and only its RESULT reaches this module, which
 * stays pure. `MigrationMentionsId` in `repair-target.ts` is the single mention
 * predicate; `repair --migration` applies the same one.
 */
export type MigrationScopeCheck =
  /** The failing migration was read and the colliding ID appears in it. */
  | { Kind: 'InMigration' }
  /** The failing migration was read and the colliding ID is NOT in it. */
  | { Kind: 'NotInMigration' }
  /**
   * The failing migration could not be read — no path on this failure path, the
   * fetched slice already cleaned up, or the file unreadable. The check did not
   * run, and the output says so rather than implying it passed.
   */
  | { Kind: 'Unchecked'; Reason: string };

/**
 * Turns a collision into operator guidance.
 *
 * The cause is stated CONDITIONALLY. The recognizer triggers on any single-GUID
 * primary-key collision, not only ones from `Metadata_Sync`, so it cannot know
 * that a `sync push` planted the row — it can only say what to do if that is what
 * happened. Asserting the cause is how this would send someone to delete a row
 * they should keep.
 *
 * The paste-ready command is printed only when BOTH hold:
 *
 * 1. `mj migrate repair` would accept the table name, using that command's own
 *    predicate (`IsRepairableEntityRef`). `DiagnoseCollision`'s object capture is
 *    wider than `--entity` accepts — a three-part or bracketed name (e.g.
 *    `tempdb.dbo.#MigratedArtifacts`) reaches here — and printing a command the
 *    tool then refuses blames the operator for a string this function generated.
 * 2. the scope check did not come back `NotInMigration`. A row the failing
 *    migration never creates cannot be what is blocking it, so deleting it would
 *    destroy data for nothing. That refusal is unconditional here, because this
 *    is the one place the answer is known — `repair --migration` can only apply
 *    it when the operator still has the file and remembers to pass it.
 */
export function FormatCollisionGuidance(
  diagnosis: CollisionDiagnosis,
  /** The failing migration's filename, when the failure path knows it. */
  migrationFilename: string | undefined,
  /** Whether the colliding ID was found in that migration — computed by the caller. */
  scope: MigrationScopeCheck,
): string[] {
  const qualified = `${diagnosis.Schema}.${diagnosis.Table}`;

  const lines = [
    '',
    `    A row already exists with the primary key this migration tries to create:`,
    `      Table: ${qualified}`,
    `      Row:   ${diagnosis.RowID}`,
  ];
  if (migrationFilename) {
    lines.push(`      In:    ${migrationFilename}`);
  }

  // The scope refusal short-circuits everything below it: no cause paragraph and
  // no command, because both of those exist to lead somewhere this row must not
  // go. Deliberately says nothing that can be pasted.
  if (scope.Kind === 'NotInMigration') {
    const named = migrationFilename ? `(${migrationFilename})` : 'that failed';
    lines.push(
      '',
      `    This row's ID does not appear anywhere in the migration ${named},`,
      `    so the row does not appear to belong to it and removing it would not`,
      `    unblock the migration. No repair is offered for it here — the collision`,
      `    needs to be investigated manually before anything is deleted.`,
      '',
    );
    return lines;
  }

  lines.push(
    '',
    `    If this row was created by 'mj sync push' before the migration chain`,
    `    reached the migration that creates it, the row is the release's own`,
    `    content arriving early. Removing it lets the migration create it`,
    `    canonically:`,
    '',
  );

  if (IsRepairableEntityRef(qualified)) {
    // --migration is optional, but it is what makes `repair` verify the row
    // belongs to this migration before deleting it, so the printed command
    // always offers it when the filename is known.
    const migrationArg = migrationFilename ? ` --migration ${migrationFilename}` : '';
    lines.push(
      `      mj migrate repair --id ${diagnosis.RowID} --entity ${qualified}${migrationArg}`,
      `      mj migrate`,
    );
  } else {
    lines.push(
      `      'mj migrate repair' cannot target ${qualified}; it accepts only a`,
      `      schema-qualified name made of two plain identifiers. Identify and`,
      `      remove this row manually.`,
    );
  }

  // Never let silence read as a passed check.
  if (scope.Kind === 'Unchecked') {
    lines.push(
      '',
      `    NOTE: this run could NOT verify that the failing migration creates this`,
      `    row — ${scope.Reason}. Confirm the ID against the failure output above`,
      `    before deleting anything.`,
    );
  }

  lines.push(
    '',
    `    If you do not recognise this row, do NOT delete it — investigate first.`,
    `    'mj migrate repair' is irreversible and discards any local edits to the row.`,
    '',
  );

  return lines;
}
