import type { DialectKey } from './facets/dialectKey.js';
import type { DialectLexicalRules } from './facets/dialectLexicalRules.js';
import type { DialectGrammar } from './facets/dialectGrammar.js';
import type { DialectWriter } from './facets/dialectWriter.js';
import type { DialectTypes } from './facets/dialectTypes.js';
import type { DialectBinding } from './facets/dialectBinding.js';

/**
 * A SQL dialect MJ can read: the facts needed to tokenize, analyze, screen and write queries for
 * one database, split into facets.
 *
 * - {@link Lexical}: how text splits into tokens (quotes, strings, comments, placeholders).
 * - {@link Grammar}: statement-level facts (row caps, CTE rules, hints, write keywords).
 * - {@link Writer}: how to write SQL fragments (quoting, literals, limit clause, expressions).
 * - {@link Types} and {@link Binding}: type-name sets and driver binding, where a dialect has them.
 *
 * A dialect MJ itself runs on is a {@link SQLDialect}, which adds DDL. A source MJ only reads
 * (an External Data Source) needs just a `QueryDialect`. `GetQueryDialect` resolves the built-in
 * dialects directly; a third-party dialect registers with the MJ class factory
 * (`@RegisterClass(QueryDialect, '<key>')`) and resolves the same way.
 */
export abstract class QueryDialect {
    /** The key this dialect resolves under, such as `'sqlserver'` or `'mysql'`. */
    abstract get Key(): DialectKey;

    /** Human-readable name of the dialect. */
    abstract get DisplayName(): string;

    /** How the dialect's text splits into tokens. A frozen plain object. */
    abstract get Lexical(): DialectLexicalRules;

    /** Statement grammar facts. A frozen plain object. */
    abstract get Grammar(): DialectGrammar;

    /** Writes SQL fragments in this dialect. */
    abstract get Writer(): DialectWriter;

    /** SQL type-name sets, or `null` when the dialect does not declare them. */
    get Types(): DialectTypes | null {
        return null;
    }

    /** Driver binding rules, or `null` when the dialect does not declare them. */
    get Binding(): DialectBinding | null {
        return null;
    }
}

/**
 * The part of a dialect the SQL tokenizer and parser read: its key and its lexical and grammar
 * facets.
 */
export type ParserDialect = Pick<QueryDialect, 'Key' | 'Lexical' | 'Grammar'>;
