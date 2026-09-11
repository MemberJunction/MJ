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
    expect(body()).toMatch(/decideSchedulesToPause/);
    expect(body()).toMatch(/setScheduledJobStatus\([^)]*'Paused'/s);
  });

  it('records what it paused through the guard that survives a second pause', () => {
    // decidePauseWrite is the only thing standing between a re-pause and a lost record.
    expect(body()).toMatch(/decidePauseWrite/);
    expect(body()).toMatch(/writePausedSchedules/);
  });

  it('asks an in-flight sync to stop', () => {
    expect(body()).toMatch(/CancelSyncAsync/);
  });

  it('reports how far the cancel actually reached instead of assuming', () => {
    const b = body();
    expect(b).toMatch(/describeCancelScope/);
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
    expect(b).toMatch(/decideSchedulesToResume/);
    // The tell for the bug this avoids: no unconditional sweep to Active.
    expect(b).not.toMatch(/jobs\.map\([^)]*'Active'/s);
  });

  it('consumes the record so the NEXT pause is not treated as a re-pause', () => {
    // decidePauseWrite refuses to write when a record is stored. Leaving a consumed record
    // behind would make every future pause a silent no-op.
    expect(body()).toMatch(/writePausedSchedules\(ci\.Configuration, \[\]\)/);
  });

  it('still does not rescan the source by default', () => {
    // Resuming a connection and rescanning its schema stay separate decisions.
    expect(body()).toMatch(/@Arg\("runSchemaRefresh"[^\n]*defaultValue: false/);
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
