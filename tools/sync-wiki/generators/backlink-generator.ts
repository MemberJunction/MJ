import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { type SyncConfig } from '../lib/config.js';
import { getAllEntityNames } from '../extractors/entity-extractor.js';
import { sanitizeFilename } from '../lib/config.js';

interface PageIndex {
  /** Display name -> filename (without .md) */
  nameToFile: Map<string, string>;
  /** Aliases (npm names, entity names) -> filename */
  aliasToFile: Map<string, string>;
}

function buildPageIndex(vaultPath: string, config: SyncConfig): PageIndex {
  const nameToFile = new Map<string, string>();
  const aliasToFile = new Map<string, string>();

  // Index entity names
  const entityNames = getAllEntityNames(config);
  for (const name of entityNames) {
    const filename = sanitizeFilename(name.replace(/^MJ:\s*/, 'MJ--'));
    nameToFile.set(name, filename);
    // Also index without "MJ: " prefix
    if (name.startsWith('MJ: ')) {
      aliasToFile.set(name.slice(4), filename);
    }
  }

  // Index package pages by scanning frontmatter
  const packageDir = path.join(vaultPath, '02-Packages');
  if (fs.existsSync(packageDir)) {
    const files = fs.readdirSync(packageDir, { recursive: true })
      .filter(f => typeof f === 'string' && f.endsWith('.md'));

    for (const relFile of files) {
      const absFile = path.join(packageDir, String(relFile));
      const content = fs.readFileSync(absFile, 'utf-8');
      const npmMatch = content.match(/npm_name:\s*"([^"]+)"/);
      if (npmMatch) {
        const filename = path.basename(String(relFile), '.md');
        aliasToFile.set(npmMatch[1], filename);
        // Also index the short name (without @memberjunction/)
        const shortName = npmMatch[1].replace('@memberjunction/', '');
        aliasToFile.set(shortName, filename);
      }
    }
  }

  return { nameToFile, aliasToFile };
}

/** Inject wikilinks for known entity/package names that appear as plain text */
function injectBacklinks(content: string, index: PageIndex): string {
  let result = content;

  // Skip frontmatter region
  let bodyStart = 0;
  if (result.startsWith('---')) {
    const endIdx = result.indexOf('---', 3);
    if (endIdx > 0) {
      bodyStart = endIdx + 3;
    }
  }

  const frontmatter = result.slice(0, bodyStart);
  let body = result.slice(bodyStart);

  // Only inject links for entity names (they're the most valuable cross-references)
  // Process longer names first to avoid partial matches
  const sortedNames = [...index.nameToFile.entries()]
    .sort((a, b) => b[0].length - a[0].length);

  for (const [name, filename] of sortedNames) {
    // Skip very short names to avoid false positives
    if (name.length < 5) continue;

    // Only match if not already inside a wikilink or markdown link
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(
      `(?<!\\[\\[)(?<!\\|)\\b(${escaped})\\b(?!\\]\\])(?!\\()`,
      'g'
    );

    body = body.replace(regex, `[[${filename}|$1]]`);
  }

  return frontmatter + body;
}

export interface BacklinkResult {
  filesProcessed: number;
  linksInjected: number;
}

export async function generateBacklinks(config: SyncConfig): Promise<BacklinkResult> {
  const result: BacklinkResult = { filesProcessed: 0, linksInjected: 0 };

  const index = buildPageIndex(config.vaultPath, config);

  // Only process guides, package docs, and architecture files (not entity pages themselves)
  const dirsToProcess = ['01-Guides', '04-Architecture', '07-Package-Docs'];

  for (const dir of dirsToProcess) {
    const dirPath = path.join(config.vaultPath, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = await glob('**/*.md', { cwd: dirPath, nodir: true });

    for (const relFile of files) {
      const absFile = path.join(dirPath, relFile);
      const original = fs.readFileSync(absFile, 'utf-8');
      const updated = injectBacklinks(original, index);

      if (updated !== original) {
        fs.writeFileSync(absFile, updated);
        // Count roughly how many links were added
        const originalLinkCount = (original.match(/\[\[/g) || []).length;
        const updatedLinkCount = (updated.match(/\[\[/g) || []).length;
        result.linksInjected += updatedLinkCount - originalLinkCount;
      }

      result.filesProcessed++;
    }
  }

  return result;
}
