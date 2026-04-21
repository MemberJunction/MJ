// Prompt builders — verbose (today's style) vs distilled (proposed).

const ALL_TABLES_PLACEHOLDER = '%%ALL_TABLES%%';

export function allTablesBlock(tables) {
    const lines = [...tables.values()]
        .map(t => `- ${t.schema}.${t.name}`)
        .sort();
    return lines.join('\n');
}

function columnLineVerbose(c) {
    const parts = [`**${c.name}** (${c.dataType})${c.isNullable ? '' : ' NOT NULL'}`];
    const sub = [];
    if (c.isPrimaryKey) sub.push('**PRIMARY KEY**');
    if (c.isForeignKey && c.fkRef) {
        sub.push(`**FOREIGN KEY** → ${c.fkRef.schema}.${c.fkRef.table}.${c.fkRef.referencedColumn ?? c.fkRef.column}`);
    }
    if (c.distinctCount != null) sub.push(`Distinct Values: ${c.distinctCount} (${(c.uniquenessRatio * 100).toFixed(1)}% unique)`);
    if (c.nullPercentage > 0) sub.push(`Nulls: ${c.nullPercentage.toFixed(1)}%`);
    if (c.sampleValues?.length) sub.push(`Sample Values: ${JSON.stringify(c.sampleValues)}`);
    return `- ${parts[0]}\n  ` + sub.map(s => `- ${s}`).join('\n  ');
}

function columnLineDistilled(c) {
    const bits = [`${c.name} (${c.dataType}${c.isNullable ? '' : ' NOT NULL'}`];
    if (c.isPrimaryKey) bits.push('PK');
    if (c.distinctCount != null) bits.push(`${c.distinctCount} distinct`);
    bits.push(')');
    const fk = (c.isForeignKey && c.fkRef)
        ? ` — FK → ${c.fkRef.schema}.${c.fkRef.table}.${c.fkRef.referencedColumn ?? c.fkRef.column}`
        : '';
    return `- ${bits.join(', ').replace(', )', ')')}${fk}`;
}

/**
 * Build a distilled summary (1-liner) from a resolved table — the thing that
 * propagates down the DAG in the proposed model.
 */
export function distillResolvedTable(table) {
    const desc = (table.description || '').split(/[.!?](?:\s|$)/)[0].trim();
    return `${table.schema}.${table.name}: ${desc || '(no description)'}`;
}

/** Today's verbose prompt — mirrors table-analysis.md output. */
export function buildVerbosePrompt(table, tables, resolvedParents = null) {
    const parentsBlock = (resolvedParents ?? table.dependsOn.map(d => tables.get(d.table)).filter(Boolean))
        .filter(p => p && p.description)
        .map(p => `**${p.schema}.${p.name}**: ${p.description}`)
        .join('\n\n');

    const dependsOnStr = table.dependsOn.length
        ? `**This table references (depends on):**\n${table.dependsOn.map(d => `- ${d.schema}.${d.table} (via column: ${d.column} → ${d.referencedColumn})`).join('\n')}`
        : '**Note**: This table has no foreign key dependencies.';

    const dependentsStr = table.dependents.length
        ? `\n\n**Referenced by (dependents):**\n${table.dependents.map(d => `- ${d.schema}.${d.table}`).join('\n')}`
        : '';

    return `You are analyzing a database table to generate comprehensive documentation.

## Table Information
- **Name**: ${table.name}
- **Schema**: ${table.schema}
- **Row Count**: ${table.rowCount}

## Columns
${table.columns.map(columnLineVerbose).join('\n')}

## Relationships
${dependsOnStr}${dependentsStr}

${parentsBlock ? `## Parent Table Context\n${parentsBlock}\n` : ''}
## All Database Tables
**IMPORTANT**: When referring to foreign key relationships, you MUST use one of these exact table names:
${allTablesBlock(tables)}

**Do NOT make up table names.**

---

## Your Task

Generate a JSON response:
\`\`\`json
{
  "tableDescription": "...",
  "columnDescriptions": [{"columnName":"...","description":"..."}],
  "primaryKey": {"columns":[...],"confidence":0.0},
  "foreignKeys": [{"columnName":"...","referencesSchema":"...","referencesTable":"...","referencesColumn":"...","confidence":0.0}],
  "inferredBusinessDomain": "..."
}
\`\`\`

Guidelines:
1. Describe WHAT the table stores and WHY.
2. Use EXACT schema.table names from the "All Database Tables" list.
3. For composite PKs use \`"columns": ["Col1", "Col2"]\`.
4. Leave foreignKeys empty if none detected.

Return ONLY valid JSON.`;
}

/** Proposed distilled prompt — short, one-line ancestor summaries. */
export function buildDistilledPrompt(table, tables, resolvedAncestorSummaries) {
    const parentsBlock = resolvedAncestorSummaries.length
        ? `## Resolved ancestors (distilled)\n${resolvedAncestorSummaries.join('\n')}`
        : '## Resolved ancestors\n(none — this is a root table)';

    return `Describe a database table. Return JSON:
{
  "tableDescription": "...",
  "columnDescriptions": [{"columnName":"...","description":"..."}],
  "primaryKey": {"columns":[...],"confidence":0.0},
  "foreignKeys": [{"columnName":"...","referencesSchema":"...","referencesTable":"...","referencesColumn":"...","confidence":0.0}],
  "inferredBusinessDomain": "..."
}

When referencing tables in "referencesTable", use the unqualified table name (e.g., "Playlist", not "dbo.Playlist"). The schema goes in "referencesSchema".

## Table: ${table.schema}.${table.name} (${table.rowCount} rows)

Columns:
${table.columns.map(columnLineDistilled).join('\n')}

${parentsBlock}

Return JSON only.`;
}
