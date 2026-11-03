/**
 * The SQL corpus the parser characterization tests run over: committed synthetic entries plus the
 * SQL MJ ships under `metadata/queries/`, read from disk at test time (never copied).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CorpusDialect, CorpusEntry } from './types.js';
import { SQLServerEntries } from './sqlserver.js';
import { PostgreSQLEntries } from './postgresql.js';
import { TemplateEntries } from './templates.js';
import { OtherDialectEntries } from './otherDialects.js';

export type { CorpusDialect, CorpusEntry } from './types.js';

/** Every synthetic entry, in a fixed order. */
export const SyntheticCorpus: readonly CorpusEntry[] = [
    ...SQLServerEntries, ...PostgreSQLEntries, ...TemplateEntries, ...OtherDialectEntries,
];

/** The repository's `metadata/queries` folder, found from this file's location. */
export function ShippedQueriesRoot(): string {
    const here = dirname(fileURLToPath(import.meta.url));
    return resolve(here, '..', '..', '..', '..', '..', 'metadata', 'queries');
}

function listSQLFiles(folder: string): string[] {
    return readdirSync(folder).sort().flatMap(name => {
        const full = join(folder, name);
        if (statSync(full).isDirectory()) return listSQLFiles(full);
        return name.endsWith('.sql') ? [full] : [];
    });
}

/**
 * Every shipped `metadata/queries/**\/*.sql` file as a corpus entry. A `.pg.sql` file is PostgreSQL;
 * every other `.sql` file is SQL Server. Ids are `shipped/<path under metadata/queries>`.
 */
export function LoadShippedCorpus(): CorpusEntry[] {
    const root = ShippedQueriesRoot();
    return listSQLFiles(root).map(file => {
        const path = relative(root, file).split(sep).join('/');
        const Dialect: CorpusDialect = path.endsWith('.pg.sql') ? 'postgresql' : 'sqlserver';
        return { Id: `shipped/${path}`, Dialect, SQL: readFileSync(file, 'utf8'), Tags: ['shipped'] };
    });
}

/** The synthetic corpus followed by the shipped queries. */
export function FullCorpus(): CorpusEntry[] {
    return [...SyntheticCorpus, ...LoadShippedCorpus()];
}
