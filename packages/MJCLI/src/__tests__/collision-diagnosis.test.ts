import { describe, it, expect } from 'vitest';
import { DiagnoseCollision } from '../lib/collision-diagnosis';

// Captured from the real CDP failure (MJ#4503) and reproduced on a live
// SQL Server by MJ#4524 arm B. Do not "tidy" this string.
const REAL_ERROR = [
  "Violation of PRIMARY KEY constraint 'PK__Credenti__3214EC27D685D4A7'.",
  "Cannot insert duplicate key in object '__mj.CredentialType'.",
  'The duplicate key value is (82dff26b-2abb-4a69-8718-1fe550b60816).',
].join(' ');

describe('DiagnoseCollision', () => {
  it('extracts schema, table and row id from the real error', () => {
    expect(DiagnoseCollision(REAL_ERROR)).toEqual({
      Schema: '__mj',
      Table: 'CredentialType',
      RowID: '82dff26b-2abb-4a69-8718-1fe550b60816',
    });
  });

  it('still matches when MJ wraps the driver error', () => {
    const wrapped = `Error executing SQL\n    Error: ${REAL_ERROR}\n    Query: EXEC ...`;
    expect(DiagnoseCollision(wrapped)?.RowID).toBe('82dff26b-2abb-4a69-8718-1fe550b60816');
  });

  it('returns null for a UNIQUE violation — only PK collisions are repairable this way', () => {
    const unique = [
      "Violation of UNIQUE KEY constraint 'UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID'.",
      "Cannot insert duplicate key in object '__mj.AIPromptModel'.",
      'The duplicate key value is (d7ffc613-4b45-4c55-a8b9-d3cd246ca7fe).',
    ].join(' ');
    expect(DiagnoseCollision(unique)).toBeNull();
  });

  it('returns null for a composite key — repair targets exactly one row', () => {
    const composite = [
      "Violation of PRIMARY KEY constraint 'PK__X'.",
      "Cannot insert duplicate key in object '__mj.Y'.",
      'The duplicate key value is (d7ffc613-4b45-4c55-a8b9-d3cd246ca7fe, b7267218-302b-4c09-9875-8df06aaa1695).',
    ].join(' ');
    expect(DiagnoseCollision(composite)).toBeNull();
  });

  it('returns null when the key value is not a GUID', () => {
    const notGuid = [
      "Violation of PRIMARY KEY constraint 'PK__X'.",
      "Cannot insert duplicate key in object '__mj.Y'.",
      'The duplicate key value is (42).',
    ].join(' ');
    expect(DiagnoseCollision(notGuid)).toBeNull();
  });

  it('returns null for an unrelated error', () => {
    expect(DiagnoseCollision('Invalid object name __mj.Foo.')).toBeNull();
  });
});
