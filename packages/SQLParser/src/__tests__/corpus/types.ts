/**
 * Shapes shared by the synthetic SQL corpus and the shipped-query loader.
 *
 * The corpus is synthetic SQL written for these tests plus the SQL MJ itself ships under
 * `metadata/queries/`. It never holds SQL taken from a client system.
 */

/** The platforms a corpus entry can be written for. */
export type CorpusDialect = 'sqlserver' | 'postgresql' | 'mysql' | 'oracle' | 'snowflake' | 'databricks';

/** One SQL text in the corpus. */
export interface CorpusEntry {
    /** Stable identifier, unique across the whole corpus. Golden files are keyed by it. */
    Id: string;
    /** The platform whose grammar the text is written in. */
    Dialect: CorpusDialect;
    /** The SQL exactly as an author would save it, template tags included. */
    SQL: string;
    /** The constructs the entry exercises, e.g. `cte`, `template:string-literal`, `write:hidden`. */
    Tags: string[];
}
