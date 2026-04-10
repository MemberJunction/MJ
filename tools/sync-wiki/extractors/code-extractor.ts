import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { sanitizeFilename, type SyncConfig } from '../lib/config.js';
import { type HashCache, hasFileChanged, updateFileHash } from '../lib/hasher.js';

// ─── Configuration ──────────────────────────────────────────────────────────────

/** Scoring thresholds — files scoring above these are included */
const TIER_1_THRESHOLD = 12;  // Core implementations
const TIER_2_THRESHOLD = 6;   // Important implementations
const TIER_3_THRESHOLD = 2;   // API surfaces worth keeping

/** Max lines before we switch to section-extraction mode */
const MAX_FULL_LINES = 5000;

/** Min lines to bother including (skip trivial files) */
const MIN_LINES = 10;

/** Directory name patterns that indicate important implementation code */
const HIGH_VALUE_DIRS = ['generic', 'resolvers', 'services', 'engines', 'middleware', 'auth', 'rest', 'agents'];

/** Filename patterns that indicate generated/boilerplate (lower score) */
const GENERATED_PATTERNS = [/generated/i, /\.d\.ts$/, /\.spec\.ts$/, /\.test\.ts$/];

/** Glob patterns to search for source files */
const SOURCE_PATTERNS = [
  'packages/**/src/**/*.ts',
];

const GLOBAL_EXCLUDES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/__tests__/**',
  '**/*.test.ts',
  '**/*.spec.ts',
  '**/test-harness/**',
];

// ─── Scoring Engine ─────────────────────────────────────────────────────────────

interface ScoredFile {
  absPath: string;
  relPath: string;
  score: number;
  tier: 1 | 2 | 3;
  category: string;
  signals: string[];
  lineCount: number;
  content: string;
}

/**
 * Score a TypeScript file by analyzing its content and location.
 * Higher score = more important to include in the knowledge base.
 */
function scoreFile(absPath: string, relPath: string, content: string): ScoredFile {
  const lines = content.split('\n');
  const lineCount = lines.length;
  const signals: string[] = [];
  let score = 0;

  // ── Location-based signals ──

  // Files in high-value directories
  const dirName = path.basename(path.dirname(absPath));
  if (HIGH_VALUE_DIRS.includes(dirName)) {
    score += 3;
    signals.push(`high-value-dir:${dirName}`);
  }

  // Public API surfaces (barrel exports)
  const filename = path.basename(absPath);
  if (filename === 'public-api.ts' || (filename === 'index.ts' && relPath.includes('src'))) {
    score += 3;
    signals.push('api-surface');
  }

  // Penalize generated files
  if (GENERATED_PATTERNS.some(p => p.test(relPath))) {
    score -= 10;
    signals.push('generated');
  }

  // ── Content-based signals ──

  // Abstract/base classes (framework foundations)
  const abstractClassCount = (content.match(/export\s+abstract\s+class\s/g) || []).length;
  if (abstractClassCount > 0) {
    score += 4 * abstractClassCount;
    signals.push(`abstract-classes:${abstractClassCount}`);
  }

  // Exported classes (implementations)
  const exportClassCount = (content.match(/export\s+class\s/g) || []).length;
  if (exportClassCount > 0) {
    score += 2 * Math.min(exportClassCount, 5); // Cap to avoid over-scoring files with many small classes
    signals.push(`export-classes:${exportClassCount}`);
  }

  // Exported interfaces / type definitions (contracts)
  const interfaceCount = (content.match(/export\s+(?:interface|type)\s/g) || []).length;
  if (interfaceCount > 0) {
    score += Math.min(interfaceCount, 4);
    signals.push(`interfaces:${interfaceCount}`);
  }

  // @RegisterClass decorator (pluggable framework extension points)
  const registerCount = (content.match(/@RegisterClass/g) || []).length;
  if (registerCount > 0) {
    score += 2 * Math.min(registerCount, 3);
    signals.push(`register-class:${registerCount}`);
  }

  // Extends/implements (inheritance chains are architecturally important)
  const extendsCount = (content.match(/extends\s+\w+/g) || []).length;
  if (extendsCount > 0) {
    score += Math.min(extendsCount, 3);
    signals.push(`extends:${extendsCount}`);
  }

  // Rich JSDoc (well-documented code is more valuable)
  const jsdocCount = (content.match(/\/\*\*/g) || []).length;
  if (jsdocCount >= 5) {
    score += 2;
    signals.push(`jsdoc:${jsdocCount}`);
  }

  // Substantial implementation size (not too small, not generated-huge)
  if (lineCount >= 100 && lineCount <= 3000) {
    score += 2;
    signals.push('good-size');
  } else if (lineCount > 3000 && lineCount <= 6000) {
    score += 1;
    signals.push('large');
  } else if (lineCount > 6000) {
    score -= 2; // Likely generated or should be split
    signals.push('very-large');
  }

  // Files named with "Base", "Engine", "Provider", "Runner", "Manager" patterns
  const impFilename = path.basename(absPath, '.ts');
  if (/(?:Base|Engine|Provider|Runner|Manager|Service|Factory|Pipeline|Coordinator|Planner)/i.test(impFilename)) {
    score += 3;
    signals.push('framework-pattern-name');
  }

  // Resolver files
  if (/Resolver/i.test(impFilename)) {
    score += 2;
    signals.push('resolver');
  }

  // Determine tier
  let tier: 1 | 2 | 3;
  if (score >= TIER_1_THRESHOLD) tier = 1;
  else if (score >= TIER_2_THRESHOLD) tier = 2;
  else tier = 3;

  // Determine category from path
  const category = inferCategory(relPath);

  return { absPath, relPath, score, tier, category, signals, lineCount, content };
}

