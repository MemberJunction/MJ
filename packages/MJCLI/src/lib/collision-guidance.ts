import type { CollisionDiagnosis } from './collision-diagnosis';

/**
 * Turns a collision into operator guidance.
 *
 * The cause is stated CONDITIONALLY. The recognizer triggers on any single-GUID
 * primary-key collision, not only ones from `Metadata_Sync`, so it cannot know
 * that a `sync push` planted the row — it can only say what to do if that is what
 * happened. Asserting the cause is how this would send someone to delete a row
 * they should keep.
 */
export function FormatCollisionGuidance(
  diagnosis: CollisionDiagnosis,
  migrationFilename: string,
): string[] {
  const qualified = `${diagnosis.Schema}.${diagnosis.Table}`;
  return [
    '',
    `    A row already exists with the primary key this migration tries to create:`,
    `      Table: ${qualified}`,
    `      Row:   ${diagnosis.RowID}`,
    `      In:    ${migrationFilename}`,
    '',
    `    If this row was created by 'mj sync push' before the migration chain`,
    `    reached this file, the row is the release's own content arriving early.`,
    `    Removing it lets the migration create it canonically:`,
    '',
    `      mj migrate repair --id ${diagnosis.RowID} --entity ${qualified}`,
    `      mj migrate`,
    '',
    `    If you do not recognise this row, do NOT delete it — investigate first.`,
    `    'mj migrate repair' is irreversible and discards any local edits to the row.`,
    '',
  ];
}
