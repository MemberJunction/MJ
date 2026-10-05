import { describe, it, expect } from 'vitest';
import { FormatCollisionGuidance, type MigrationScopeCheck } from '../lib/collision-guidance';
import { ParseEntityRef } from '../lib/repair-target';

const DIAGNOSIS = {
  Schema: '__mj',
  Table: 'CredentialType',
  RowID: '82dff26b-2abb-4a69-8718-1fe550b60816',
};

const MIGRATION = 'V202608080752__v6.1.x__Metadata_Sync.sql';

/** The failing migration was read and it does create this row. */
const IN_MIGRATION: MigrationScopeCheck = { Kind: 'InMigration' };
/** The failing migration was read and it does NOT create this row. */
const NOT_IN_MIGRATION: MigrationScopeCheck = { Kind: 'NotInMigration' };
/** The failing migration could not be read, so the check never ran. */
const UNCHECKED: MigrationScopeCheck = {
  Kind: 'Unchecked',
  Reason: 'this failure path did not report the migration file',
};

/** The one string an operator can paste; case 2 must never produce it. */
const PASTE_READY = 'mj migrate repair --id';

describe('FormatCollisionGuidance', () => {
  const lines = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, IN_MIGRATION);
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
    const text = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, IN_MIGRATION).join('\n');
    const printed = /--entity (\S+)/.exec(text);
    expect(printed).not.toBeNull();
    expect(ParseEntityRef(printed![1])).toEqual({ Schema: '__mj', Table: 'CredentialType' });
  });

  it('omits the command for a three-part object name and says to act manually', () => {
    // e.g. a temp table, which error 2627 reports as `tempdb.dbo.#Foo`.
    const text = FormatCollisionGuidance(
      { Schema: 'tempdb', Table: 'dbo.#MigratedArtifacts', RowID: DIAGNOSIS.RowID },
      MIGRATION,
      IN_MIGRATION,
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
      IN_MIGRATION,
    ).join('\n');
    expect(text).not.toContain('mj migrate repair --id');
  });
});

describe('FormatCollisionGuidance --migration', () => {
  it('passes the failing migration through, so the operator gets the check for free', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, IN_MIGRATION).join('\n');
    expect(text).toContain(
      'mj migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType --migration V202608080752__v6.1.x__Metadata_Sync.sql',
    );
  });

  it('omits --migration, and the In: line, when the failure path has no filename', () => {
    // Migrate() throwing gives the SQL text but no per-migration detail.
    // No filename means no file to read, so the scope check cannot have run.
    const text = FormatCollisionGuidance(DIAGNOSIS, undefined, UNCHECKED).join('\n');
    expect(text).not.toContain('--migration');
    expect(text).not.toContain('In:');
    expect(text).toContain(
      'mj migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
    );
  });
});

// MJ#4503, the spec's third refusal: "ID present but in an entity the failing
// migration does not touch → refuse". It shipped only as `repair --migration`,
// an optional flag, so the guarantee held only if the operator remembered it.
// The check now runs where the answer is knowable — the failing migration is
// still on disk when this output is built — and all three outcomes are stated,
// because a check that quietly does not run is worse than no check.
describe('FormatCollisionGuidance migration-scope check', () => {
  it('case 1: the migration creates this row — offers the repair, claims nothing else', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, IN_MIGRATION).join('\n');
    expect(text).toContain(
      `${PASTE_READY} 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType --migration ${MIGRATION}`,
    );
    // No refusal, and no "could not verify" caveat: the check ran and passed.
    expect(text).not.toMatch(/does not appear/i);
    expect(text).not.toMatch(/could NOT verify/i);
  });

  it('case 2: the migration does not mention the row — emits NO paste-ready command', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, NOT_IN_MIGRATION).join('\n');
    expect(text).not.toContain(PASTE_READY);
    expect(text).not.toContain('--entity');
    expect(text).not.toContain('--migration');
  });

  it('case 2: says the row does not appear to belong to this migration, and to investigate it', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, NOT_IN_MIGRATION).join('\n');
    expect(text).toMatch(/does not appear to belong to it/i);
    expect(text).toMatch(/investigated manually/i);
    // Still names the row and the migration, or the operator has nowhere to start.
    expect(text).toContain('__mj.CredentialType');
    expect(text).toContain(DIAGNOSIS.RowID);
    expect(text).toContain(MIGRATION);
  });

  it('case 2: does not state the sync-push cause it just contradicted', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, NOT_IN_MIGRATION).join('\n');
    expect(text).not.toMatch(/if this row was created by/i);
  });

  it('case 2 refuses even for a table `repair` would happily accept', () => {
    // The refusal is about scope, not about the name being targetable — so it
    // must fire on exactly the input case 1 accepts.
    const accepted = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, IN_MIGRATION).join('\n');
    const refused = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, NOT_IN_MIGRATION).join('\n');
    expect(accepted).toContain(PASTE_READY);
    expect(refused).not.toContain(PASTE_READY);
  });

  it('case 3: file unreadable — still offers the repair, but says the check did not run', () => {
    const unreadable: MigrationScopeCheck = {
      Kind: 'Unchecked',
      Reason: 'migrations/v6/V1__x.sql could not be read (EACCES: permission denied)',
    };
    const text = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, unreadable).join('\n');
    expect(text).toContain(PASTE_READY);
    expect(text).toMatch(/could NOT verify that the failing migration creates this/i);
    // The reason is surfaced verbatim, not swallowed.
    expect(text).toContain('EACCES: permission denied');
  });

  it('case 3: never claims a verification that did not happen', () => {
    const text = FormatCollisionGuidance(DIAGNOSIS, undefined, UNCHECKED).join('\n');
    expect(text).toMatch(/could NOT verify/i);
    expect(text).toContain('this failure path did not report the migration file');
  });

  it('case 1 carries no caveat, so case 3 is distinguishable from it', () => {
    const verified = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, IN_MIGRATION).join('\n');
    const unverified = FormatCollisionGuidance(DIAGNOSIS, MIGRATION, UNCHECKED).join('\n');
    expect(verified).not.toMatch(/could NOT verify/i);
    expect(unverified).toMatch(/could NOT verify/i);
    // Both offer the command; the caveat is the only difference in outcome.
    expect(verified).toContain(PASTE_READY);
    expect(unverified).toContain(PASTE_READY);
  });
});