/** Infer a category from the file's path within the repo */
function inferCategory(relPath: string): string {
  const parts = relPath.split(path.sep);
  // packages/X/Y/... → use the first meaningful package segment(s)
  const pkgIdx = parts.indexOf('packages');
  if (pkgIdx >= 0 && pkgIdx + 1 < parts.length) {
    const top = parts[pkgIdx + 1];

    // Nested packages: AI/Agents, AI/Engine, Actions/Engine, etc.
    if (['AI', 'Actions', 'Angular', 'Communication', 'Integration', 'Templates', 'Credentials'].includes(top)) {
      if (pkgIdx + 2 < parts.length) {
        const sub = parts[pkgIdx + 2];
        if (sub !== 'src' && sub !== 'lib') return `${top}-${sub}`;
      }
    }

    // Check for deeper nesting (AI/Providers/Anthropic)
    if (top === 'AI' && pkgIdx + 3 < parts.length) {
      const sub = parts[pkgIdx + 2];
      const subsub = parts[pkgIdx + 3];
      if (sub === 'Providers' && subsub !== 'src') return `AI-Providers`;
      if (sub === 'Knowledge') return `AI-Knowledge`;
      if (sub === 'Vectors') return `AI-Vectors`;
    }

    return top;
  }
  return 'Other';
}

// ─── Page Generation ────────────────────────────────────────────────────────────

function generateCodePage(file: ScoredFile, repoRoot: string): string {
  const tierLabel = file.tier === 1 ? 'Core Implementation' : file.tier === 2 ? 'Implementation' : 'API Surface';
  const filename = path.basename(file.absPath);

  const lines: string[] = [
    '---',
    `source_path: "${file.relPath}"`,
    `category: "${file.category}"`,
    `line_count: ${file.lineCount}`,
    `tier: ${file.tier}`,
    `score: ${file.score}`,
    `signals: [${file.signals.map(s => `"${s}"`).join(', ')}]`,
    `tags: ["code", "category/${file.category.toLowerCase()}", "tier-${file.tier}", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    `# ${filename}`,
    '',
    `> [!info] ${tierLabel} (score: ${file.score}) | \`${file.relPath}\` | ${file.lineCount} lines`,
    '',
  ];

  if (file.lineCount > MAX_FULL_LINES) {
    lines.push(
      `> [!warning] Large file (${file.lineCount} lines) — showing key sections`,
      '',
    );
    const sections = extractKeySections(file.content);
    for (const section of sections) {
      lines.push(`### ${section.label}`, '', '```typescript', section.code, '```', '');
    }
  } else {
    lines.push('```typescript', file.content, '```', '');
  }

  return lines.join('\n');
}

interface CodeSection {
  label: string;
  code: string;
}

/**
 * For large files, extract the most important sections:
 * - Imports (first 50 lines)
 * - All export declarations with context (JSDoc + signature + partial body)
 */
