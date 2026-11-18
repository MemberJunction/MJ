/**
 * Two ways the schema-evolution path stopped short of acting on what it already knew.
 *
 *  - MJ-RUN-37: the persist layer has always recorded an `IncrementalWatermarkField` change and
 *    nothing consumed the record. `changedObjects` — the sole input to `ResetPullWatermarks` — was
 *    built from a physical column diff and a field-map add/disable, and a cursor swap produces
 *    neither. The stale Pull watermark then became a lower bound on a DIFFERENT column, and where
 *    the new column sorts later, every row below it was filtered out at the source, permanently and
 *    invisibly (an incremental's fetched-vs-expected check agrees, because the source counts
 *    against the filter it was handed).
 *
 *  - MJ-APPLY-6 residual: `RunPipelineBatchWithRetry` existed and two of the six pipeline call
 *    sites used it. `SchemaBuilder.RunSchemaPipeline` states the reason plainly — the middle steps
 *    fail transiently and "the callers simply never used it".
 *
 * The evolution mutation needs a provider, a connector, a SchemaBuilder and an RSU pipeline to
 * invoke, and the properties here are wiring, not behaviour worth standing all that up to observe.
 * Read from source, the convention this directory already uses for this method. The DECISION the
 * wiring feeds is unit-tested for real in the integration-engine package
 * (WatermarkFieldChangeIsAChange.test.ts) — these pin that the resolver calls it, feeds it the
 * right input, and does so before the watermark reset.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');
const PROMOTER = readFileSync(join(__dirname, '..', 'integration', 'CustomColumnPromoter.ts'), 'utf-8');
const RSU_RESOLVER = readFileSync(join(__dirname, '..', 'resolvers', 'RSUResolver.ts'), 'utf-8');

/** The body of a named resolver method, up to the next @Query/@Mutation at the same indent. */
function methodBody(src: string, name: string): string {
  const start = src.indexOf(`async ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  const end = rest.search(/\n    @(Query|Mutation)\(/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('MJ-RUN-37 — a watermark-field change reaches ResetPullWatermarks', () => {
  const body = () => methodBody(SRC, 'IntegrationSchemaEvolution');

  it('consumes the persist layer\'s detection rather than re-deriving it', () => {
    // The whole defect was that this signal existed and had no consumer. It must come from the
    // refresh's OWN PersistResult — re-reading the catalog afterwards cannot tell a changed
    // watermark field from one that was always that way.
    expect(body()).toMatch(/ObjectsWithWatermarkFieldChange\(\s*refresh\.PersistResult\?\.ObjectMergeLog \?\? \[\]/);
  });

  it('imports it from the engine that produces it', () => {
    expect(SRC).toMatch(/ObjectsWithWatermarkFieldChange[\s\S]{0,200}?from "@memberjunction\/integration-engine"/);
  });

  it('scopes it to the CONTINUING maps, so it cannot report what nothing can reset', () => {
    expect(body()).toMatch(/continuingMaps\.map\(m => m\.ExternalObjectName \?\? ''\)/);
  });

  it('folds the result into changedObjects — the only input ResetPullWatermarks has', () => {
    const b = body();
    const push = b.search(/if \(!changedObjects\.some\(n => n\.toLowerCase\(\) === name\.toLowerCase\(\)\)\) changedObjects\.push\(name\)/);
    const reset = b.indexOf('ResetPullWatermarks(');
    expect(push, 'the watermark-changed names are never pushed onto changedObjects').toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(-1);
    expect(push, 'the push must happen BEFORE the reset, or it changes nothing').toBeLessThan(reset);
  });

  it('does not push unconditionally — an unchanged run must not re-full-sync the connection', () => {
    // The guard is the expensive half. `changedObjects` drives ResetPullWatermarks AND HasChanges,
    // so a rule that fires when no cursor moved turns every refresh into a full re-fetch of
    // everything. The emptiness of the detection is what has to carry that, never a bare loop.
    const b = body();
    const i = b.indexOf('ObjectsWithWatermarkFieldChange(');
    const after = b.slice(i, i + 600);
    expect(after).toMatch(/for \(const name of watermarkFieldChanged\)/);
    expect(after).not.toMatch(/changedObjects\.push\(\.\.\./);
  });
});

describe('MJ-APPLY-6 residual — the bare pipeline calls that should retry', () => {
  it('IntegrationApplySchemaBatch retries, matching its single-connector sibling', () => {
    // IntegrationApplySchema retries via SchemaBuilder.RunSchemaPipeline. Same install path, same
    // generated DDL, same four transient steps — the batch simply never used the wrapper.
    const b = methodBody(SRC, 'IntegrationApplySchemaBatch');
    expect(b).toMatch(/rsm\.RunPipelineBatchWithRetry\(pipelineInputs\)/);
    expect(b).not.toMatch(/rsm\.RunPipelineBatch\(/);
  });

  it('IntegrationSchemaEvolution retries', () => {
    const b = methodBody(SRC, 'IntegrationSchemaEvolution');
    expect(b).toMatch(/rsm\.RunPipelineBatchWithRetry\(/);
    expect(b).not.toMatch(/rsm\.RunPipelineBatch\(/);
  });

  it('the custom-column promoter retries — it runs unattended, mid-sync', () => {
    expect(PROMOTER).toMatch(/RuntimeSchemaManager\.Instance\.RunPipelineBatchWithRetry\(batchInputs\)/);
    expect(PROMOTER).not.toMatch(/RuntimeSchemaManager\.Instance\.RunPipelineBatch\(/);
  });

  it('no bare RunPipelineBatch survives in the integration resolver', () => {
    // A regression here is invisible at runtime: the pipeline still works, it just stops
    // absorbing the hiccup it was wrapped to absorb.
    expect(SRC).not.toMatch(/RunPipelineBatch\((?!\w)/);
  });

  it('RunRuntimeSchemaUpdateBatch deliberately does NOT retry, and says why', () => {
    // The one exception, kept explicit so it reads as a decision rather than an oversight: this
    // mutation replays CALLER-AUTHORED SQL, and executeMigration is not transactional.
    const b = methodBody(RSU_RESOLVER, 'RunRuntimeSchemaUpdateBatch');
    expect(b).toMatch(/rsm\.RunPipelineBatch\(pipelineInputs\)/);
    expect(b).toMatch(/deliberately the BARE call/);
    expect(b).toMatch(/NOT transactional/);
  });
});
