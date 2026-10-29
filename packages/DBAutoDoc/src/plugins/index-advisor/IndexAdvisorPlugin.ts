/**
 * Index Advisor — built-in DBAutoDoc plugin.
 *
 * At the end of a run it reads the existing indexes, proposes new ones from what DBAutoDoc
 * learned (foreign keys, discovered primary keys, column statistics), flags redundant existing
 * indexes, and stores everything in `state.plugins.IndexAdvisor`. The `index-migration` export
 * format turns the proposals into a SQL migration.
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseAutoDocPlugin } from '../BaseAutoDocPlugin.js';
import type { AutoDocExporter, AutoDocPluginContext, AutoDocPluginJSONValue } from '../types.js';
import type { BaseAutoDocDriver } from '../../drivers/BaseAutoDocDriver.js';
import type { AutoDocIndex } from '../../types/driver.js';
import type { DatabaseDocumentation } from '../../types/state.js';
import type { IndexAdvisorData, IndexAdvisorOptions } from './IndexAdvisorTypes.js';
import { ProposeIndexes, FindRedundantIndexes } from './IndexRules.js';
import { IndexMigrationGenerator } from './IndexMigrationGenerator.js';
import { IndexLLMReviewer } from './IndexLLMReview.js';

export const INDEX_ADVISOR_PLUGIN_NAME = 'IndexAdvisor';

export const DEFAULT_INDEX_ADVISOR_OPTIONS: IndexAdvisorOptions = {
  MinRowCount: 1000,
  IncludeDiscoveredFKs: true,
  KeyMinConfidence: 90,
  LLMReview: true,
  MaxLLMTables: 40,
  // PostgreSQL: build indexes without locking writes on a live database (Craig, 2026-10-08)
  Concurrently: true
};

@RegisterClass(BaseAutoDocPlugin, INDEX_ADVISOR_PLUGIN_NAME)
export class IndexAdvisorPlugin extends BaseAutoDocPlugin {
  public override async OnPostRun(context: AutoDocPluginContext): Promise<void> {
    if (!context.Driver) {
      throw new Error('Index Advisor needs an open database connection');
    }
    const options = ResolveIndexAdvisorOptions(context.Options);
    const { Existing, SkippedSchemas } = await readExistingIndexes(context.Driver, context.State);
    const data: IndexAdvisorData = {
      AnalyzedAt: new Date().toISOString(),
      Options: options,
      Existing,
      Proposed: ProposeIndexes(withoutSkippedSchemas(context.State, SkippedSchemas), Existing, options),
      Redundant: FindRedundantIndexes(Existing),
      SkippedSchemas
    };
    if (options.LLMReview) {
      await runLLMReview(context, data);
    }
    this.SetData(context, INDEX_ADVISOR_PLUGIN_NAME, data);
    context.Log(
      `Index Advisor: ${data.Existing.length} existing index(es), ${data.Proposed.length} proposed, ${data.Redundant.length} redundant` +
        (SkippedSchemas.length ? `, ${SkippedSchemas.length} schema(s) skipped` : '') +
        (data.LLMReview ? `; LLM review: ${data.LLMReview.TablesReviewed} table(s), ${data.LLMReview.Dropped.length} dropped, ${data.LLMReview.Errors.length} error(s)` : '')
    );
  }

  public override GetExporters(): AutoDocExporter[] {
    return [{
      Format: 'index-migration',
      Description: 'SQL migration creating the indexes proposed by the Index Advisor',
      Generate: (state, options) => {
        const data = GetIndexAdvisorData(state);
        return data ? new IndexMigrationGenerator().Generate(data, options) : [];
      }
    }];
  }
}

/** The Index Advisor's section of a state file, when the plugin has run. */
export function GetIndexAdvisorData(state: DatabaseDocumentation): IndexAdvisorData | undefined {
  return state.plugins?.[INDEX_ADVISOR_PLUGIN_NAME]?.Data as IndexAdvisorData | undefined;
}

/** Merges config-file options over the defaults, ignoring values of the wrong type. */
export function ResolveIndexAdvisorOptions(raw: { [key: string]: AutoDocPluginJSONValue }): IndexAdvisorOptions {
  const num = (v: AutoDocPluginJSONValue | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const bool = (v: AutoDocPluginJSONValue | undefined, d: boolean) => (typeof v === 'boolean' ? v : d);
  const d = DEFAULT_INDEX_ADVISOR_OPTIONS;
  return {
    MinRowCount: num(raw['MinRowCount'], d.MinRowCount),
    IncludeDiscoveredFKs: bool(raw['IncludeDiscoveredFKs'], d.IncludeDiscoveredFKs),
    KeyMinConfidence: num(raw['KeyMinConfidence'], d.KeyMinConfidence),
    LLMReview: bool(raw['LLMReview'], d.LLMReview),
    MaxLLMTables: num(raw['MaxLLMTables'], d.MaxLLMTables),
    Concurrently: bool(raw['Concurrently'], d.Concurrently)
  };
}

/** Reads indexes schema by schema; a schema that fails is recorded and skipped. */
async function readExistingIndexes(
  driver: BaseAutoDocDriver,
  state: DatabaseDocumentation
): Promise<Pick<IndexAdvisorData, 'Existing' | 'SkippedSchemas'>> {
  const existing: AutoDocIndex[] = [];
  const skipped: IndexAdvisorData['SkippedSchemas'] = [];
  for (const schema of state.schemas) {
    try {
      existing.push(...(await driver.GetIndexes(schema.name)));
    } catch (err) {
      skipped.push({ SchemaName: schema.name, Error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { Existing: existing, SkippedSchemas: skipped };
}

/**
 * The state limited to schemas whose indexes were read. Proposing for a schema whose existing
 * indexes are unknown would suggest indexes that may already exist.
 */
function withoutSkippedSchemas(state: DatabaseDocumentation, skipped: IndexAdvisorData['SkippedSchemas']): DatabaseDocumentation {
  const skippedNames = new Set(skipped.map((s) => s.SchemaName));
  return skippedNames.size ? { ...state, schemas: state.schemas.filter((s) => !skippedNames.has(s.name)) } : state;
}

/**
 * Lets the LLM keep, drop, modify or add proposals. Any failure to set up the model keeps the
 * rule-based proposals and is recorded in the review summary.
 */
async function runLLMReview(context: AutoDocPluginContext, data: IndexAdvisorData): Promise<void> {
  const platform = context.State.database.provider ?? context.Config.database.provider ?? 'sqlserver';
  try {
    const reviewer = await IndexLLMReviewer.Create(context.Config.ai, context.Log);
    const reviewed = await reviewer.Review(context.State, data, platform);
    data.Proposed = reviewed.Proposals;
    data.LLMReview = reviewed.Summary;
  } catch (err) {
    data.LLMReview = {
      Model: context.Config.ai.modelOverrides?.['indexAdvisor']?.model ?? context.Config.ai.model,
      TablesReviewed: 0, TokensUsed: 0, Dropped: [], Rejected: [],
      Errors: [{ TableName: '*', Error: err instanceof Error ? err.message : String(err) }]
    };
  }
}
