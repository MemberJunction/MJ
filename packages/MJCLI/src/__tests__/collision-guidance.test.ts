import { describe, it, expect } from 'vitest';
import { FormatCollisionGuidance } from '../lib/collision-guidance';
import { ParseEntityRef } from '../lib/repair-target';

const DIAGNOSIS = {
  Schema: '__mj',
  Table: 'CredentialType',
  RowID: '82dff26b-2abb-4a69-8718-1fe550b60816',
};

describe('FormatCollisionGuidance', () => {
  const lines = FormatCollisionGuidance(DIAGNOSIS, 'V202608080752__v6.1.x__Metadata_Sync.sql');
  const text = lines.join('\n');

  it('names the row that is in the way', () => {
    expect(text).toContain('__mj.CredentialType');
    expect(text).toContain('82dff26b-2abb-4a69-8718-1fe550b60816');
  });

  it('gives the exact repair command, ready to paste', () => {
    expect(text).toContain(
      'mj migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
    );
  });

  it('states the cause conditionally, because the recognizer cannot know it', () => {
    // The trigger is deliberately wider than Metadata_Sync, so this must not
    // assert a cause. See "Widen the trigger" in the spec.
    expect(text).toMatch(/if this row was (created|planted)/i);
    expect(text).not.toMatch(/this row was planted by/i);
  });

  it('names the migration that failed', () => {
    expect(text).toContain('V202608080752__v6.1.x__Metadata_Sync.sql');
  });
});

// The guidance and `mj migrate repair` are two modules that must agree about
// what a targetable table name is: DiagnoseCollision's OBJECT capture admits
// dots, '#', spaces and brackets, while --entity accepts exactly two plain
// identifiers. Nothing tied them together before, so the guidance could print
// a command the tool then refused.
describe('FormatCollisionGuidance ↔ repair --entity', () => {
  it('only prints a repair command whose --entity `repair` would accept', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, 'V202608080752__v6.1.x__Metadata_Sync.sql').join('\n');
    const printed = /--entity (\S+)/.exec(text);
    expect(printed).not.toBeNull();
    expect(ParseEntityRef(printed![1])).toEqual({ Schema: '__mj', Table: 'CredentialType' });
  });

  it('omits the command for a three-part object name and says to act manually', () => {
    // e.g. a temp table, which error 2627 reports as `tempdb.dbo.#Foo`.
    const text = FormatCollisionGuidance(
      { Schema: 'tempdb', Table: 'dbo.#MigratedArtifacts', RowID: DIAGNOSIS.RowID },
      'V202608080752__v6.1.x__Metadata_Sync.sql',
    ).join('\n');
    expect(text).not.toContain('mj migrate repair --id');
    expect(text).not.toContain('--entity');
    expect(text).toMatch(/manually/i);
    // Still names what is in the way, so the operator has somewhere to start.
    expect(text).toContain('tempdb.dbo.#MigratedArtifacts');
    expect(text).toContain(DIAGNOSIS.RowID);
  });

  it('omits the command for a bracketed table name', () => {
    const text = FormatCollisionGuidance(
      { Schema: '__mj', Table: 'Credential]Type', RowID: DIAGNOSIS.RowID },
      'V1__x.sql',
    ).join('\n');
    expect(text).not.toContain('mj migrate repair --id');
  });
});

describe('FormatCollisionGuidance --migration', () => {
  it('passes the failing migration through, so the operator gets the check for free', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, 'V202608080752__v6.1.x__Metadata_Sync.sql').join('\n');
    expect(text).toContain(
      'mj migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType --migration V202608080752__v6.1.x__Metadata_Sync.sql',
    );
  });

  it('omits --migration, and the In: line, when the failure path has no filename', () => {
    // Migrate() throwing gives the SQL text but no per-migration detail.
    const text = FormatCollisionGuidance(DIAGNOSIS, undefined).join('\n');
    expect(text).not.toContain('--migration');
    expect(text).not.toContain('In:');
    expect(text).toContain(
      'mj migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
    );
  });
});
