import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { REPO_ROOT, VAULT_DIRS, sanitizeFilename, type SyncConfig } from '../lib/config.js';
import { type HashCache, hasFileChanged, updateFileHash } from '../lib/hasher.js';

interface DocClassification {
  vaultDir: string;
  subDir?: string;
  displayName: string;
  docType: string;
  tags: string[];
}

function classifyDoc(relPath: string): DocClassification {
  const lower = relPath.toLowerCase();
  const basename = path.basename(relPath, '.md');

  // CLAUDE.md files
  if (lower.endsWith('claude.md')) {
    const parent = path.dirname(relPath).split(path.sep).filter(Boolean);
    const label = parent.length === 0 ? 'Root' : parent.join('-');
    return {
      vaultDir: VAULT_DIRS.guides,
      displayName: `CLAUDE-${label}`,
      docType: 'claude-md',
      tags: ['claude-md', 'guide'],
    };
  }

  // /guides/ directory
  if (relPath.startsWith('guides/')) {
    return {
      vaultDir: VAULT_DIRS.guides,
      displayName: basename,
      docType: 'guide',
      tags: ['guide'],
    };
  }

  // /plans/ directory
  if (relPath.startsWith('plans/complete/')) {
    return {
      vaultDir: VAULT_DIRS.architecture,
      subDir: '_complete',
      displayName: basename,
      docType: 'architecture-plan',
      tags: ['architecture', 'complete'],
    };
  }
  if (relPath.startsWith('plans/')) {
    return {
      vaultDir: VAULT_DIRS.architecture,
      subDir: '_active',
      displayName: basename,
      docType: 'architecture-plan',
      tags: ['architecture', 'active'],
    };
  }

  // Package /docs/ subdirectories
  if (relPath.includes('/docs/')) {
    const parts = relPath.split(path.sep);
    const pkgIdx = parts.indexOf('packages');
    if (pkgIdx >= 0) {
      const docsIdx = parts.indexOf('docs');
      const pkgParts = parts.slice(pkgIdx + 1, docsIdx);
      const pkgName = pkgParts.join('-');
      return {
        vaultDir: VAULT_DIRS.packageDocs,
        subDir: pkgName,
        displayName: basename,
        docType: 'package-doc',
        tags: ['package-doc', `pkg/${pkgName}`],
      };
    }
  }

  // Top-level docs
  if (!relPath.includes(path.sep) || relPath.split(path.sep).length <= 2) {
    if (lower.endsWith('readme.md') && !relPath.includes('packages')) {
      return {
        vaultDir: VAULT_DIRS.guides,
        displayName: basename === 'README' ? 'MJ-README' : basename,
        docType: 'readme',
        tags: ['readme', 'root'],
      };
    }
    return {
      vaultDir: VAULT_DIRS.guides,
      displayName: basename,
      docType: 'guide',
      tags: ['guide', 'root'],
    };
  }

  // Package READMEs — handled by package-extractor, skip here
  if (lower.endsWith('readme.md') && relPath.startsWith('packages/')) {
    return {
      vaultDir: VAULT_DIRS.packages,
      displayName: basename,
      docType: 'package-readme',
      tags: ['readme', 'package'],
    };
  }

  // Docker docs
  if (relPath.startsWith('docker/')) {
    return {
      vaultDir: VAULT_DIRS.guides,
      displayName: `Docker-${basename}`,
      docType: 'guide',
      tags: ['guide', 'docker'],
    };
  }

  // Metadata docs
  if (relPath.startsWith('metadata/') && lower.endsWith('.md')) {
    return {
      vaultDir: VAULT_DIRS.metadata,
      displayName: basename,
      docType: 'metadata-doc',
      tags: ['metadata'],
    };
  }

  // Migration docs
  if (relPath.startsWith('migrations/')) {
    return {
      vaultDir: VAULT_DIRS.timeline,
      displayName: basename,
      docType: 'migration-doc',
      tags: ['migration'],
    };
  }

  // Demos docs
  if (relPath.startsWith('Demos/')) {
    return {
      vaultDir: VAULT_DIRS.packageDocs,
      subDir: 'Demos',
      displayName: basename,
      docType: 'demo-doc',
      tags: ['demo'],
    };
  }

  // Specs
  if (relPath.startsWith('specs/')) {
    return {
      vaultDir: VAULT_DIRS.architecture,
      subDir: '_specs',
      displayName: basename,
      docType: 'spec',
      tags: ['spec', 'architecture'],
    };
  }

  // Fallback
  return {
    vaultDir: VAULT_DIRS.guides,
    displayName: basename,
    docType: 'doc',
    tags: ['doc'],
  };
}

