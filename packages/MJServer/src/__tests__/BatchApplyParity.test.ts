/**
 * The two apply paths must agree, because the shared connector surface collapses onto the batch
 * one. Two defects made them differ, and both are invisible until a surface migrates:
 *
 *  - MJ-APPLY-12: the batch never made the first-apply full-sync determination, and its input
 *    declared `defaultValue: false` for FullSync, which made the null-coalesce dead code. A
 *    re-apply the caller left unspecified therefore ran INCREMENTAL against objects whose
 *    watermark the schema change had just reset. everything.txt: "for the very first RSU of a
 *    connector, the sync afterwards should be chosen to be full/incremental, but always full
 *    generally as the default."
 *  - MJ-APPLY-13: the batch's skipRestart branch never applied remove-as-disable, so
 *    UnselectedAction was a silent no-op and a deselected table kept syncing.
 *
 * Read from source: both live in a resolver that needs a provider, a connector and an RSU
 * pipeline to invoke, and the property under test is a one-line policy, not a behaviour worth
 * standing all that up to observe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'),
  'utf-8',
);

/** The body of a named input class, up to its closing brace. */
function classBody(name: string): string {
  const start = SRC.indexOf(`class ${name} {`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(start);
  const end = rest.indexOf('\n}');
  return end === -1 ? rest : rest.slice(0, end);
}

/** The body of a named resolver method, up to the next method at the same indent. */
function methodBody(name: string): string {
  const start = SRC.indexOf(`async ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(start);
  const end = rest.search(/\n    @(Query|Mutation)\(/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('MJ-APPLY-12 first-apply full sync', () => {
  it('the batch resolves FullSync from prior maps, not from a bare false', () => {
    const body = methodBody('IntegrationApplyAllBatch');
    expect(body).toMatch(/const fullSync = input\.FullSync\s*\?\?\s*!hadPriorMaps;/);
    expect(body).toMatch(/FullSync:\s*fullSync,/);
    expect(body).not.toMatch(/input\.FullSync\s*\?\?\s*false/);
  });

  it('ApplyAllBatchInput.FullSync has NO defaultValue, or the coalesce is dead again', () => {
    // Scope to the CLASS. There are several `FullSync?: boolean` fields in this file and a bare
    // find() picks ApplyAllInput's, which would pass no matter what the batch input declared.
    const body = classBody('ApplyAllBatchInput');
    const line = body.split('\n').find(l => l.includes('FullSync?: boolean') && l.includes('@Field'));
    expect(line, 'ApplyAllBatchInput.FullSync not found').toBeDefined();
    expect(line!).not.toMatch(/defaultValue/);
  });

  it('the single-connector path still does the same thing', () => {
    expect(methodBody('IntegrationApplyAll')).toMatch(/input\.FullSync\s*\?\?\s*!hadPriorMaps/);
  });

  it('the prior-maps read UUID-validates the connection id, like every other caller-supplied id', () => {
    // The batch takes its CompanyIntegrationIDs from the caller. The rest of this resolver refuses a
    // non-UUID id with sqlUuid before it reaches an ExtraFilter; quote-doubling is not that check.
    const body = methodBody('IntegrationApplyAllBatch');
    expect(body).toMatch(/CompanyIntegrationID='\$\{sqlUuid\(connInput\.CompanyIntegrationID, 'CompanyIntegrationID'\)\}'/);
    expect(body).not.toMatch(/connInput\.CompanyIntegrationID\.replace\(/);
  });

  it('the skipRestart branch starts its sync with the RESOLVED FullSync, as the restart path queues it', () => {
    // The restart path carries the coalesced value in its PendingWork; the skipRestart branch starts
    // the sync itself. Passing the raw input there means an omitted FullSync is undefined, which
    // startSyncAfterApply reads as incremental — against tables the apply just created.
    const body = methodBody('IntegrationApplyAllBatch');
    const call = body.match(/this\.startSyncAfterApply\(build\.connInput\.CompanyIntegrationID,[^)]*\)/);
    expect(call, 'skipRestart sync start not found').not.toBeNull();
    expect(call![0]).not.toMatch(/input\.FullSync/);
    expect(call![0]).toMatch(/build\.fullSync\)$/);
    expect(body).toMatch(/^\s*fullSync,$/m);
  });

  it('the prior-maps probe skips the row count, as the single path does', () => {
    // MaxRows: 1 is an existence probe; without SkipTotalRowCount the provider follows every hit
    // with a COUNT(*) over the connection's maps.
    const body = methodBody('IntegrationApplyAllBatch');
    const probe = body.slice(body.indexOf('const priorMapsResult'), body.indexOf('const hadPriorMaps'));
    expect(probe).toMatch(/MaxRows:\s*1,/);
    expect(probe).toMatch(/SkipTotalRowCount:\s*true/);
  });
});

describe('MJ-APPLY-13 remove-as-disable', () => {
  it('the batch skipRestart branch disables unselected maps', () => {
    const body = methodBody('IntegrationApplyAllBatch');
    expect(body).toMatch(/UnselectedAction\s*\?\?\s*'disable'\)\s*!==\s*'ignore'/);
    expect(body).toMatch(/DisableUnselectedEntityMaps\(/);
  });

  it('and honours the ignore opt-out rather than always disabling', () => {
    const body = methodBody('IntegrationApplyAllBatch');
    const at = body.indexOf('DisableUnselectedEntityMaps(');
    // the guard must precede the call, not follow it
    expect(body.lastIndexOf("!== 'ignore'", at)).toBeGreaterThan(-1);
  });
});
