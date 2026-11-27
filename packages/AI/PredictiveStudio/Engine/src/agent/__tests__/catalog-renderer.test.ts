/**
 * A3 attack 8 (DD-2): the Data Scout and Goal Analyst read a compact catalog — every entity's name, schema, base view and
 * a truncated one-line description, with fields only for the entities within two hops of the target — and the Data
 * Scout prompt stays within its 30,000-token budget with the catalog in it; its template no longer says a `Pending`
 * query may be drafted.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EntityInfo } from '@memberjunction/core';

import { CatalogRenderer } from '../catalog-renderer';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../../..');
const template = (name: string): string => readFileSync(path.join(repoRoot, `metadata/prompts/templates/model-development-agent/${name}.template.md`), 'utf8');

/** A UUID for the n-th synthetic entity or field. */
const id = (kind: number, n: number): string => `6A1D2E3F-0000-4000-${String(8000 + kind)}-${String(n).padStart(12, '0')}`;

/**
 * A chain A → B → C → D (each a foreign key to the next) plus `filler` unrelated entities with long descriptions: the
 * hop rule shows fields for A, B and C (within two hops of A) and not for D.
 */
function chain(filler: number): EntityInfo[] {
  const names = ['Chain A', 'Chain B', 'Chain C', 'Chain D'];
  const chained = names.map((name, i) => new EntityInfo({
    ID: id(1, i), Name: name, SchemaName: 'pstest', BaseView: `vw${name.replace(' ', '')}`, Description: `${name} rows.`,
    Fields: [
      { ID: id(2, i * 10), Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Sequence: 1 },
      { ID: id(2, i * 10 + 1), Name: `${name.replace(' ', '')}Score`, Type: 'int', Sequence: 2 },
      ...(i < names.length - 1 ? [{ ID: id(2, i * 10 + 2), Name: `Next${i}ID`, Type: 'uniqueidentifier', Sequence: 3, RelatedEntityID: id(1, i + 1), RelatedEntity: names[i + 1] }] : []),
    ],
  }));
  const long = 'A very long description that keeps going on and on about the entity, its purpose, its history and every caveat anyone ever wrote down. '.repeat(4);
  const rest = Array.from({ length: filler }, (_, n) => new EntityInfo({
    ID: id(3, n), Name: `Filler Entity ${n}`, SchemaName: '__mj', BaseView: `vwFillerEntity${n}`, Description: long,
    Fields: Array.from({ length: 20 }, (_f, k) => ({ ID: id(4, n * 100 + k), Name: `Column${k}`, Type: 'nvarchar', Length: 100, Sequence: k + 1 })),
  }));
  return [...chained, ...rest];
}

describe('A3 attack 8: CatalogRenderer.Compact', () => {
  it('renders fields for the entities within two hops of the target and name + one line for the rest', () => {
    const out = CatalogRenderer.Compact(chain(3), 'Chain A', 2);
    expect(out).toContain(CatalogRenderer.MARKER);
    for (const reachable of ['ChainAScore', 'ChainBScore', 'ChainCScore']) expect(out).toContain(reachable);
    expect(out).not.toContain('ChainDScore');
    expect(out).toContain('Chain D');
    expect(out).toContain('Filler Entity 2');
    expect(out).not.toContain('Column7');
  });

  it('truncates every description to the fixed length', () => {
    const out = CatalogRenderer.Compact(chain(3), 'Chain A', 2);
    const fillerLine = out.split('\n').find((l) => l.includes('Filler Entity 0')) || '';
    expect(fillerLine.length).toBeLessThanOrEqual(CatalogRenderer.DESCRIPTION_LENGTH + 120);
    expect(fillerLine).toContain('…');
  });

  it('with no target, lists every entity at entity level only (the Goal Analyst catalog)', () => {
    const out = CatalogRenderer.Compact(chain(2), null, 2);
    expect(out).toContain('Chain A');
    expect(out).not.toContain('ChainAScore');
  });

  it('stays within the DD-2 token budget on a catalog larger than the shipped one (600 entities)', () => {
    const out = CatalogRenderer.Compact(chain(600), 'Chain A', 2);
    expect(CatalogRenderer.EstimateTokens(out)).toBeLessThanOrEqual(CatalogRenderer.TOKEN_BUDGET);
    expect(out).toContain('Filler Entity 599');
  });
});

describe('A3 attack 8: the Data Scout and Goal Analyst templates', () => {
  it('the Data Scout template renders the catalog under its marker and fits the 30,000-token prompt budget with it', () => {
    const scout = template('data-scout');
    expect(scout).toContain(CatalogRenderer.MARKER);
    expect(scout).toContain(`{{ ${CatalogRenderer.DATA_KEY} }}`);
    expect(CatalogRenderer.EstimateTokens(scout) + CatalogRenderer.TOKEN_BUDGET).toBeLessThanOrEqual(CatalogRenderer.DATA_SCOUT_PROMPT_TOKENS);
  });

  it('the Data Scout template no longer says a Pending query may be drafted', () => {
    const scout = template('data-scout');
    expect(scout).not.toMatch(/Status\s*=\s*'Pending'/);
    expect(scout).not.toMatch(/may be drafted/i);
    expect(scout).not.toMatch(/pending \(not-yet-approved\) draft/i);
  });

  it('the Goal Analyst template renders the catalog and the unit vocabulary (grain, decision date, censoring)', () => {
    const goal = template('goal-analyst');
    expect(goal).toContain(CatalogRenderer.MARKER);
    expect(goal).toContain(`{{ ${CatalogRenderer.DATA_KEY} }}`);
    for (const word of ['DecisionDateColumn', 'LabelWindowDays', 'Censoring', 'GrainEntity']) expect(goal).toContain(word);
  });
});
