import type { CollisionDiagnosis } from './collision-diagnosis';
import { IsRepairableEntityRef } from './repair-target';

/**
 * Turns a collision into operator guidance.
 *
 * The cause is stated CONDITIONALLY. The recognizer triggers on any single-GUID
 * primary-key collision, not only ones from `Metadata_Sync`, so it cannot know
 * that a `sync push` planted the row — it can only say what to do if that is what
 * happened. Asserting the cause is how this would send someone to delete a row
 * they should keep.
 *
 * The paste-ready command is printed only when `mj migrate repair` would accept
 * the table name, using that command's own predicate (`IsRepairableEntityRef`).
 * `DiagnoseCollision`'s object capture is wider than `--entity` accepts — a
 * three-part or bracketed name (e.g. `tempdb.dbo.#MigratedArtifacts`) reaches
 * here — and printing a command the tool then refuses blames the operator for a
 * string this function generated.
 */
export function FormatCollisionGuidance(
  diagnosis: CollisionDiagnosis,
  /** The failing migration's filename, when the failure path knows it. */
  migrationFilename: string | undefined,
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

  lines.push(
    '',
    `    If you do not recognise this row, do NOT delete it — investigate first.`,
    `    'mj migrate repair' is irreversible and discards any local edits to the row.`,
    '',
  );

  return lines;
}
