#!/usr/bin/env tsx
/**
 * MemberJunction Wiki Sync
 *
 * Extracts documentation, entity schemas, package metadata, GraphQL API surface,
 * metadata configs, and migration history from the MJ monorepo into an Obsidian vault.
 *
 * Usage:
 *   npx tsx sync-wiki.ts              # Incremental sync (only changed files)
 *   npx tsx sync-wiki.ts --full       # Full sync (rebuild everything)
 *   npx tsx sync-wiki.ts --watch      # Watch mode (live sync on file changes)
 *   npx tsx sync-wiki.ts --vault /path/to/vault  # Custom vault path
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { DEFAULT_CONFIG, VAULT_DIRS, type SyncConfig } from './lib/config.js';
import { loadHashCache, saveHashCache, type HashCache } from './lib/hasher.js';
import { extractMarkdown } from './extractors/markdown-extractor.js';
import { extractEntities } from './extractors/entity-extractor.js';
import { extractPackages } from './extractors/package-extractor.js';
import { extractGraphQL } from './extractors/graphql-extractor.js';
import { extractMetadata } from './extractors/metadata-extractor.js';
import { extractMigrations } from './extractors/migration-extractor.js';
import { generateMOCs } from './generators/moc-generator.js';
import { generateDepGraph } from './generators/depgraph-generator.js';
import { generateBacklinks } from './generators/backlink-generator.js';
import { extractCode } from './extractors/code-extractor.js';

// ---------- CLI Argument Parsing ----------

function parseArgs(): { full: boolean; watch: boolean; vault?: string; quiet: boolean } {
  const args = process.argv.slice(2);
  return {
    full: args.includes('--full'),
    watch: args.includes('--watch'),
    quiet: args.includes('--quiet'),
    vault: args.find((_: string, i: number) => args[i - 1] === '--vault'),
  };
}

// ---------- Vault Initialization ----------

function initVault(vaultPath: string): void {
  // Create all vault directories
  for (const dir of Object.values(VAULT_DIRS)) {
    fs.mkdirSync(path.join(vaultPath, dir), { recursive: true });
  }

  // Create .obsidian directory with basic config if it doesn't exist
  const obsidianDir = path.join(vaultPath, '.obsidian');
  if (!fs.existsSync(obsidianDir)) {
    fs.mkdirSync(obsidianDir, { recursive: true });

    // Minimal Obsidian config
    const appConfig = {
      livePreview: true,
      readableLineLength: true,
      showFrontmatter: false,
      strictLineBreaks: false,
    };
    fs.writeFileSync(path.join(obsidianDir, 'app.json'), JSON.stringify(appConfig, null, 2));

    // Enable core plugins
    const corePlugins = {
      'graph': true,
      'tag-pane': true,
      'outgoing-link': true,
      'backlink': true,
      'search': true,
      'page-preview': true,
    };
    fs.writeFileSync(path.join(obsidianDir, 'core-plugins.json'), JSON.stringify(corePlugins, null, 2));
  }
}

// ---------- Git Helpers ----------

function getCurrentGitCommit(repoRoot: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ---------- Main Sync ----------

async function runSync(config: SyncConfig, quiet: boolean): Promise<void> {
  const startTime = Date.now();
  const syncDir = path.join(config.vaultPath, VAULT_DIRS.sync);

  // Load hash cache for incremental mode
  const cache: HashCache = config.incremental
    ? loadHashCache(syncDir)
    : { lastRun: '', gitCommit: '', hashes: {} };

  if (!quiet) {
    console.log(`\n🔄 MJ Wiki Sync ${config.incremental ? '(incremental)' : '(full)'}`);
    console.log(`   Repo:  ${config.repoRoot}`);
    console.log(`   Vault: ${config.vaultPath}\n`);
  }

  // Initialize vault structure
  initVault(config.vaultPath);

  // Phase 1: Run all extractors
  if (!quiet) console.log('📄 Extracting markdown documentation...');
  const mdResult = await extractMarkdown(config, cache);
  if (!quiet) console.log(`   ✓ ${mdResult.filesProcessed} files processed, ${mdResult.filesSkipped} skipped`);

  if (!quiet) console.log('🗃️  Extracting entity schema...');
  const entityResult = await extractEntities(config, cache);
  if (!quiet) console.log(`   ✓ ${entityResult.entitiesProcessed} entities from ${entityResult.schemasFound} schemas`);

  if (!quiet) console.log('📦 Extracting package metadata...');
  const pkgResult = await extractPackages(config, cache);
  if (!quiet) console.log(`   ✓ ${pkgResult.packagesProcessed} packages across ${pkgResult.categories.size} categories`);

  if (!quiet) console.log('🔌 Extracting GraphQL API surface...');
  const gqlResult = await extractGraphQL(config, cache);
  if (!quiet) console.log(`   ✓ ${gqlResult.queriesFound} queries, ${gqlResult.mutationsFound} mutations, ${gqlResult.typesFound} types`);

  if (!quiet) console.log('⚙️  Extracting metadata configs...');
  const metaResult = await extractMetadata(config, cache);
  if (!quiet) console.log(`   ✓ ${metaResult.recordsProcessed} records from ${metaResult.dirsProcessed} directories`);

  if (!quiet) console.log('📊 Extracting migration timeline...');
  const migResult = await extractMigrations(config, cache);
  if (!quiet) console.log(`   ✓ ${migResult.migrationsFound} migrations across ${migResult.versionsFound.size} versions`);

  if (!quiet) console.log('💻 Extracting source code (scored heuristics)...');
  const codeResult = await extractCode(config, cache);
  if (!quiet) console.log(`   ✓ ${codeResult.tier1Files} core + ${codeResult.tier2Files} impl + ${codeResult.tier3Files} API surface files (${codeResult.totalLines.toLocaleString()} lines, scanned ${codeResult.filesScanned.toLocaleString()})`);

  // Phase 2: Run generators
  if (!quiet) console.log('\n🗂️  Generating Maps of Content...');
  const mocCount = await generateMOCs(config);
  if (!quiet) console.log(`   ✓ ${mocCount} MOC files generated`);

  if (!quiet) console.log('🕸️  Generating dependency graph...');
  const graphCount = await generateDepGraph(config);
  if (!quiet) console.log(`   ✓ ${graphCount} graph page generated`);

  if (config.generateBacklinks) {
    if (!quiet) console.log('🔗 Injecting backlinks...');
    const blResult = await generateBacklinks(config);
    if (!quiet) console.log(`   ✓ ${blResult.linksInjected} links injected across ${blResult.filesProcessed} files`);
  }

  // Save hash cache
  cache.lastRun = new Date().toISOString();
  cache.gitCommit = getCurrentGitCommit(config.repoRoot);
  saveHashCache(syncDir, cache);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (!quiet) {
    console.log(`\n✅ Sync complete in ${elapsed}s`);
    console.log(`   Vault ready at: ${config.vaultPath}`);
    console.log('   Open in Obsidian to explore!\n');
  }
}

// ---------- Watch Mode ----------

async function runWatch(config: SyncConfig): Promise<void> {
  console.log('👁️  Watch mode active. Monitoring for changes...');
  console.log('   Press Ctrl+C to stop.\n');

  // Do an initial full sync
  config.incremental = false;
  await runSync(config, false);
  config.incremental = true;

  // Dynamic import chokidar for watch mode
  const { watch } = await import('chokidar');

  const watchPaths = [
    path.join(config.repoRoot, 'packages'),
    path.join(config.repoRoot, 'guides'),
    path.join(config.repoRoot, 'plans'),
    path.join(config.repoRoot, 'metadata'),
    path.join(config.repoRoot, 'migrations'),
    path.join(config.repoRoot, 'Schema Files'),
  ];

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = watch(watchPaths, {
    ignored: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
    ],
    persistent: true,
    ignoreInitial: true,
    depth: 5,
  });

  const triggerSync = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      console.log('\n🔄 Change detected, re-syncing...');
      try {
        await runSync(config, true);
        console.log('✅ Incremental sync complete.');
      } catch (err) {
        console.error('❌ Sync error:', err);
      }
    }, 2000);
  };

  watcher
    .on('change', (filePath: string) => {
      if (filePath.endsWith('.md') || filePath.endsWith('.json') || filePath.endsWith('.graphql')) {
        console.log(`   Changed: ${path.relative(config.repoRoot, filePath)}`);
        triggerSync();
      }
    })
    .on('add', (filePath: string) => {
      if (filePath.endsWith('.md') || filePath.endsWith('.json')) {
        console.log(`   Added: ${path.relative(config.repoRoot, filePath)}`);
        triggerSync();
      }
    });
}

// ---------- Entry Point ----------

async function main(): Promise<void> {
  const args = parseArgs();

  const config: SyncConfig = {
    ...DEFAULT_CONFIG,
    incremental: !args.full,
  };

  if (args.vault) {
    config.vaultPath = path.resolve(args.vault);
  }

  if (args.watch) {
    await runWatch(config);
  } else {
    await runSync(config, args.quiet);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
