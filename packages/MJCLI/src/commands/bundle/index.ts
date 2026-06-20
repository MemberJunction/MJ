import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { createDistributionBundle } from '@memberjunction/installer';
import { getOptionalConfig } from '../../config';
import { resolveGitRef } from '../../lib/migration-fetch';

/**
 * `mj bundle` — produce a self-contained MemberJunction distribution zip for
 * offline / air-gapped installs. Thin wrapper over the installer's bundle logic;
 * the heavy lifting (sparse fetch + distribution assembly) lives in
 * `@memberjunction/installer`.
 */
export default class Bundle extends Command {
  static description = 'Create a self-contained MemberJunction distribution zip for offline/air-gapped installs';

  static examples = [
    '<%= config.bin %> <%= command.id %> --out ./mj-install.zip',
    '<%= config.bin %> <%= command.id %> --tag v5.38.0 --out ./mj-install.zip',
    '<%= config.bin %> <%= command.id %> --source . --out ./mj-install.zip',
    '<%= config.bin %> <%= command.id %> --tag v5.38.0 --with-migrations --out ./mj-install.zip',
    '<%= config.bin %> <%= command.id %> --with-migrations --db-platform postgresql --out ./mj-install.zip',
  ];

  static flags = {
    out: Flags.string({ char: 'o', description: 'Output zip path', required: true }),
    tag: Flags.string({ char: 't', description: 'Release tag to bundle (e.g. v5.38.0). Defaults to the latest branch tip.' }),
    source: Flags.string({ description: 'Bundle from a local working-tree directory instead of fetching from the repo' }),
    'with-migrations': Flags.boolean({
      description: 'Include the migration tree(s) so an air-gapped "mj migrate" can run offline. Ships both SQL Server and PostgreSQL trees by default.',
    }),
    'db-platform': Flags.string({
      description: "With --with-migrations, ship only this platform's migration tree instead of both",
      options: ['sqlserver', 'postgresql'],
      dependsOn: ['with-migrations'],
    }),
    'no-claude-pack': Flags.boolean({
      description: 'Exclude the Claude Code pack (CLAUDE.md + .claude/) from the bundle. By default the pack is included so air-gapped installs get the same out-of-the-box Claude experience as online installs.',
    }),
    verbose: Flags.boolean({ char: 'v', description: 'Show detailed output' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Bundle);
    const config = getOptionalConfig();

    const out = path.resolve(flags.out);
    const source = flags.source ? path.resolve(flags.source) : undefined;
    // Local source skips fetching; otherwise resolve the ref (tag → vX.Y.Z, branch unchanged).
    const ref = source ? undefined : resolveGitRef(flags.tag ?? config?.mjRepoBranch ?? 'main');
    const repoUrl = config?.mjRepoUrl;

    this.log(source ? `Bundling from local source: ${source}` : `Bundling ${ref} from ${repoUrl ?? 'the canonical MemberJunction repo'}...`);

    // oclif validates the value against `options`, but types it as a plain string;
    // map it to the literal union without an assertion.
    const dbPlatform = flags['db-platform'] === 'postgresql' ? 'postgresql' : flags['db-platform'] === 'sqlserver' ? 'sqlserver' : undefined;

    const includeClaudePack = !flags['no-claude-pack'];

    const result = await createDistributionBundle({
      Out: out,
      Ref: ref,
      RepoUrl: repoUrl,
      SourceDir: source,
      IncludeMigrations: flags['with-migrations'],
      MigrationPlatform: dbPlatform,
      IncludeClaudePack: includeClaudePack,
    });

    if (flags.verbose && result.UsedFallback) {
      this.log('Blobless partial clone unavailable; used the full sparse-checkout fallback.');
    }

    const migrationsNote = flags['with-migrations'] ? `, including migrations${dbPlatform ? ` (${dbPlatform})` : ''}` : '';
    const packNote = includeClaudePack ? '' : ' (Claude pack excluded)';
    this.log(`Created ${result.Out} (${result.EntryCount} entries${migrationsNote}${packNote}).`);
  }
}
