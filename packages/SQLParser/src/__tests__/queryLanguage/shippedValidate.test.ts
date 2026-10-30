/**
 * Validate (Save mode) over every shipped `metadata/queries/**\/*.sql`, with each query's parameters
 * as its metadata declares them (the `Parameters` collection: type and IsServerSet). Compositions
 * resolve against the shipped queries by full category path, read from `metadata/query-categories`,
 * so a partial path is reported as it would be on save. Every shipped query must pass with no
 * errors, and every query must declare exactly the parameters its SQL uses.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { QueryTemplate } from '../../template/queryTemplate.js';
import { MatchCompositionPath } from '../../template/compositionPathMatch.js';
import type { CompositionTarget, DeclaredTemplateParameter } from '../../template/validationTypes.js';
import { LoadShippedCorpus, ShippedQueriesRoot } from '../corpus/index.js';
import { Dialect } from './helpers.js';

/** A declared parameter, as a shipped query's `Parameters` collection writes it. */
interface ShippedParameter extends DeclaredTemplateParameter {
    readonly IsRequired: boolean;
}

interface ShippedQueryMeta {
    readonly Name: string;
    readonly CategoryPath: string;
    readonly Reusable: boolean;
    /** The SQL file of the query and of each of its dialect variants, relative to `metadata/queries`. */
    readonly SqlFiles: readonly string[];
    readonly Parameters: readonly ShippedParameter[];
}

type FieldValue = string | number | boolean | null;
interface MetadataRecord {
    fields?: Record<string, FieldValue>;
    primaryKey?: Record<string, string>;
    relatedEntities?: Record<string, MetadataRecord[]>;
    collections?: Record<string, Array<MetadataRecord & { deleteRecord?: { delete: boolean } }>>;
}

function readRecords(file: string): MetadataRecord[] {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return (Array.isArray(parsed) ? parsed : [parsed]) as MetadataRecord[];
}

/** The `@lookup:…Name=<value>` value of a reference field. */
function lookupName(value: FieldValue | undefined): string {
    return /Name=(.+)$/.exec(String(value ?? ''))?.[1] ?? '';
}

/** Each shipped query category's full path, keyed by its lower-cased name. */
function loadCategoryPaths(): Map<string, string> {
    const folder = resolvePath(ShippedQueriesRoot(), '..', 'query-categories');
    const parents = new Map<string, string>();
    for (const file of readdirSync(folder).filter(f => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json')) {
        for (const record of readRecords(join(folder, file))) {
            parents.set(String(record.fields?.Name), lookupName(record.fields?.ParentID));
        }
    }
    const pathOf = (name: string): string => {
        const parent = parents.get(name);
        return parent ? `${pathOf(parent)}/${name}` : name;
    };
    return new Map([...parents.keys()].map(name => [name.toLowerCase(), pathOf(name)]));
}

/** `@file:` targets of a record and of its dialect variants. */
function sqlFilesOf(record: MetadataRecord): string[] {
    const files = [record.fields?.SQL, ...(record.relatedEntities?.['MJ: Query SQLs'] ?? []).map(r => r.fields?.SQL)];
    return files.map(f => String(f ?? '')).filter(f => f.startsWith('@file:')).map(f => f.substring(6));
}

/** Name, category path, Reusable flag, SQL files and declared parameters of every shipped query. */
function loadMetadata(): ShippedQueryMeta[] {
    const root = ShippedQueriesRoot();
    const categories = loadCategoryPaths();
    const records: ShippedQueryMeta[] = [];
    for (const file of readdirSync(root).filter(f => f.startsWith('.') && f.endsWith('.json') && f !== '.mj-sync.json')) {
        for (const record of readRecords(join(root, file))) {
            const fields = record.fields ?? {};
            const category = lookupName(fields.CategoryID);
            const parameters = (record.collections?.Parameters ?? [])
                .filter(p => !p.deleteRecord?.delete)
                .map(p => ({ Name: String(p.fields?.Name), Type: String(p.fields?.Type), IsServerSet: p.fields?.IsServerSet === true, IsRequired: p.fields?.IsRequired === true }));
            records.push({
                Name: String(fields.Name),
                CategoryPath: categories.get(category.toLowerCase()) ?? category,
                Reusable: fields.Reusable === true,
                SqlFiles: sqlFilesOf(record),
                Parameters: parameters,
            });
        }
    }
    return records;
}

const SHIPPED = LoadShippedCorpus();
const METADATA = loadMetadata();

/** The query a shipped SQL file belongs to (its main SQL or a dialect variant). */
function queryOf(entryId: string): ShippedQueryMeta | undefined {
    const file = entryId.replace(/^shipped\//, '');
    return METADATA.find(m => m.SqlFiles.includes(file));
}

function resolve(fullPath: string): CompositionTarget | null {
    const segments = fullPath.split('/');
    const match = MatchCompositionPath(segments.slice(0, -1), segments[segments.length - 1], METADATA);
    if (match.Kind !== 'Exact' && match.Kind !== 'PartialPath') return null;
    return {
        Exists: true,
        Reusable: match.Target.Reusable,
        Parameters: match.Target.Parameters.map(p => ({ Name: p.Name, IsRequired: p.IsRequired })),
        FullPath: match.Kind === 'PartialPath' ? match.FullPath : undefined,
    };
}

/** Each shipped file's error diagnostics (code and message); files with none are left out. */
function failures(): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const entry of SHIPPED) {
        const query = queryOf(entry.Id);
        const template = QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect));
        const check = template.Validate({ Mode: 'Save', DeclaredParameters: query?.Parameters ?? [], ResolveComposition: resolve });
        const errors = check.Diagnostics.filter(d => d.Severity === 'Error').map(d => `${d.Code}: ${d.Message}`);
        if (errors.length > 0) result[entry.Id] = errors;
    }
    return result;
}

describe('Validate over the shipped queries (Save mode)', () => {
    it('finds the query metadata of every shipped SQL file', () => {
        const orphans = SHIPPED.filter(e => !queryOf(e.Id)).map(e => e.Id);
        expect(orphans).toEqual([]);
    });

    it('passes every shipped query with no errors', () => {
        expect(failures()).toEqual({});
    });

    it('declares exactly the parameters each query uses, with the required flag the SQL implies', () => {
        const mismatches: string[] = [];
        for (const entry of SHIPPED) {
            const query = queryOf(entry.Id);
            if (!query) continue;
            const used = QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect)).Parameters().Value
                .map(p => `${p.Name}:${p.IsRequired ? 'required' : 'optional'}`).sort();
            const declared = query.Parameters.map(p => `${p.Name}:${p.IsRequired ? 'required' : 'optional'}`).sort();
            if (JSON.stringify(used) !== JSON.stringify(declared)) {
                mismatches.push(`${entry.Id}: uses [${used.join(', ')}], declares [${declared.join(', ')}]`);
            }
        }
        expect(mismatches).toEqual([]);
    });

    it('resolves every shipped composition by its full path', () => {
        for (const entry of SHIPPED) {
            for (const reference of QueryTemplate.Parse(entry.SQL, Dialect(entry.Dialect)).CompositionReferences().Value) {
                const target = resolve(reference.FullPath);
                expect(target, `${entry.Id}: ${reference.FullPath}`).not.toBeNull();
                expect(target?.FullPath, `${entry.Id}: ${reference.FullPath} is a partial path`).toBeUndefined();
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
