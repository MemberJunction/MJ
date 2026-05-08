import { Command, Args, Flags } from '@oclif/core';
import { getValidatedConfig } from '../../config';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Dialect-aware migration scaffolder. Produces a Flyway-compatible filename
 * and a starter body matching MJ's migration conventions (schema placeholder,
 * consolidated ALTER TABLE, no __mj timestamp columns — CodeGen handles those).
 *
 * Filename format:
 *   T-SQL: V{YYYYMMDDHHMM}__v{version}.x__{description}.sql
 *   PG:    V{YYYYMMDDHHMM}__v{version}.x__{description}.pg.sql
 */
export default class MigrateCreate extends Command {
  static description = 'Scaffold a new migration file for the current database platform';

  static examples = [
    `<%= config.bin %> <%= command.id %> "Add FooID to Bar"`,
    `<%= config.bin %> <%= command.id %> "Add FooID to Bar" --version 5.25 --platform postgresql`,
    `<%= config.bin %> <%= command.id %> "Add FooID to Bar" --dir ./migrations/v5`,
  ];

  static args = {
    description: Args.string({
      description: 'Short description (will be converted to PascalCase with underscores)',
      required: true,
    }),
  };

  static flags = {
    version: Flags.string({
      char: 'v',
      description: 'Migration version tag, e.g. "5.25" (default: parsed from repo baseline or "0.0")',
    }),
    platform: Flags.string({
      char: 'p',
      description: 'Override platform: sqlserver | postgresql (default: config.dbPlatform)',
      options: ['sqlserver', 'postgresql'],
    }),
    dir: Flags.string({
      description: 'Output directory (default: ./migrations/v5 or ./migrations-pg/v5)',
    }),
    'x-x': Flags.boolean({
      description: 'Use {version}.x.x suffix instead of {version}.x (e.g. 5.25.x instead of 5.25.x)',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(MigrateCreate);
    const config = getValidatedConfig();

    const platform = (flags.platform ?? config.dbPlatform ?? 'sqlserver') as 'sqlserver' | 'postgresql';
    const isPG = platform === 'postgresql';
    const version = flags.version ?? this.detectLatestVersion(isPG) ?? '0.0';

    const description = this.sanitizeDescription(args.description);
    const timestamp = this.timestamp();
    const suffix = isPG ? '.pg.sql' : '.sql';
    const filename = `V${timestamp}__v${version}.x__${description}${suffix}`;

    const outputDir = flags.dir ?? this.defaultMigrationsDir(isPG);
    fs.mkdirSync(outputDir, { recursive: true });
    const fullPath = path.join(outputDir, filename);

    if (fs.existsSync(fullPath)) {
      this.error(`Migration file already exists: ${fullPath}`);
    }

    const body = isPG ? this.pgTemplate(description, version) : this.tsqlTemplate(description, version);
    fs.writeFileSync(fullPath, body, 'utf8');

    this.log(`Created ${platform} migration:`);
    this.log(`  ${fullPath}`);
    this.log('');
    this.log('Next steps:');
    this.log('  1. Edit the file with your schema changes');
    this.log('  2. Run `mj migrate` to apply it');
    if (!isPG) {
      this.log('  3. Run `mj sql-convert` (or mj migrate convert) to produce the PG counterpart');
    }
  }

  /**
   * YYYYMMDDHHMM in the local timezone — matches existing MJ migration filenames.
   */
  private timestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
      String(now.getFullYear()) +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      pad(now.getHours()) +
      pad(now.getMinutes())
    );
  }

  /**
   * Convert a free-form description to the PascalCase_With_Underscores format
   * used throughout migrations/v5. Strips characters that aren't valid in a filename.
   */
  private sanitizeDescription(raw: string): string {
    return raw
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim()
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('_');
  }

  private defaultMigrationsDir(isPG: boolean): string {
    const root = isPG ? 'migrations-pg' : 'migrations';
    return path.join(process.cwd(), root, 'v5');
  }

  /**
   * Best-effort latest-version detection by scanning filenames in the target migrations dir.
   * Returns undefined if the directory is empty or can't be read — caller falls back to "0.0".
   */
  private detectLatestVersion(isPG: boolean): string | undefined {
    const dir = this.defaultMigrationsDir(isPG);
    if (!fs.existsSync(dir)) return undefined;
    try {
      const entries = fs.readdirSync(dir);
      const versionRe = /__v(\d+\.\d+(?:\.x)?)[._]/;
      const versions = entries
        .map(f => f.match(versionRe)?.[1])
        .filter((v): v is string => !!v)
        .map(v => v.replace(/\.x$/, ''));
      if (versions.length === 0) return undefined;
      versions.sort((a, b) => {
        const [aMaj, aMin] = a.split('.').map(Number);
        const [bMaj, bMin] = b.split('.').map(Number);
        return aMaj !== bMaj ? aMaj - bMaj : aMin - bMin;
      });
      return versions[versions.length - 1];
    } catch {
      return undefined;
    }
  }

  private tsqlTemplate(description: string, version: string): string {
    const human = description.replace(/_/g, ' ');
    return `-- ${human} (v${version}.x)
-- T-SQL migration for MemberJunction core schema.
--
-- Conventions (see /migrations/CLAUDE.md):
--   * Use \${flyway:defaultSchema} for the schema placeholder
--   * Use hardcoded UUIDs, never NEWID()
--   * Never insert __mj timestamp columns — CodeGen handles them
--   * Consolidate multiple ADD clauses into a single ALTER TABLE
--   * Add sp_addextendedproperty descriptions for every new column

-- Example:
-- ALTER TABLE \${flyway:defaultSchema}.MyTable ADD
--     NewColumn NVARCHAR(100) NULL;
--
-- EXEC sp_addextendedproperty
--     @name = N'MS_Description',
--     @value = N'Describe what this column does',
--     @level0type = N'SCHEMA', @level0name = N'\${flyway:defaultSchema}',
--     @level1type = N'TABLE',  @level1name = N'MyTable',
--     @level2type = N'COLUMN', @level2name = N'NewColumn';
`;
  }

  private pgTemplate(description: string, version: string): string {
    const human = description.replace(/_/g, ' ');
    return `-- ${human} (v${version}.x)
-- PostgreSQL migration for MemberJunction core schema.
--
-- Conventions:
--   * Use \${flyway:defaultSchema} for the schema placeholder (resolved by Skyway)
--   * Use hardcoded UUIDs, never gen_random_uuid() in seed data
--   * Never insert __mj timestamp columns — CodeGen-installed triggers maintain them
--   * Use COMMENT ON COLUMN for descriptions

-- Example:
-- ALTER TABLE "\${flyway:defaultSchema}"."MyTable"
--     ADD COLUMN "NewColumn" VARCHAR(100) NULL;
--
-- COMMENT ON COLUMN "\${flyway:defaultSchema}"."MyTable"."NewColumn"
--     IS 'Describe what this column does';
`;
  }
}
