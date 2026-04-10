import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { VAULT_DIRS, type SyncConfig } from '../lib/config.js';

interface VaultStats {
  guideCount: number;
  packageCount: number;
  entityCount: number;
  architectureCount: number;
  apiQueryCount: number;
  apiMutationCount: number;
  metadataCount: number;
  migrationCount: number;
}

async function countFiles(dir: string, pattern = '**/*.md'): Promise<number> {
  if (!fs.existsSync(dir)) return 0;
  const files = await glob(pattern, { cwd: dir, nodir: true });
  return files.length;
}

async function listFiles(dir: string, pattern = '*.md'): Promise<string[]> {
  if (!fs.existsSync(dir)) return [];
  return glob(pattern, { cwd: dir, nodir: true });
}

function fileToLink(filename: string): string {
  const name = filename.replace(/\.md$/, '');
  return `[[${name}]]`;
}

async function getStats(vaultPath: string): Promise<VaultStats> {
  return {
    guideCount: await countFiles(path.join(vaultPath, VAULT_DIRS.guides)),
    packageCount: await countFiles(path.join(vaultPath, VAULT_DIRS.packages)),
    entityCount: await countFiles(path.join(vaultPath, VAULT_DIRS.entities)),
    architectureCount: await countFiles(path.join(vaultPath, VAULT_DIRS.architecture)),
    apiQueryCount: 0, // filled below
    apiMutationCount: 0,
    metadataCount: await countFiles(path.join(vaultPath, VAULT_DIRS.metadata)),
    migrationCount: await countFiles(path.join(vaultPath, VAULT_DIRS.timeline)),
  };
}

