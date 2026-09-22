import { describe, it, expect } from 'vitest';
import {
  IsRepairableEntityRef,
  IsValidRepairId,
  MigrationMentionsId,
  ParseEntityRef,
} from '../lib/repair-target';

describe('IsValidRepairId', () => {
  it('accepts a well-formed GUID', () => {
    expect(IsValidRepairId('82dff26b-2abb-4a69-8718-1fe550b60816')).toBe(true);
  });

  it('accepts an upper-case GUID', () => {
    expect(IsValidRepairId('82DFF26B-2ABB-4A69-8718-1FE550B60816')).toBe(true);
  });

  it('rejects a non-GUID string', () => {
    expect(IsValidRepairId('not-a-guid')).toBe(false);
  });

  it('rejects a GUID with an injected clause appended', () => {
    // If this guard were removed or loosened to a prefix match, this value
    // would sail through to the parameterised query anyway (harmless there),
    // but the point of this guard is to refuse anything that isn't *exactly*
    // a GUID before the command proceeds at all.
    expect(IsValidRepairId("82dff26b-2abb-4a69-8718-1fe550b60816'; DROP TABLE x --")).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(IsValidRepairId('')).toBe(false);
  });
});

describe('ParseEntityRef', () => {
  it('parses a valid schema-qualified entity', () => {
    expect(ParseEntityRef('__mj.CredentialType')).toEqual({ Schema: '__mj', Table: 'CredentialType' });
  });

  it('returns null with zero dots', () => {
    expect(ParseEntityRef('CredentialType')).toBeNull();
  });

  it('returns null with two dots (three parts)', () => {
    expect(ParseEntityRef('db.__mj.CredentialType')).toBeNull();
  });

  it('returns null with an empty schema', () => {
    expect(ParseEntityRef('.CredentialType')).toBeNull();
  });

  it('returns null with an empty table', () => {
    expect(ParseEntityRef('__mj.')).toBeNull();
  });

  it('returns null when the table contains a closing bracket', () => {
    expect(ParseEntityRef('__mj.Credential]Type')).toBeNull();
  });

  it('returns null when the table contains a semicolon', () => {
    expect(ParseEntityRef('__mj.Credential;DROP')).toBeNull();
  });

  it('returns null when the table contains a quote', () => {
    expect(ParseEntityRef("__mj.Credential'Type")).toBeNull();
  });

  it('returns null when the table contains a newline', () => {
    expect(ParseEntityRef('__mj.Credential\nType')).toBeNull();
  });

  it('returns null when the schema starts with a digit', () => {
    expect(ParseEntityRef('1mj.CredentialType')).toBeNull();
  });

  it('returns null when the table starts with a digit', () => {
    expect(ParseEntityRef('__mj.1CredentialType')).toBeNull();
  });
});

describe('IsRepairableEntityRef', () => {
  it('agrees with ParseEntityRef — it is the same predicate, shared', () => {
    for (const candidate of [
      '__mj.CredentialType',
      'CredentialType',
      'tempdb.dbo.#MigratedArtifacts',
      '__mj.Credential]Type',
      '__mj.',
    ]) {
      expect(IsRepairableEntityRef(candidate)).toBe(ParseEntityRef(candidate) !== null);
    }
  });
});

describe('MigrationMentionsId', () => {
  const ID = '82dff26b-2abb-4a69-8718-1fe550b60816';
  const MIGRATION = `EXEC [__mj].[spCreateCredentialType] @ID = '82DFF26B-2ABB-4A69-8718-1FE550B60816', @Name = 'x'`;

  it('matches regardless of case, because migrations record GUIDs upper-cased', () => {
    expect(MigrationMentionsId(MIGRATION, ID)).toBe(true);
    expect(MigrationMentionsId(MIGRATION.toLowerCase(), ID.toUpperCase())).toBe(true);
  });

  it('is false when the migration does not touch that row', () => {
    // The spec's third refusal: the recognizer fires on ANY single-GUID
    // collision, so an operator can arrive holding an unrelated ID.
    expect(MigrationMentionsId(MIGRATION, '00000000-0000-0000-0000-000000000000')).toBe(false);
  });

  it('is false for an empty migration', () => {
    expect(MigrationMentionsId('', ID)).toBe(false);
  });
});
