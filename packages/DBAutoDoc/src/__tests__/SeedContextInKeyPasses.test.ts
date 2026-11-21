import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import nunjucks from 'nunjucks';
import { SeedContextExcerpt, DEFAULT_SEED_KEY_PASS_MAX_CHARS } from '../utils/seed-context';
import { LLMDiscoveryValidator } from '../discovery/LLMDiscoveryValidator';
import { ColumnStatsCache } from '../discovery/ColumnStatsCache';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver';
import type { AIConfig, DBAutoDocConfig, RelationshipDiscoveryConfig } from '../types/config';
import { AnalysisEngine } from '../core/AnalysisEngine';
import { PromptEngine } from '../prompts/PromptEngine';
import type { StateManager } from '../state/StateManager';
import type { IterationTracker } from '../state/IterationTracker';
import type { AnalysisRun, DatabaseDocumentation } from '../types/state';
import type { PKCandidate, RelationshipDiscoveryPhase } from '../types/discovery';

/**
 * The operator's seed context (customInstructions, which also carries seedContext.file / files)
 * used to reach only the table-analysis prompt. The PK/FK passes, where a data-layout summary
 * helps most, never saw it. They now get the paragraphs that name their table, capped.
 */

const layout = [
  '# Horse registry layout',
  'Every registration row belongs to one horse: registration.horse_id references horse.id.',
  'Transfers move ownership: transfer.horse_id and transfer.owner_id reference horse.id and owner.id.',
  'Show results are loaded nightly from an external system and are not linked by key.',
].join('\n\n');

describe('SeedContextExcerpt', () => {
  it('returns only the paragraphs that name the table', () => {
    expect(SeedContextExcerpt({ customInstructions: layout }, ['transfer'])).toBe(
      'Transfers move ownership: transfer.horse_id and transfer.owner_id reference horse.id and owner.id.'
    );
  });

  it('matches whole names only', () => {
    // "horse" is not mentioned by "horses" or "seahorse"; it is in "horse.id"
    expect(SeedContextExcerpt({ customInstructions: 'Seahorses are unrelated.\n\nhorses plural.' }, ['horse'])).toBeUndefined();
    expect(SeedContextExcerpt({ customInstructions: layout }, ['registration'])).toContain('registration.horse_id');
  });

  it('returns nothing when no paragraph names the table', () => {
    expect(SeedContextExcerpt({ customInstructions: layout }, ['invoice'])).toBeUndefined();
  });

  it('returns the whole text for a whole-schema prompt', () => {
    expect(SeedContextExcerpt({ customInstructions: layout }, [])).toBe(layout);
  });

  it('caps the text, by default and when configured, and sends none at 0', () => {
    const long = 'horse '.repeat(5000);
    expect(SeedContextExcerpt({ customInstructions: long }, [])!.length).toBe(DEFAULT_SEED_KEY_PASS_MAX_CHARS + '\n…(truncated)'.length);
    expect(SeedContextExcerpt({ customInstructions: long, keyPassMaxChars: 100 }, [])).toBe(`${long.slice(0, 100)}\n…(truncated)`);
    expect(SeedContextExcerpt({ customInstructions: layout, keyPassMaxChars: 0 }, [])).toBeUndefined();
  });

  it('returns nothing without a seed', () => {
    expect(SeedContextExcerpt(undefined, ['horse'])).toBeUndefined();
    expect(SeedContextExcerpt({ overallPurpose: 'x' } as { customInstructions?: string }, ['horse'])).toBeUndefined();
  });
});

function render(templateName: string, ctx: object): string {
  const env = new nunjucks.Environment(null, { autoescape: false }); // as PromptEngine configures it
  env.addFilter('jsoninline', (obj: object) => JSON.stringify(obj));
  env.addFilter('join', (arr: string[], sep = ', ') => (Array.isArray(arr) ? arr.join(sep) : ''));
  const template = fs.readFileSync(new URL(`../../prompts/${templateName}`, import.meta.url), 'utf-8');
  return env.renderString(template, ctx);
}

