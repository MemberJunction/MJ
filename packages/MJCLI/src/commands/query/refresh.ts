import { Command, Flags } from '@oclif/core';
import { InitializeProvider, CleanupProvider, GetSystemUser, LoadMJConfig } from '@memberjunction/metadata-sync';
import {
  FormatQueryRefreshRun,
  HasRefreshSelector,
  IsQueryRefreshProvider,
  QueryExtractionService,
} from '@memberjunction/core-entities-server';
import type { QueryRefreshRunReport } from '@memberjunction/core-entities-server';
import { QueryRefreshExit, QueryRefreshFilterFromFlags, QueryRefreshRunFailed } from '../../lib/query-refresh.js';

/**
 * `mj query refresh`: re-establishes saved queries' parameters, fields, entities and
 * dependencies from their SQL and the database server, without changing the SQL. Runs in
 * process as the System user; each query is refreshed in its own transaction, the queries a
 * composition depends on first.
 */
export default class QueryRefresh extends Command {
  static description = 'Refresh saved queries\' extracted parameters, fields, entities and dependencies from their SQL (the SQL is never changed).';

  static examples = [
    `<%= config.bin %> <%= command.id %> --all --dry-run`,
    `<%= config.bin %> <%= command.id %> --all`,
    `<%= config.bin %> <%= command.id %> --name "MJ/Reports/Top Customers"`,
    `<%= config.bin %> <%= command.id %> --category MJ --with-ai`,
    `<%= config.bin %> <%= command.id %> --entity "MJ: AI Agents"`,
  ];

  static flags = {
    id: Flags.string({ description: 'Query ID to refresh (repeatable)', multiple: true }),
    name: Flags.string({ description: 'Query name or full path Category/Sub/Name (repeatable); a bare name selects every query with that name', multiple: true }),
    category: Flags.string({ description: 'Category path: the queries in it and every category below it' }),
    entity: Flags.string({ description: 'Entity name: the queries that read it (repeatable)', multiple: true }),
    all: Flags.boolean({ description: 'Refresh every query' }),
    'dry-run': Flags.boolean({ description: 'Report the changes without writing anything' }),
    'with-ai': Flags.boolean({ description: 'Fill empty descriptions with the LLM description pass (off by default)' }),
    verbose: Flags.boolean({ char: 'v', description: 'Also list queries that are unchanged' }),
    format: Flags.string({ options: ['text', 'json'], default: 'text', description: 'Output format' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueryRefresh);
    const filter = QueryRefreshFilterFromFlags(flags);
    if (!HasRefreshSelector(filter)) {
      this.error('Give at least one of --id, --name, --category, --entity or --all.', { exit: 2 });
    }
    const run = await this.refresh(filter, flags['dry-run'], flags['with-ai']);
    if (flags.format === 'json') {
      this.log(JSON.stringify(run, null, 2));
    } else {
      for (const line of FormatQueryRefreshRun(run, !flags.verbose)) this.log(line);
    }
    QueryRefreshExit.Exit(QueryRefreshRunFailed(run) ? 1 : 0);
  }

  private async refresh(filter: ReturnType<typeof QueryRefreshFilterFromFlags>, dryRun: boolean, withAI: boolean): Promise<QueryRefreshRunReport> {
    const config = LoadMJConfig();
    if (!config) this.error('No mj.config.cjs found in the current directory or a parent directory.');
    const provider = await InitializeProvider(config);
    try {
      if (!IsQueryRefreshProvider(provider)) this.error('The configured database provider cannot run views.');
      const service = new QueryExtractionService({ Provider: provider, User: GetSystemUser() });
      return await service.RefreshQueries(filter, {
        DryRun: dryRun,
        WithAI: withAI,
        OnProgress: p => process.stderr.write(`[${p.Processed}/${p.Total}] ${p.Report.Outcome} ${p.Report.QueryName}\n`),
      });
    } finally {
      await CleanupProvider();
    }
  }
}
