/**
 * everything.txt C6 — "deactivate" has to stop the connection, not just flag it.
 *
 * Before this, IsActive=false stopped syncs (the engine checks it) and nothing else. The cron
 * jobs kept firing, DISCOVERY was never gated at all — so a paused connection went on rescanning
 * the vendor on a timer — and an in-flight sync ran to the end. Each test below pins one of the
 * three things that now have to happen, plus the two things that must NOT.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');

function methodBody(name: string): string {
  const i = SRC.indexOf(`async ${name}(`);
  expect(i, `${name} not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(i);
  const end = rest.search(/\n    @(Query|Mutation)\(/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('IntegrationDeactivateConnection — pause means pause', () => {
  const body = () => methodBody('IntegrationDeactivateConnection');

  it('writes IsActive=false before anything else can fail', () => {
    // The flag is what every other actor reads. If a later step throws, the connection must
    // still be paused — a half-done pause that left IsActive true would be the worst outcome.
    const b = body();
    const flag = b.indexOf('ci.IsActive = false');
    const schedules = b.indexOf('findScheduledJobsForConnection');
    expect(flag).toBeGreaterThan(-1);
    expect(schedules).toBeGreaterThan(flag);
  });

  it('pauses the scheduled jobs', () => {
    expect(body()).toMatch(/DecideSchedulesToPause/);
    expect(body()).toMatch(/setScheduledJobStatus\([^)]*'Paused'/s);
  });

  it('records what it paused through the guard that survives a second pause', () => {
    // DecidePauseWrite is the only thing standing between a re-pause and a lost record.
    expect(body()).toMatch(/DecidePauseWrite/);
    expect(body()).toMatch(/WritePausedSchedules/);
  });

  it('asks an in-flight sync to stop', () => {
    expect(body()).toMatch(/CancelSyncAsync/);
  });

  it('reports how far the cancel actually reached instead of assuming', () => {
    const b = body();
    expect(b).toMatch(/DescribeCancelScope/);
    expect(b).toMatch(/IsSyncRunningInThisProcess/);
    expect(b).toMatch(/CancelScope/);
  });

  it('NEVER touches entity maps — those are the user\'s table selection, not pause state', () => {
    const b = body();
    expect(b).not.toMatch(/DisableUnselectedEntityMaps/);
    expect(b).not.toMatch(/SetEntityMapEnabled/);
    expect(b).not.toMatch(/Company Integration Entity Maps/);
  });

  it('returns the richer type, so a caller can tell a real stop from a hope', () => {
    expect(SRC).toMatch(/@Mutation\(\(\) => DeactivateConnectionOutput\)\s*\n\s*async IntegrationDeactivateConnection/);
  });
});

describe('IntegrationReactivateConnection — restore exactly what pause took', () => {
  const body = () => methodBody('IntegrationReactivateConnection');

  it('restores through the record, not by activating everything', () => {
    const b = body();
    expect(b).toMatch(/DecideSchedulesToResume/);
    // The tell for the bug this avoids: no unconditional sweep to Active.
    expect(b).not.toMatch(/jobs\.map\([^)]*'Active'/s);
  });

  it('consumes the record so the NEXT pause is not treated as a re-pause', () => {
    // DecidePauseWrite refuses to write when a record is stored. Leaving a consumed record
    // behind would make every future pause a silent no-op.
    expect(body()).toMatch(/WritePausedSchedules\(ci\.Configuration, \[\]\)/);
  });

  it('still does not rescan the source by default', () => {
    // Resuming a connection and rescanning its schema stay separate decisions.
    expect(body()).toMatch(/@Arg\("runSchemaRefresh"[^\n]*defaultValue: false/);
  });
});

describe('a Save() that returns false is never mistaken for one that worked', () => {
  // Save() reports a logical failure by returning false, not by throwing. An unchecked save of the
  // pause record strands the schedules it paused; an unchecked save of the cleared record makes the
  // next pause record nothing.
  for (const name of ['IntegrationDeactivateConnection', 'IntegrationReactivateConnection']) {
    it(`${name} checks every ci.Save()`, () => {
      const b = methodBody(name);
      const all = b.match(/ci\.Save\(\)/g) ?? [];
      const checked = b.match(/if \(!await ci\.Save\(\)\)/g) ?? [];
      expect(all.length).toBeGreaterThan(1);
      expect(checked.length).toBe(all.length);
    });
  }

  it('pause saves its record BEFORE it moves any job, and moves nothing if that save fails', () => {
    const b = methodBody('IntegrationDeactivateConnection');
    const record = b.indexOf('ci.Configuration = WritePausedSchedules(');
    const recordSave = b.indexOf('if (!await ci.Save())', record);
    const firstMove = b.indexOf("setScheduledJobStatus(rec.ID, 'Paused'");
    expect(record).toBeGreaterThan(-1);
    expect(recordSave).toBeGreaterThan(record);
    expect(firstMove).toBeGreaterThan(recordSave);
    expect(b.slice(recordSave, firstMove)).toMatch(/throw new Error/);
  });

  it('resume says so on every reply when the record will not clear', () => {
    const b = methodBody('IntegrationReactivateConnection');
    expect(b).toMatch(/scheduleNote = ' The record of paused schedules could not be cleared/);
    const carried = (b.match(/\+ scheduleNote/g) ?? []).length + (b.match(/\$\{scheduleNote\}/g) ?? []).length;
    expect(carried).toBe(4);
  });
});

describe('the connection job finder escapes through the shared helpers', () => {
  it('validates the connection id with sqlUuid and quotes job type ids with EscapeSQLString', () => {
    const i = SRC.indexOf('private async findScheduledJobsForConnection');
    const b = SRC.slice(i, SRC.indexOf('private async describeIfPaused'));
    expect(i).toBeGreaterThan(-1);
    expect(b).not.toMatch(/\.replace\(\/'\/g/);
    expect(b).toMatch(/sqlUuid\(companyIntegrationID, 'companyIntegrationID'\)/);
    expect(b).toMatch(/EscapeSQLString\(id\)/);
  });
});

describe('a paused connection is not scanned', () => {
  it('the detached discovery start refuses', () => {
    expect(methodBody('IntegrationStartSchemaRefresh')).toMatch(/describeIfPaused/);
  });

  it('the synchronous refresh refuses', () => {
    expect(methodBody('IntegrationRefreshConnectorSchema')).toMatch(/describeIfPaused/);
  });

  it('schema evolution refuses', () => {
    expect(methodBody('IntegrationSchemaEvolution')).toMatch(/describeIfPaused/);
  });

  it('both lock-taking paths check BEFORE acquiring the maintenance lock, so a refusal leaks no lock', () => {
    for (const name of ['IntegrationRefreshConnectorSchema', 'IntegrationSchemaEvolution']) {
      const b = methodBody(name);
      const gate = b.indexOf('describeIfPaused');
      const lock = b.indexOf('AcquireMaintenanceLock');
      expect(gate, `${name}: gate missing`).toBeGreaterThan(-1);
      expect(lock, `${name}: lock missing`).toBeGreaterThan(-1);
      expect(gate, `${name}: gate must precede the lock`).toBeLessThan(lock);
    }
  });

  it('the gate fails OPEN — an unreadable connection is not declared paused', () => {
    const i = SRC.indexOf('private async describeIfPaused');
    expect(i).toBeGreaterThan(-1);
    const b = SRC.slice(i, i + 1400);
    expect(b).toMatch(/catch[\s\S]*return null/);
  });
});
