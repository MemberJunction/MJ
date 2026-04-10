import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { VAULT_DIRS, sanitizeFilename, type SyncConfig } from '../lib/config.js';
import { type HashCache, updateFileHash } from '../lib/hasher.js';

interface MetadataRecord {
  primaryKey?: Record<string, string>;
  fields: Record<string, unknown>;
}

/** Convert a metadata directory name to a display-friendly category */
function dirToCategory(dirName: string): string {
  return dirName
    .split('-')
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

/** Resolve @lookup: references to readable text */
function resolveValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // @lookup: references
    if (value.startsWith('@lookup:')) {
      const ref = value.replace('@lookup:', '');
      // Extract just the value part after the last =
      const parts = ref.split('=');
      return parts.length > 1 ? parts[parts.length - 1] : ref;
    }
    // @file: references
    if (value.startsWith('@file:')) {
      return `\`${value.replace('@file:', '')}\``;
    }
    // Truncate very long strings
    if (value.length > 500) {
      return value.slice(0, 500) + '... *(truncated)*';
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '*(empty)*';
    return value.map(v => resolveValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    return '*(object)*';
  }
  return String(value);
}

function generateRecordPage(
  record: MetadataRecord,
  category: string,
  entityDir: string
): { filename: string; content: string } | null {
  const fields = record.fields;

  // Determine a good display name
  const name = String(fields['Name'] || fields['name'] || fields['Title'] || fields['title'] || 'Unnamed');
  if (name === 'Unnamed' && !fields['Description'] && !fields['description']) return null;

  const description = String(fields['Description'] || fields['description'] || '');

  const lines: string[] = [
    '---',
    `record_name: "${name.replace(/"/g, '\\"')}"`,
    `category: "${category}"`,
    `tags: ["metadata", "category/${sanitizeFilename(category).toLowerCase()}", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    `# ${name}`,
    '',
    `> [!info] Metadata: ${category}`,
    '',
  ];

  if (description) {
    lines.push(description, '');
  }

  // Render key fields as a properties table
  const skipFields = new Set(['Name', 'name', 'Description', 'description', 'ID', 'id']);
  const displayFields = Object.entries(fields).filter(
    ([k]) => !skipFields.has(k) && !k.startsWith('__mj_')
  );

  if (displayFields.length > 0) {
    lines.push('## Properties', '');
    lines.push('| Property | Value |');
    lines.push('|----------|-------|');

    for (const [key, value] of displayFields) {
      const resolved = resolveValue(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      if (resolved && resolved !== '*(empty)*' && resolved !== '*(object)*') {
        lines.push(`| **${key}** | ${resolved} |`);
      }
    }
    lines.push('');
  }

  lines.push('## See Also', `- [[MOC-AI-System]]`, '');

  const filename = sanitizeFilename(`${category}-${name}`) + '.md';
  return { filename, content: lines.join('\n') };
}

/** Priority metadata directories to extract (most useful for understanding the system) */
const PRIORITY_DIRS = [
  'agents',
  'agent-types',
  'agent-categories',
  'actions',
  'action-categories',
  'ai-models',
  'ai-vendors',
  'ai-configurations',
  'prompts',
  'prompt-types',
  'prompt-categories',
  'applications',
  'dashboards',
  'templates',
  'scheduled-jobs',
  'integrations',
  'resource-types',
  'entities',
  'datasets',
  'content-source-types',
];

export interface MetadataExtractorResult {
  dirsProcessed: number;
  recordsProcessed: number;
}

export async function extractMetadata(
  config: SyncConfig,
  cache: HashCache
): Promise<MetadataExtractorResult> {
  const result: MetadataExtractorResult = { dirsProcessed: 0, recordsProcessed: 0 };

  const metadataRoot = path.join(config.repoRoot, 'metadata');
  if (!fs.existsSync(metadataRoot)) {
    console.warn('  [metadata-extractor] metadata/ directory not found');
    return result;
  }

  for (const dirName of PRIORITY_DIRS) {
    const dirPath = path.join(metadataRoot, dirName);
    if (!fs.existsSync(dirPath)) continue;

    // Find JSON data files (hidden files starting with .)
    const jsonFiles = await glob('**/.*.json', {
      cwd: dirPath,
      nodir: true,
      dot: true,
    });

    if (jsonFiles.length === 0) continue;

    const category = dirToCategory(dirName);
    const targetDir = path.join(config.vaultPath, VAULT_DIRS.metadata, sanitizeFilename(category));
    fs.mkdirSync(targetDir, { recursive: true });

    result.dirsProcessed++;

    for (const jsonFile of jsonFiles) {
      const absPath = path.join(dirPath, jsonFile);
      try {
        const raw = fs.readFileSync(absPath, 'utf-8');
        const data = JSON.parse(raw);
        const records: MetadataRecord[] = Array.isArray(data) ? data : [data];

        for (const record of records) {
          if (!record.fields) continue;

          const page = generateRecordPage(record, category, dirName);
          if (page) {
            fs.writeFileSync(path.join(targetDir, page.filename), page.content);
            result.recordsProcessed++;
          }
        }

        updateFileHash(absPath, cache);
      } catch {
        // Skip unparseable files
      }
    }
  }

  return result;
}
