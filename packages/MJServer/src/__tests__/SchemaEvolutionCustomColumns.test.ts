/**
 * everything.txt C9: a custom column the source starts sending is CAPTURED automatically, but
 * turning it into a real column "requires that the user accepts" it.
 *
 * A schema refresh is where an operator asks what changed on the source, so that is where the
 * accumulated overflow columns should be offered. Offering is free; promoting is not. These pin
 * the split, and the one thing that makes acceptance cheap enough to offer at all: the accepted
 * columns ride the refresh's OWN migration instead of starting a second one, because two RSU
 * restarts back-to-back for a single user action is its own incident class here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'), 'utf-8');
const PROMOTER = readFileSync(join(__dirname, '..', 'integration', 'CustomColumnPromoter.ts'), 'utf-8');

function methodBody(name: string): string {
  const i = SRC.indexOf(`async ${name}(`);
  expect(i, `${name} not found`).toBeGreaterThan(-1);
  const rest = SRC.slice(i);
  const end = rest.search(/\n    @(Query|Mutation)\(/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('the refresh offers the overflow columns', () => {
  const body = () => methodBody('IntegrationSchemaEvolution');

  it('reports candidates on the output', () => {
    expect(SRC).toMatch(/CustomColumnCandidates\?: CustomColumnCandidate\[\]/);
    expect(body()).toMatch(/ListCandidates\(/);
  });

  it('reports them ALWAYS, not only when something was accepted', () => {
    // The listing must not sit inside the acceptance branch — an operator cannot accept a column
    // they were never shown.
    const b = body();
    const list = b.indexOf('ListCandidates(');
    const acceptGate = b.indexOf('if (accepted.size > 0)');
    expect(list).toBeGreaterThan(-1);
    expect(acceptGate).toBeGreaterThan(-1);
    expect(list, 'ListCandidates must run before the acceptance gate').toBeLessThan(acceptGate);
  });

  it('promotes NOTHING by default', () => {
    expect(SRC).toMatch(/@Arg\("acceptCustomColumns"[\s\S]{0,200}?defaultValue: \[\]/);
  });
});

describe('acceptance', () => {
  const body = () => methodBody('IntegrationSchemaEvolution');

  it('plans only the entities that own an accepted column', () => {
    // Planning a whole entity because ONE of its columns was accepted would promote its other
    // candidates too — exactly the un-asked-for materialisation the gate exists to prevent.
    const b = body();
    // It is not enough that the narrowed list is COMPUTED — it has to be what gets planned.
    expect(b).toMatch(/PlanPromotion\(companyIntegrationID, entitiesWithAccepted\)/);
    expect(b).toMatch(/filter\(c => accepted\.has\(c\.ColumnName\.toLowerCase\(\)\)\)/);
    expect(b).not.toMatch(/PlanPromotion\(companyIntegrationID, mapped\)/);
  });

  it('folds the accepted migrations into the SAME batch as the refresh DDL', () => {
    expect(body()).toMatch(/RunPipelineBatch\(\[rsuInput, \.\.\.promotionInputs\]\)/);
  });

  it('still runs a batch when the refresh itself has no DDL', () => {
    // Source shape unchanged but columns accepted: they still need their migration.
    expect(body()).toMatch(/else if \(promotionInputs\.length > 0\)/);
  });

  it('drops accepted columns from the outstanding offer, so they cannot be accepted twice', () => {
    const b = body();
    // The offer returned must be the FILTERED list, not the raw one.
    expect(b).toMatch(/const acceptedNames = new Set\(promotedColumns\.map\(c => c\.ColumnName\.toLowerCase\(\)\)\)/);
    expect(b).toMatch(/const outstandingCandidates = customColumnCandidates\.filter\(c => !acceptedNames\.has\(c\.ColumnName\.toLowerCase\(\)\)\)/);
    expect(b).toMatch(/CustomColumnCandidates: outstandingCandidates\.length > 0 \? outstandingCandidates : undefined/);
  });

  it('a candidates failure costs the offer, never the refresh', () => {
    const b = body();
    const i = b.indexOf('catch (candErr)');
    expect(i).toBeGreaterThan(-1);
    const handler = b.slice(i, i + 400);
    expect(handler).not.toMatch(/return \{[\s\S]{0,120}Success: false/);
    expect(handler).toMatch(/customColumnCandidates = \[\]/);
  });
});

describe('PlanPromotion — the split that makes one batch possible', () => {
  it('is public and runs no pipeline itself', () => {
    expect(PROMOTER).toMatch(/public async PlanPromotion\(/);
    const i = PROMOTER.indexOf('public async PlanPromotion(');
    const end = PROMOTER.indexOf('/** Entry point: promote custom columns');
    const body = PROMOTER.slice(i, end);
    expect(body).not.toMatch(/RunPipelineBatch\(/);
  });

  it('still purges stale staged keys during planning, before any column is created', () => {
    // This side effect belongs to planning: it is the only thing that ever cleans residue on rows
    // a sync never rewrites, so moving it out of the plan would resurrect phantom candidates.
    const i = PROMOTER.indexOf('public async PlanPromotion(');
    const end = PROMOTER.indexOf('/** Entry point: promote custom columns');
    expect(PROMOTER.slice(i, end)).toMatch(/purgeStaleOverflowKeys/);
  });

  it('carries the post-restart PendingWork on its first input, so it survives being appended', () => {
    const i = PROMOTER.indexOf('public async PlanPromotion(');
    const end = PROMOTER.indexOf('/** Entry point: promote custom columns');
    const body = PROMOTER.slice(i, end);
    expect(body).toMatch(/batchInputs\[0\]\.PendingWork/);
    expect(body).toMatch(/WorkType: 'promote-columns'/);
  });

  it('PromoteForSync now goes through it, so the two paths cannot drift', () => {
    expect(PROMOTER).toMatch(/const promotionPlan = await this\.PlanPromotion\(/);
  });
});