function generateHomeMOC(stats: VaultStats): string {
  return [
    '---',
    'tags: ["moc", "index"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# MemberJunction Knowledge Base',
    '',
    `> Auto-generated from the MJ monorepo. Last synced: ${new Date().toISOString().split('T')[0]}`,
    '',
    '## Quick Navigation',
    '',
    `- [[MOC-Guides]] -- ${stats.guideCount} developer guides and context files`,
    `- [[MOC-Packages]] -- ${stats.packageCount} packages across the monorepo`,
    `- [[MOC-Entities]] -- ${stats.entityCount} entities in the data model`,
    `- [[MOC-Architecture]] -- ${stats.architectureCount} architecture plans and designs`,
    `- [[MOC-AI-System]] -- AI agents, models, prompts, providers`,
    `- [[MOC-API-Surface]] -- GraphQL API documentation`,
    `- [[MOC-Dependency-Graph]] -- Package dependency visualization`,
    `- [[MOC-Migration-Timeline]] -- Database migration history`,
    '',
    '## Key Statistics',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Guides & Context Files | ${stats.guideCount} |`,
    `| Packages | ${stats.packageCount} |`,
    `| Entities | ${stats.entityCount} |`,
    `| Architecture Plans | ${stats.architectureCount} |`,
    `| Metadata Records | ${stats.metadataCount} |`,
    '',
    '## Getting Started',
    '',
    '1. Start with [[CLAUDE-Root]] for the comprehensive development guide',
    '2. Explore [[MOC-Entities]] to understand the data model',
    '3. Check [[MOC-Packages]] for package architecture',
    '4. Read [[MOC-Architecture]] for design decisions',
    '',
  ].join('\n');
}

async function generateGuidesMOC(vaultPath: string): Promise<string> {
  const guidesDir = path.join(vaultPath, VAULT_DIRS.guides);
  const files = await listFiles(guidesDir);

  const claudeFiles = files.filter(f => f.startsWith('CLAUDE-'));
  const guideFiles = files.filter(f => !f.startsWith('CLAUDE-'));

  const lines = [
    '---',
    'tags: ["moc", "guides"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# Guides & Context Files',
    '',
    '## CLAUDE Context Files',
    'These files contain architecture rules, conventions, and workflow documentation.',
    '',
  ];

  for (const f of claudeFiles.sort()) lines.push(`- ${fileToLink(f)}`);

  lines.push('', '## Developer Guides', '');
  for (const f of guideFiles.sort()) lines.push(`- ${fileToLink(f)}`);

  return lines.join('\n');
}

async function generatePackagesMOC(vaultPath: string): Promise<string> {
  const packagesDir = path.join(vaultPath, VAULT_DIRS.packages);
  if (!fs.existsSync(packagesDir)) return '';

  const categories = fs.readdirSync(packagesDir)
    .filter(d => fs.statSync(path.join(packagesDir, d)).isDirectory())
    .sort();

  const lines = [
    '---',
    'tags: ["moc", "packages"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# Packages',
    '',
  ];

  for (const cat of categories) {
    const displayCat = cat.replace('_', '').charAt(0).toUpperCase() + cat.replace('_', '').slice(1);
    lines.push(`## ${displayCat}`, '');

    const catDir = path.join(packagesDir, cat);
    const files = await listFiles(catDir);
    for (const f of files.sort()) {
      lines.push(`- ${fileToLink(f)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function generateEntitiesMOC(vaultPath: string): Promise<string> {
  const entitiesDir = path.join(vaultPath, VAULT_DIRS.entities);
  const files = await listFiles(entitiesDir);

  // Group by prefix (MJ-- prefix vs no prefix)
  const mjEntities = files.filter(f => f.startsWith('MJ--')).sort();
  const otherEntities = files.filter(f => !f.startsWith('MJ--')).sort();

  const lines = [
    '---',
    'tags: ["moc", "entities"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# Entities',
    '',
    `> ${files.length} entities in the MemberJunction data model`,
    '',
    '## Dataview Queries',
    '',
    '```dataview',
    'TABLE field_count as "Fields", schema as "Schema"',
    'FROM "03-Entities"',
    'SORT field_count DESC',
    'LIMIT 20',
    '```',
    '',
    '## Core Entities (MJ: prefix)',
    '',
  ];

  for (const f of mjEntities) lines.push(`- ${fileToLink(f)}`);

  if (otherEntities.length > 0) {
    lines.push('', '## Custom Entities', '');
    for (const f of otherEntities) lines.push(`- ${fileToLink(f)}`);
  }

  return lines.join('\n');
}

async function generateArchitectureMOC(vaultPath: string): Promise<string> {
  const archDir = path.join(vaultPath, VAULT_DIRS.architecture);
  const activeDir = path.join(archDir, '_active');
  const completeDir = path.join(archDir, '_complete');
  const specsDir = path.join(archDir, '_specs');

  const activeFiles = await listFiles(activeDir);
  const completeFiles = await listFiles(completeDir);
  const specFiles = await listFiles(specsDir);

  const lines = [
    '---',
    'tags: ["moc", "architecture"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# Architecture & Design',
    '',
    `> ${activeFiles.length} active plans, ${completeFiles.length} completed plans`,
    '',
  ];

  if (activeFiles.length > 0) {
    lines.push('## Active Plans', '');
    for (const f of activeFiles.sort()) lines.push(`- ${fileToLink(f)}`);
    lines.push('');
  }

  if (specFiles.length > 0) {
    lines.push('## Specifications', '');
    for (const f of specFiles.sort()) lines.push(`- ${fileToLink(f)}`);
    lines.push('');
  }

  if (completeFiles.length > 0) {
    lines.push('## Completed Plans', '');
    for (const f of completeFiles.sort()) lines.push(`- ${fileToLink(f)}`);
    lines.push('');
  }

  return lines.join('\n');
}

async function generateAISystemMOC(vaultPath: string): Promise<string> {
  const metadataDir = path.join(vaultPath, VAULT_DIRS.metadata);
  if (!fs.existsSync(metadataDir)) return '';

  const aiDirs = ['Agents', 'Agent-Types', 'Ai-Models', 'Ai-Vendors', 'Ai-Configurations', 'Prompts', 'Prompt-Types'];

  const lines = [
    '---',
    'tags: ["moc", "ai-system"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# AI System',
    '',
    '> Overview of AI agents, models, prompts, and providers in MemberJunction',
    '',
  ];

  for (const dir of aiDirs) {
    const dirPath = path.join(metadataDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = await listFiles(dirPath);
    if (files.length === 0) continue;

    lines.push(`## ${dir.replace(/-/g, ' ')}`, '');
    for (const f of files.sort()) lines.push(`- ${fileToLink(f)}`);
    lines.push('');
  }

  return lines.join('\n');
}

function generateAPISurfaceMOC(): string {
  return [
    '---',
    'tags: ["moc", "api"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# API Surface',
    '',
    '> MemberJunction GraphQL API documentation',
    '',
    '## Overview',
    '- [[Queries]] -- All available GraphQL queries',
    '- [[Mutations]] -- All available GraphQL mutations',
    '',
    '## Types',
    'See `05-API-Surface/Types/` for detailed type documentation.',
    '',
  ].join('\n');
}

function generateMigrationTimelineMOC(): string {
  return [
    '---',
    'tags: ["moc", "migrations"]',
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# Migration Timeline',
    '',
    '> Database schema evolution history',
    '',
    '- [[Migration-Timeline]] -- Complete chronological migration list',
    '',
  ].join('\n');
}

export async function generateMOCs(config: SyncConfig): Promise<number> {
  const indexDir = path.join(config.vaultPath, VAULT_DIRS.index);
  fs.mkdirSync(indexDir, { recursive: true });

  const stats = await getStats(config.vaultPath);

  const mocs: Array<[string, string]> = [
    ['MOC-Home.md', generateHomeMOC(stats)],
    ['MOC-Guides.md', await generateGuidesMOC(config.vaultPath)],
    ['MOC-Packages.md', await generatePackagesMOC(config.vaultPath)],
    ['MOC-Entities.md', await generateEntitiesMOC(config.vaultPath)],
    ['MOC-Architecture.md', await generateArchitectureMOC(config.vaultPath)],
    ['MOC-AI-System.md', await generateAISystemMOC(config.vaultPath)],
    ['MOC-API-Surface.md', generateAPISurfaceMOC()],
    ['MOC-Migration-Timeline.md', generateMigrationTimelineMOC()],
  ];

  let count = 0;
  for (const [filename, content] of mocs) {
    if (content) {
      fs.writeFileSync(path.join(indexDir, filename), content);
      count++;
    }
  }

  return count;
}
