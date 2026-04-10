import * as fs from 'fs';
import * as path from 'path';
import { VAULT_DIRS, sanitizeFilename, type SyncConfig } from '../lib/config.js';
import { type HashCache, hasFileChanged, updateFileHash } from '../lib/hasher.js';

interface SchemaField {
  Name: string;
  Description: string;
  Type: string;
  AllowsNull: boolean;
  RelatedEntity?: string;
  RelatedEntityFieldName?: string;
}

interface SchemaEntity {
  Name: string;
  Description: string;
  BaseView: string;
  Fields: SchemaField[];
}

interface SchemaGroup {
  schemaName: string;
  entities: SchemaEntity[];
}

/** Strip the \\b (JSON backspace escape) markers that appear in the schema JSON */
function stripMarkers(text: string): string {
  return text.replace(/\\b/g, '');
}

function entityToFilename(name: string): string {
  return sanitizeFilename(name.replace(/^MJ:\s*/, 'MJ--'));
}

function entityToWikilink(name: string): string {
  return `[[${entityToFilename(name)}|${name}]]`;
}

function generateEntityPage(entity: SchemaEntity, schemaName: string): string {
  const fields = entity.Fields;
  const relatedEntities = fields
    .filter(f => f.RelatedEntity)
    .map(f => ({ field: f.Name, entity: f.RelatedEntity! }));

  const fieldCount = fields.length;

  const lines: string[] = [
    '---',
    `entity_name: "${entity.Name}"`,
    `schema: "${schemaName}"`,
    `base_view: "${entity.BaseView}"`,
    `field_count: ${fieldCount}`,
    `tags: ["entity", "schema/${schemaName}", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    `# ${entity.Name}`,
    '',
  ];

  if (entity.Description) {
    lines.push(`> ${entity.Description}`, '');
  }

  // Fields table
  lines.push('## Fields', '');
  lines.push('| Field | Type | Nullable | Related Entity | Description |');
  lines.push('|-------|------|----------|---------------|-------------|');

  for (const field of fields) {
    const nullable = field.AllowsNull ? 'Yes' : 'No';
    const related = field.RelatedEntity ? entityToWikilink(field.RelatedEntity) : '';
    const desc = (field.Description || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${field.Name} | \`${field.Type}\` | ${nullable} | ${related} | ${desc} |`);
  }

  // Relationships section
  if (relatedEntities.length > 0) {
    lines.push('', '## Relationships', '');
    for (const rel of relatedEntities) {
      lines.push(`- Links to ${entityToWikilink(rel.entity)} via \`${rel.field}\``);
    }
  }

  lines.push('', '## See Also', `- [[MOC-Entities]]`, '');

  return lines.join('\n');
}

export interface EntityExtractorResult {
  entitiesProcessed: number;
  schemasFound: number;
}

export async function extractEntities(
  config: SyncConfig,
  cache: HashCache
): Promise<EntityExtractorResult> {
  const result: EntityExtractorResult = { entitiesProcessed: 0, schemasFound: 0 };

  const schemaPath = path.join(config.repoRoot, 'Schema Files', '__ALL.full.json');
  if (!fs.existsSync(schemaPath)) {
    console.warn('  [entity-extractor] Schema file not found:', schemaPath);
    return result;
  }

  // Check if schema file changed (for incremental mode)
  if (config.incremental && !hasFileChanged(schemaPath, cache)) {
    console.log('  [entity-extractor] Schema file unchanged, skipping');
    return result;
  }

  const raw = fs.readFileSync(schemaPath, 'utf-8');
  const cleaned = stripMarkers(raw);
  const schemas: SchemaGroup[] = JSON.parse(cleaned);

  const entitiesDir = path.join(config.vaultPath, VAULT_DIRS.entities);
  fs.mkdirSync(entitiesDir, { recursive: true });

  for (const schemaGroup of schemas) {
    result.schemasFound++;
    const schemaName = schemaGroup.schemaName;

    for (const entity of schemaGroup.entities) {
      const page = generateEntityPage(entity, schemaName);
      const filename = entityToFilename(entity.Name) + '.md';
      fs.writeFileSync(path.join(entitiesDir, filename), page);
      result.entitiesProcessed++;
    }
  }

  updateFileHash(schemaPath, cache);
  return result;
}

/** Get all entity names for use by other extractors/generators */
export function getAllEntityNames(config: SyncConfig): string[] {
  const schemaPath = path.join(config.repoRoot, 'Schema Files', '__ALL.simple.json');
  if (!fs.existsSync(schemaPath)) return [];

  const raw = fs.readFileSync(schemaPath, 'utf-8');
  const cleaned = raw.replace(/\\b/g, '');
  const schemas: Array<{ entities: Array<{ Name: string }> }> = JSON.parse(cleaned);

  return schemas.flatMap(s => s.entities.map(e => e.Name));
}