function addFrontmatter(content: string, sourcePath: string, classification: DocClassification): string {
  // Strip existing frontmatter if present
  let body = content;
  if (content.startsWith('---')) {
    const endIdx = content.indexOf('---', 3);
    if (endIdx > 0) {
      body = content.slice(endIdx + 3).trimStart();
    }
  }

  const frontmatter = [
    '---',
    `source_path: "${sourcePath}"`,
    `doc_type: "${classification.docType}"`,
    `tags: [${classification.tags.map(t => `"${t}"`).join(', ')}]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    `> [!info] Source: \`${sourcePath}\``,
    '',
  ].join('\n');

  return frontmatter + body;
}

/** Convert relative markdown links to Obsidian wikilinks where possible */
function convertLinks(content: string): string {
  // Convert [text](./relative/path.md) to [[path|text]]
  return content.replace(
    /\[([^\]]+)\]\(\.?\/?([^)]+\.md)\)/g,
    (_match, text: string, href: string) => {
      const name = path.basename(href, '.md');
      if (name === text) return `[[${name}]]`;
      return `[[${name}|${text}]]`;
    }
  );
}

export interface MarkdownExtractorResult {
  filesProcessed: number;
  filesSkipped: number;
}

export async function extractMarkdown(
  config: SyncConfig,
  cache: HashCache
): Promise<MarkdownExtractorResult> {
  const result: MarkdownExtractorResult = { filesProcessed: 0, filesSkipped: 0 };

  // Glob patterns for Tier 1 docs
  const patterns = [
    'CLAUDE.md',
    '*.md',
    'guides/**/*.md',
    'plans/**/*.md',
    'specs/**/*.md',
    'docker/**/*.md',
    'migrations/**/*.md',
    'metadata/**/*.md',
    'Demos/**/*.md',
    'scripts/**/*.md',
    'packages/**/CLAUDE.md',
    'packages/**/docs/**/*.md',
  ];

  const excludePatterns = [
    'node_modules/**',
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/CHANGELOG.md',
    'packages/**/README.md', // Handled by package-extractor
    '.claude/**',
    'tools/**',
    'mj-wiki/**',
  ];

  const allFiles = new Set<string>();

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: config.repoRoot,
      ignore: excludePatterns,
      nodir: true,
    });
    for (const m of matches) allFiles.add(m);
  }

  for (const relPath of allFiles) {
    const absPath = path.join(config.repoRoot, relPath);

    if (!fs.existsSync(absPath)) continue;

    // Incremental: skip unchanged files
    if (config.incremental && !hasFileChanged(absPath, cache)) {
      result.filesSkipped++;
      continue;
    }

    const classification = classifyDoc(relPath);

    // Skip package READMEs (handled by package-extractor)
    if (classification.docType === 'package-readme') {
      result.filesSkipped++;
      continue;
    }

    const content = fs.readFileSync(absPath, 'utf-8');
    const transformed = addFrontmatter(convertLinks(content), relPath, classification);

    const targetDir = classification.subDir
      ? path.join(config.vaultPath, classification.vaultDir, classification.subDir)
      : path.join(config.vaultPath, classification.vaultDir);

    fs.mkdirSync(targetDir, { recursive: true });

    const filename = sanitizeFilename(classification.displayName) + '.md';
    const targetPath = path.join(targetDir, filename);

    fs.writeFileSync(targetPath, transformed);
    updateFileHash(absPath, cache);
    result.filesProcessed++;
  }

  return result;
}
