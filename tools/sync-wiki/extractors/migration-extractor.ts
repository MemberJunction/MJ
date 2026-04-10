import * as fs from 'fs';
import * as path from 'path';
import { VAULT_DIRS, type SyncConfig } from '../lib/config.js';
import { type HashCache } from '../lib/hasher.js';

interface MigrationEntry {
  filename: string;
  date: string;
  version: string;
  description: string;
  type: 'versioned' | 'baseline' | 'repeatable' | 'codegen';
}

function parseMigrationFilename(filename: string): MigrationEntry | null {
  // Versioned: V202602131500__v5.0.x__Entity_Name_Normalization.sql
  const versionedMatch = filename.match(
    /^V(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})__v([\d.x]+)__(.+)\.sql$/
  );
  if (versionedMatch) {
    const [, year, month, day, hour, minute, version, desc] = versionedMatch;
    return {
      filename,
      date: `${year}-${month}-${day} ${hour}:${minute}`,
      version: `v${version}`,
      description: desc.replace(/_/g, ' '),
      type: 'versioned',
    };
  }

  // Baseline: B202602151200__v5.0__Baseline.sql
  const baselineMatch = filename.match(
    /^B(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})__v([\d.]+)__(.+)\.sql$/
  );
  if (baselineMatch) {
    const [, year, month, day, hour, minute, version, desc] = baselineMatch;
    return {
      filename,
      date: `${year}-${month}-${day} ${hour}:${minute}`,
      version: `v${version}`,
      description: desc.replace(/_/g, ' '),
      type: 'baseline',
    };
  }

  // CodeGen: CodeGen_Run_2026-03-15_10-30-00.sql
  const codegenMatch = filename.match(
    /^CodeGen_Run_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.sql$/
  );
  if (codegenMatch) {
    const [, year, month, day, hour, minute] = codegenMatch;
    return {
      filename,
      date: `${year}-${month}-${day} ${hour}:${minute}`,
      version: 'codegen',
      description: 'CodeGen auto-generated migration',
      type: 'codegen',
    };
  }

  // Repeatable: R__RefreshMetadata.sql
  if (filename.startsWith('R__')) {
    return {
      filename,
      date: '',
      version: 'repeatable',
      description: filename.replace(/^R__/, '').replace(/\.sql$/, '').replace(/_/g, ' '),
      type: 'repeatable',
    };
  }

  return null;
}

function typeEmoji(type: MigrationEntry['type']): string {
  switch (type) {
    case 'baseline': return 'B';
    case 'versioned': return 'V';
    case 'codegen': return 'CG';
    case 'repeatable': return 'R';
  }
}

export interface MigrationExtractorResult {
  migrationsFound: number;
  versionsFound: Set<string>;
}

export async function extractMigrations(
  config: SyncConfig,
  _cache: HashCache
): Promise<MigrationExtractorResult> {
  const result: MigrationExtractorResult = {
    migrationsFound: 0,
    versionsFound: new Set(),
  };

  // Find the latest migration version directory
  const migrationsRoot = path.join(config.repoRoot, 'migrations');
  if (!fs.existsSync(migrationsRoot)) {
    console.warn('  [migration-extractor] migrations/ directory not found');
    return result;
  }

  const versionDirs = fs.readdirSync(migrationsRoot)
    .filter(d => d.startsWith('v') && fs.statSync(path.join(migrationsRoot, d)).isDirectory())
    .sort();

  const entries: MigrationEntry[] = [];

  for (const vDir of versionDirs) {
    const dirPath = path.join(migrationsRoot, vDir);
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.sql'));

    for (const file of files) {
      const entry = parseMigrationFilename(file);
      if (entry) {
        entries.push(entry);
        result.versionsFound.add(entry.version);
      }
    }
  }

  // Also check root-level repeatable migrations
  const rootFiles = fs.readdirSync(migrationsRoot).filter(f => f.endsWith('.sql'));
  for (const file of rootFiles) {
    const entry = parseMigrationFilename(file);
    if (entry) entries.push(entry);
  }

  result.migrationsFound = entries.length;

  // Sort by date (most recent first)
  entries.sort((a, b) => b.date.localeCompare(a.date));

  // Generate timeline page
  const timelineDir = path.join(config.vaultPath, VAULT_DIRS.timeline);
  fs.mkdirSync(timelineDir, { recursive: true });

  const lines: string[] = [
    '---',
    'doc_type: "migration-timeline"',
    `migration_count: ${entries.length}`,
    `tags: ["migration", "timeline", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# Migration Timeline',
    '',
    `> [!info] ${entries.length} migrations across ${versionDirs.length} version directories`,
    '',
    '## Legend',
    '- **B** = Baseline | **V** = Versioned | **CG** = CodeGen | **R** = Repeatable',
    '',
    '## Migrations',
    '',
    '| Date | Type | Version | Description |',
    '|------|------|---------|-------------|',
  ];

  for (const entry of entries) {
    const emoji = typeEmoji(entry.type);
    lines.push(
      `| ${entry.date || 'N/A'} | ${emoji} | ${entry.version} | ${entry.description} |`
    );
  }

  // Version summary
  lines.push('', '## Version Summary', '');
  const versionCounts = new Map<string, number>();
  for (const entry of entries) {
    const count = versionCounts.get(entry.version) || 0;
    versionCounts.set(entry.version, count + 1);
  }
  for (const [version, count] of [...versionCounts.entries()].sort()) {
    lines.push(`- **${version}**: ${count} migration${count > 1 ? 's' : ''}`);
  }

  lines.push('', '## See Also', '- [[MOC-Migration-Timeline]]', '');

  fs.writeFileSync(path.join(timelineDir, 'Migration-Timeline.md'), lines.join('\n'));

  return result;
}