function extractKeySections(content: string): CodeSection[] {
  const allLines = content.split('\n');
  const sections: CodeSection[] = [];

  // 1. Imports & top-level setup
  const importEnd = Math.min(60, allLines.findIndex((l, i) => i > 5 && !l.trim().startsWith('import') && !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*') && l.trim() !== '') || 60);
  sections.push({
    label: 'Imports & Setup',
    code: allLines.slice(0, importEnd).join('\n'),
  });

  // 2. Find all export declarations
  for (let i = importEnd; i < allLines.length; i++) {
    const line = allLines[i];
    if (!/^\s*export\s+(abstract\s+)?(?:class|interface|type|function|enum|const)\s/.test(line)) continue;

    // Look back for JSDoc
    let start = i;
    for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
      const prevLine = allLines[j].trim();
      if (prevLine.startsWith('*') || prevLine.startsWith('/**') || prevLine.startsWith('//') || prevLine.startsWith('@') || prevLine === '') {
        start = j;
      } else break;
    }

    // Determine how much body to capture
    const isBlock = /class\s|interface\s|enum\s/.test(line);
    if (isBlock) {
      let braceDepth = 0;
      let foundBrace = false;
      let bodyLines = 0;
      let end = i;
      for (let j = i; j < allLines.length && bodyLines < 120; j++) {
        for (const ch of allLines[j]) {
          if (ch === '{') { braceDepth++; foundBrace = true; }
          if (ch === '}') braceDepth--;
        }
        end = j;
        if (foundBrace) bodyLines++;
        if (foundBrace && braceDepth === 0) break;
      }

      const chunk = allLines.slice(start, end + 1);
      if (bodyLines >= 120) {
        chunk.push('  // ... (truncated — see full source)');
        chunk.push('}');
      }

      sections.push({ label: extractDeclName(line), code: chunk.join('\n') });
      i = end; // Skip past this declaration
    } else {
      // Function/type/const — grab until blank line or 20 lines
      let end = i;
      for (let j = i; j < Math.min(allLines.length, i + 30); j++) {
        end = j;
        if (j > i && allLines[j].trim() === '') break;
      }
      sections.push({ label: extractDeclName(line), code: allLines.slice(start, end + 1).join('\n') });
      i = end;
    }
  }

  return sections;
}

function extractDeclName(line: string): string {
  const match = line.match(/(?:export\s+)?(?:abstract\s+)?(?:class|interface|type|function|enum|const)\s+(\w+)/);
  return match ? match[1] : 'Declaration';
}

// ─── Main Extractor ─────────────────────────────────────────────────────────────

export interface CodeExtractorResult {
  filesScanned: number;
  tier1Files: number;
  tier2Files: number;
  tier3Files: number;
  totalLines: number;
}

export async function extractCode(
  config: SyncConfig,
  cache: HashCache,
): Promise<CodeExtractorResult> {
  const result: CodeExtractorResult = { filesScanned: 0, tier1Files: 0, tier2Files: 0, tier3Files: 0, totalLines: 0 };

  // Discover all TypeScript source files
  const allTsFiles: string[] = [];
  for (const pattern of SOURCE_PATTERNS) {
    const matches = await glob(pattern, {
      cwd: config.repoRoot,
      ignore: GLOBAL_EXCLUDES,
      nodir: true,
    });
    allTsFiles.push(...matches);
  }

  // Score every file
  const scored: ScoredFile[] = [];
  for (const relPath of allTsFiles) {
    const absPath = path.join(config.repoRoot, relPath);
    if (!fs.existsSync(absPath)) continue;

    result.filesScanned++;

    const content = fs.readFileSync(absPath, 'utf-8');
    const lineCount = content.split('\n').length;

    // Skip trivially small files
    if (lineCount < MIN_LINES) continue;

    const file = scoreFile(absPath, relPath, content);

    // Only include files that meet the minimum threshold
    if (file.score >= TIER_3_THRESHOLD) {
      scored.push(file);
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Write pages
  const codeDir = path.join(config.vaultPath, '09-Code');
  const processedPaths = new Set<string>();

  for (const file of scored) {
    if (processedPaths.has(file.absPath)) continue;

    // Incremental check
    if (config.incremental && !hasFileChanged(file.absPath, cache)) continue;

    const page = generateCodePage(file, config.repoRoot);

    const targetDir = path.join(codeDir, sanitizeFilename(file.category));
    fs.mkdirSync(targetDir, { recursive: true });

    // Unique filename: parentDir-baseName to avoid collisions
    const baseName = path.basename(file.absPath, '.ts');
    const parentDir = path.basename(path.dirname(file.absPath));
    const uniqueName = `${parentDir}-${baseName}`;
    const outFilename = sanitizeFilename(uniqueName) + '.md';

    fs.writeFileSync(path.join(targetDir, outFilename), page);
    updateFileHash(file.absPath, cache);
    processedPaths.add(file.absPath);

    if (file.tier === 1) result.tier1Files++;
    else if (file.tier === 2) result.tier2Files++;
    else result.tier3Files++;
    result.totalLines += file.lineCount;
  }

  return result;
}