describe('key-inference prompts show the operator notes', () => {
  const base = { sourceSchema: 'dbo', sourceTable: 'transfer', candidates: [], allTables: [], proposals: [] };

  it.each(['pk-pruning-table.md', 'fk-pruning-table.md', 'pk-pruning-holistic.md', 'fk-pruning-holistic.md'])('%s renders the notes only when there are some', (name) => {
    const out = render(name, { ...base, seedExcerpt: 'transfer.owner_id references owner.id' });
    expect(out).toContain('## Notes from the operator about this data');
    expect(out).toContain('transfer.owner_id references owner.id');
    expect(render(name, base)).not.toContain('## Notes from the operator');
  });
});

describe('LLMDiscoveryValidator', () => {
  class TestableValidator extends LLMDiscoveryValidator {
    public Notes(table: string): string { return this.seedNotes(table); }
  }
  const make = (customInstructions?: string) => new TestableValidator(
    {} as BaseAutoDocDriver,
    {} as RelationshipDiscoveryConfig,
    { provider: 'gemini', model: 'm', apiKey: 'k' } as AIConfig,
    new ColumnStatsCache(),
    [],
    customInstructions ? { customInstructions } : undefined
  );

  it('adds the paragraphs that name the target table to its prompt', () => {
    const notes = make(layout).Notes('transfer');
    expect(notes).toContain('## Notes from the operator about this data');
    expect(notes).toContain('transfer.owner_id');
    expect(notes).not.toContain('Show results');
  });

  it('adds nothing without a seed context', () => {
    expect(make().Notes('transfer')).toBe('');
  });
});

describe('AnalysisEngine.PrunePrimaryKeys', () => {
  it('sends the table\'s notes to the per-table pass and the whole text to the holistic pass', async () => {
    const contexts: Array<{ name: string; seedExcerpt?: string }> = [];
    const promptEngine = new PromptEngine({ provider: 'gemini', model: 'm', apiKey: 'k' }, fileURLToPath(new URL('../../prompts', import.meta.url)));
    vi.spyOn(promptEngine, 'executePrompt').mockImplementation(async (name: string, ctx: { seedExcerpt?: string }) => {
      contexts.push({ name, seedExcerpt: ctx.seedExcerpt });
      return { success: true, tokensUsed: 0, result: [{ action: 'remove', index: 1, reasoning: 'r' }] };
    });
    const stateManager = { findTable: () => undefined, updateSummary: () => undefined, save: async () => undefined } as Partial<StateManager> as StateManager;
    const config = {
      ai: { provider: 'gemini', model: 'm', apiKey: 'k' },
      analysis: { backpropagation: { maxDepth: 1 }, convergence: { maxIterations: 1, stabilityWindow: 1, confidenceThreshold: 0.8 } },
    } as DBAutoDocConfig;
    const engine = new AnalysisEngine(config, promptEngine, stateManager, {} as IterationTracker);

    const candidate = { schemaName: 'dbo', tableName: 'transfer', columnNames: ['owner_id'], confidence: 60, status: 'candidate' } as Partial<PKCandidate> as PKCandidate;
    const keyDetection = { discovered: { primaryKeys: [candidate], foreignKeys: [] } } as Partial<RelationshipDiscoveryPhase> as RelationshipDiscoveryPhase;
    const state: DatabaseDocumentation = {
      version: '1.0.0',
      summary: { createdAt: '', lastModified: '', totalIterations: 0, totalPromptsRun: 0, totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, estimatedCost: 0, totalSchemas: 1, totalTables: 1, totalColumns: 0 },
      database: { name: 'T', server: 'x', analyzedAt: '' },
      seedContext: { customInstructions: layout },
      schemas: [{ name: 'dbo', descriptionIterations: [], tables: [{ name: 'transfer', rowCount: 1, columns: [], dependsOn: [], dependents: [], descriptionIterations: [] }] }],
      phases: { descriptionGeneration: [], keyDetection },
    };
    await engine.PrunePrimaryKeys(state, {} as AnalysisRun);

    expect(contexts.map(c => c.name)).toEqual(['pk-pruning-table', 'pk-pruning-holistic']);
    expect(contexts[0].seedExcerpt).toBe('Transfers move ownership: transfer.horse_id and transfer.owner_id reference horse.id and owner.id.');
    expect(contexts[1].seedExcerpt).toBe(layout);
  });
});
