/**
 * Validate (Save mode) over every shipped `metadata/queries/**\/*.sql`. Declared parameter types
 * are taken from each query's own filters, plus the known types of the parameters it writes
 * unfiltered. Compositions resolve against the shipped queries themselves, by the last category
 * segment and the query name. The only queries allowed to fail are the known offenders, which
 * are fixed or re-declared (IsServerSet) in later work.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QueryTemplate } from '../../template/queryTemplate.js';
import type { CompositionTarget, DeclaredTemplateParameter } from '../../template/validationTypes.js';
import { LoadShippedCorpus, ShippedQueriesRoot } from '../corpus/index.js';
import { Dialect } from './helpers.js';

/** Types of parameters the shipped queries write without a filter. */
const UNFILTERED_TYPES: Readonly<Record<string, string>> = {
    maxDepth: 'number', lookbackDays: 'number', MinRating: 'number', MaxRating: 'number', agentRunID: 'string',
    SchemaName: 'string', BaseView: 'string', CreatedAtField: 'string', UpdatedAtField: 'string',
    PrimaryKeyJoin: 'string', PrimaryKeyOrderBy: 'string', PrimaryKeyIsNull: 'string',
};

/** The known offenders and the error codes each is expected to have. */
const EXPECTED_FAILURES: Readonly<Record<string, readonly string[]>> = {
    'SQL/get-agent-run-tree.sql': ['MJQ_TAG_IN_STRING_LITERAL', 'MJQ_UNFILTERED_VALUE'],
    'SQL/external-change-detection/detect-creations.sql': ['MJQ_TAG_IN_QUOTED_IDENTIFIER', 'MJQ_UNFILTERED_VALUE'],
    'SQL/external-change-detection/detect-creations.pg.sql': ['MJQ_TAG_IN_QUOTED_IDENTIFIER', 'MJQ_UNFILTERED_VALUE'],
    'SQL/external-change-detection/detect-updates.sql': ['MJQ_TAG_IN_QUOTED_IDENTIFIER', 'MJQ_UNFILTERED_VALUE'],
    'SQL/external-change-detection/detect-updates.pg.sql': ['MJQ_TAG_IN_QUOTED_IDENTIFIER', 'MJQ_UNFILTERED_VALUE'],
    'SQL/external-change-detection/detect-deletions.sql': ['MJQ_TAG_IN_QUOTED_IDENTIFIER', 'MJQ_UNFILTERED_VALUE'],
    'SQL/external-change-detection/detect-deletions.pg.sql': ['MJQ_TAG_IN_QUOTED_IDENTIFIER', 'MJQ_UNFILTERED_VALUE'],
};

interface ShippedQueryMeta {
    readonly Name: string;
    readonly Category: string;
    readonly Reusable: boolean;
    readonly SqlFile: string;
}

/** Name, category and Reusable flag of every shipped query, from its metadata file. */
function loadMetadata(): ShippedQueryMeta[] {
    const root = ShippedQueriesRoot();
    const records: ShippedQueryMeta[] = [];
    for (const file of readdirSync(root).filter(f => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json')) {
        const parsed: unknown = JSON.parse(readFileSync(join(root, file), 'utf8'));
        for (const record of Array.isArray(parsed) ? parsed : [parsed]) {
            const fields = (record as { fields?: Record<string, string | boolean | null> }).fields ?? {};
            const sql = String(fields.SQL ?? '');
            if (!sql.startsWith('@file:')) continue;
            const category = /Name=(.+)$/.exec(String(fields.CategoryID ?? ''))?.[1] ?? '';
            records.push({ Name: String(fields.Name), Category: category, Reusable: fields.Reusable === true, SqlFile: sql.substring(6) });
        }
    }
    return records;
}

const SHIPPED = LoadShippedCorpus();
const METADATA = loadMetadata();

function resolve(fullPath: string): CompositionTarget | null {
    const segments = fullPath.split('/');
    const name = segments[segments.length - 1].toLowerCase();
    const category = (segments[segments.length - 2] ?? '').toLowerCase();
    const meta = METADATA.find(m => m.Name.toLowerCase() === name && m.Category.toLowerCase() === category);
    const entry = meta ? SHIPPED.find(e => e.Id === `shipped/${meta.SqlFile}`) : undefined;
    if (!meta || !entry) return null;
    const parameters = QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect)).Parameters().Value;
    return { Exists: true, Reusable: meta.Reusable, Parameters: parameters.map(p => ({ Name: p.Name, IsRequired: p.IsRequired })) };
}

function declared(template: QueryTemplate): DeclaredTemplateParameter[] {
    return template.Parameters().Value.map(p => ({ Name: p.Name, Type: UNFILTERED_TYPES[p.Name] ?? (p.InferredType === 'unknown' ? 'string' : p.InferredType) }));
}

/** Each shipped file's error codes (distinct, sorted); files with none are left out. */
function failures(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const entry of SHIPPED) {
        const template = QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect));
        const check = template.Validate({ Mode: 'Save', DeclaredParameters: declared(template), ResolveComposition: resolve });
        const errors = [...new Set(check.Diagnostics.filter(d => d.Severity === 'Error').map(d => d.Code))].sort();
        if (errors.length > 0) result[entry.Id.replace(/^shipped\//, '')] = errors;
    }
    return result;
}

describe('Validate over the shipped queries (Save mode)', () => {
    it('fails only the known offenders, for the known reasons', () => {
        const found = failures();
        expect(found).toEqual(Object.fromEntries(Object.entries(EXPECTED_FAILURES).map(([k, v]) => [k, [...v].sort()])));
    });

    it('resolves every shipped composition', () => {
        for (const entry of SHIPPED) {
            for (const reference of QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect)).CompositionReferences().Value) {
                expect(resolve(reference.FullPath), `${entry.Id}: ${reference.FullPath}`).not.toBeNull();
            }
        }
    });

    it('ignores the tags shipped queries mention in comments', () => {
        const tree = SHIPPED.find(e => e.Id === 'shipped/SQL/get-agent-run-tree.sql');
        const tags = SHIPPED.find(e => e.Id === 'shipped/SQL/tags-for-entity-record.sql');
        expect(tree && tags).toBeTruthy();
        if (!tree || !tags) return;
        const treeUses = QueryTemplate.Parse(tree.SQL, Dialect('sqlserver')).Parameters().Value.find(p => p.Name === 'agentRunID')?.Uses ?? [];
        expect(treeUses).toHaveLength(1);
        expect(QueryTemplate.Parse(tags.SQL, Dialect('sqlserver')).CompositionReferences().Value).toHaveLength(0);
    });
});
