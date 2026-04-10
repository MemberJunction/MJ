import * as fs from 'fs';
import * as path from 'path';
import { VAULT_DIRS, type SyncConfig } from '../lib/config.js';
import { type HashCache, hasFileChanged, updateFileHash } from '../lib/hasher.js';

interface GraphQLField {
  name: string;
  args: string;
  returnType: string;
  description: string;
}

interface GraphQLType {
  name: string;
  kind: 'type' | 'input' | 'enum' | 'scalar' | 'union';
  fields: GraphQLField[];
  description: string;
}

function parseSchemaFile(content: string): {
  types: GraphQLType[];
  queries: GraphQLField[];
  mutations: GraphQLField[];
  subscriptions: GraphQLField[];
} {
  const types: GraphQLType[] = [];
  const queries: GraphQLField[] = [];
  const mutations: GraphQLField[] = [];
  const subscriptions: GraphQLField[] = [];

  // Parse type definitions
  const typeRegex = /(?:"""([^]*?)"""\s*)?(type|input|enum|scalar|union)\s+(\w+)(?:\s+implements\s+[^{]+)?\s*\{([^}]*)\}/g;
  let match;

  while ((match = typeRegex.exec(content)) !== null) {
    const description = (match[1] || '').trim();
    const kind = match[2] as GraphQLType['kind'];
    const name = match[3];
    const body = match[4];

    if (name === 'Query' || name === 'Mutation' || name === 'Subscription') {
      const fields = parseFields(body);
      if (name === 'Query') queries.push(...fields);
      else if (name === 'Mutation') mutations.push(...fields);
      else subscriptions.push(...fields);
      continue;
    }

    types.push({
      name,
      kind,
      fields: kind === 'enum' ? parseEnumValues(body) : parseFields(body),
      description,
    });
  }

  return { types, queries, mutations, subscriptions };
}

function parseFields(body: string): GraphQLField[] {
  const fields: GraphQLField[] = [];
  const fieldRegex = /(?:"""([^]*?)"""\s*)?(\w+)(\([^)]*\))?\s*:\s*([^\n]+)/g;
  let match;

  while ((match = fieldRegex.exec(body)) !== null) {
    fields.push({
      description: (match[1] || '').trim(),
      name: match[2],
      args: (match[3] || '').trim(),
      returnType: match[4].trim(),
    });
  }

  return fields;
}

function parseEnumValues(body: string): GraphQLField[] {
  return body
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => ({
      name: l.replace(/,?\s*$/, ''),
      args: '',
      returnType: '',
      description: '',
    }));
}

function generateQueriesPage(queries: GraphQLField[]): string {
  const lines: string[] = [
    '---',
    'doc_type: "graphql-queries"',
    `query_count: ${queries.length}`,
    `tags: ["api", "graphql", "queries", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# GraphQL Queries',
    '',
    `> [!info] ${queries.length} queries available in the MJ GraphQL API`,
    '',
    '| Query | Return Type | Description |',
    '|-------|-------------|-------------|',
  ];

  for (const q of queries) {
    const args = q.args ? ` ${q.args}` : '';
    const desc = q.description.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| \`${q.name}${args}\` | \`${q.returnType}\` | ${desc} |`);
  }

  lines.push('', '## See Also', '- [[MOC-API-Surface]]', '- [[Mutations]]', '');
  return lines.join('\n');
}

function generateMutationsPage(mutations: GraphQLField[]): string {
  const lines: string[] = [
    '---',
    'doc_type: "graphql-mutations"',
    `mutation_count: ${mutations.length}`,
    `tags: ["api", "graphql", "mutations", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    '# GraphQL Mutations',
    '',
    `> [!info] ${mutations.length} mutations available in the MJ GraphQL API`,
    '',
    '| Mutation | Return Type | Description |',
    '|---------|-------------|-------------|',
  ];

  for (const m of mutations) {
    const args = m.args ? ` ${m.args}` : '';
    const desc = m.description.replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| \`${m.name}${args}\` | \`${m.returnType}\` | ${desc} |`);
  }

  lines.push('', '## See Also', '- [[MOC-API-Surface]]', '- [[Queries]]', '');
  return lines.join('\n');
}

function generateTypePage(t: GraphQLType): string {
  const lines: string[] = [
    '---',
    `type_name: "${t.name}"`,
    `kind: "${t.kind}"`,
    `field_count: ${t.fields.length}`,
    `tags: ["api", "graphql", "type", "auto-generated"]`,
    `last_synced: "${new Date().toISOString()}"`,
    '---',
    '',
    `# ${t.name} (${t.kind})`,
    '',
  ];

  if (t.description) {
    lines.push(`> ${t.description}`, '');
  }

  if (t.kind === 'enum') {
    lines.push('## Values', '');
    for (const v of t.fields) {
      lines.push(`- \`${v.name}\``);
    }
  } else {
    lines.push('## Fields', '');
    lines.push('| Field | Type | Description |');
    lines.push('|-------|------|-------------|');
    for (const f of t.fields) {
      const desc = f.description.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| \`${f.name}\` | \`${f.returnType}\` | ${desc} |`);
    }
  }

  lines.push('', '## See Also', '- [[MOC-API-Surface]]', '');
  return lines.join('\n');
}

export interface GraphQLExtractorResult {
  queriesFound: number;
  mutationsFound: number;
  typesFound: number;
}

export async function extractGraphQL(
  config: SyncConfig,
  cache: HashCache
): Promise<GraphQLExtractorResult> {
  const result: GraphQLExtractorResult = { queriesFound: 0, mutationsFound: 0, typesFound: 0 };

  const schemaPath = path.join(config.repoRoot, 'packages', 'MJAPI', 'schema.graphql');
  if (!fs.existsSync(schemaPath)) {
    console.warn('  [graphql-extractor] schema.graphql not found:', schemaPath);
    return result;
  }

  if (config.incremental && !hasFileChanged(schemaPath, cache)) {
    console.log('  [graphql-extractor] schema.graphql unchanged, skipping');
    return result;
  }

  const content = fs.readFileSync(schemaPath, 'utf-8');
  const { types, queries, mutations } = parseSchemaFile(content);

  const apiDir = path.join(config.vaultPath, VAULT_DIRS.apiSurface);
  const typesDir = path.join(apiDir, 'Types');
  fs.mkdirSync(typesDir, { recursive: true });

  // Write queries page
  fs.writeFileSync(path.join(apiDir, 'Queries.md'), generateQueriesPage(queries));
  result.queriesFound = queries.length;

  // Write mutations page
  fs.writeFileSync(path.join(apiDir, 'Mutations.md'), generateMutationsPage(mutations));
  result.mutationsFound = mutations.length;

  // Write type pages for types with 3+ fields (skip trivial ones)
  const significantTypes = types.filter(t => t.fields.length >= 3);
  for (const t of significantTypes) {
    fs.writeFileSync(path.join(typesDir, `${t.name}.md`), generateTypePage(t));
    result.typesFound++;
  }

  updateFileHash(schemaPath, cache);
  return result;
}
