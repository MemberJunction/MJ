/**
 * BridgeViewSQLGenerator — Pattern 3 SQL emission.
 *
 * Takes a BridgePath (from FKGraphWalker) and produces the SELECT body of the
 * bridge view that PR #2193's CodeGen ingest (`processOrganicKeyConfig`) will
 * wrap in the platform's create-or-replace DDL and EXECUTE when materializing
 * the organic-key configuration.
 *
 * CodeGen executes the body verbatim, so it is emitted in the analyzed
 * database's dialect: identifiers are quoted per `provider` (brackets on SQL
 * Server, double quotes on PostgreSQL/Oracle, backticks on MySQL). On
 * PostgreSQL that quoting is load-bearing — an unquoted mixed-case name folds
 * to lower case and no longer matches the catalog.
 *
 * Output SQL shape (SQL Server shown) — minimal valid bridge view per the
 * PR #2193 docs example; the view header is CodeGen's, not part of the body:
 *
 *   SELECT
 *       [hub].[hubKeyField] AS [hubKeyField],
 *       [spoke].[spokePK]   AS [spokeOutputAlias]
 *   FROM [spokeSchema].[spokeTable] [spoke]
 *   INNER JOIN [interSchema].[interTable] [t1]
 *       ON [spoke].[fkCol] = [t1].[pkCol]
 *   INNER JOIN [hubSchema].[hubTable] [hub]
 *       ON [t1].[fkCol] = [hub].[pkCol]
 *
 * The aliases t1, t2, … are auto-assigned per intermediate hop. The HUB carries
 * the organic-key field; the SPOKE is what the form panel will list as related
 * records. PR #2193's transitive runtime substitutes the hub value (e.g. a
 * specific email address) at query time:
 *
 *   [ID] IN (SELECT [spokeOutputAlias] FROM <viewName> WHERE [hubKeyField] = ?)
 *
 * The SPOKE's primary key is what the bridge view projects in addition to the
 * hub's key column — that's what `TransitiveOutputFieldName` references.
 *
 * The caller (TransitiveBridgeDetector) supplies the spoke PK because the
 * walker doesn't know it.
 */

import { BridgePath } from './FKGraphWalker.js';
import { DatabaseConfig } from '../types/config.js';

/** Database platform the bridge view body is written for. */
export type BridgeViewProvider = NonNullable<DatabaseConfig['provider']>;

/** Bundle returned for each bridge path. */
export interface GeneratedBridgeView {
    /** View name suitable for the PR #2193 TransitiveView.Name field. */
    viewName: string;
    /** Default schema (caller may override). */
    schemaName: string;
    /** The bare SELECT body for the bridge view — exactly what TransitiveView.SQL should carry.
     *  CodeGen wraps it in the platform's create-or-replace view DDL, so the header must NOT be
     *  included here. Written in the dialect of the generator's `provider`. */
    sql: string;
    /** The hub-key field projected by the view (matches TransitiveMatchFieldNames[0]). */
    hubKeyField: string;
    /** The output column projected for the spoke (matches TransitiveOutputFieldName). */
    spokeOutputField: string;
    /** The spoke PK column the form-panel join joins ON (matches RelatedEntityJoinFieldName). */
    spokeJoinField: string;
}

export interface BridgeViewSQLGeneratorOptions {
    /**
     * Pattern for the view name. Tokens substituted:
     *   {hub}      → hub table name
     *   {spoke}    → spoke table name
     *   {key}      → hub key field name
     * Default `"vw{spoke}_{key}_bridge"`.
     *
     * The generator lowercases the result and replaces non-alphanumeric chars
     * with underscores, since the view must be a valid SQL identifier.
     */
    viewNamePattern?: string;
    /** Override the view's schema. Defaults to the SPOKE's schema (where it'll be most natural to find). */
    viewSchema?: string;
    /** Platform whose identifier quoting the body uses. Default `'sqlserver'`, matching `DatabaseConfig.provider`. */
    provider?: BridgeViewProvider;
}

const DEFAULTS: Required<BridgeViewSQLGeneratorOptions> = {
    viewNamePattern: 'vw{spoke}_{key}_bridge',
    viewSchema: '',
    provider: 'sqlserver',
};

export function GenerateBridgeView(
    path: BridgePath,
    spokePKColumn: string,
    opts: BridgeViewSQLGeneratorOptions = {},
): GeneratedBridgeView {
    // `?? DEFAULTS.provider`: callers thread an optional provider through as `{ provider }`, and a
    // spread of an explicit `undefined` would overwrite the default.
    const o = { ...DEFAULTS, ...opts, provider: opts.provider ?? DEFAULTS.provider };
    const qident = identifierQuoter(o.provider);
    const viewName = buildViewName(o.viewNamePattern, path);
    const schemaName = o.viewSchema || path.spokeSchema;
    const spokeOutputField = `${path.spokeTable}_${spokePKColumn}`;

    // ─── Build alias map ────────────────────────────────────────────────────
    // hop[0].fromTable = spoke   (alias "spoke")
    // hop[i].toTable for 0<i<len-1 = intermediate (alias t1, t2, ...)
    // hop[last].toTable = hub    (alias "hub")
    const aliases: string[] = [];
    aliases.push('spoke'); // index 0 = spoke
    for (let i = 1; i < path.hops.length; i++) {
        aliases.push(`t${i}`);
    }
    aliases.push('hub'); // final = hub

    // ─── JOIN clauses ───────────────────────────────────────────────────────
    const fromClause = `FROM ${qident(path.spokeSchema)}.${qident(path.spokeTable)} ${aliases[0]}`;
    const joinClauses: string[] = [];
    for (let i = 0; i < path.hops.length; i++) {
        const hop = path.hops[i];
        const fromAlias = aliases[i];
        const toAlias = aliases[i + 1];
        joinClauses.push(
            `INNER JOIN ${qident(hop.toSchema)}.${qident(hop.toTable)} ${toAlias} ON ${fromAlias}.${qident(hop.fromColumn)} = ${toAlias}.${qident(hop.toColumn)}`,
        );
    }

    // ─── SELECT list ────────────────────────────────────────────────────────
    const selectList = [
        `hub.${qident(path.hubKeyField)} AS ${qident(path.hubKeyField)}`,
        `spoke.${qident(spokePKColumn)} AS ${qident(spokeOutputField)}`,
    ];

    // ─── Final SQL — body only ──────────────────────────────────────────────
    // CodeGen's processOrganicKeyConfig() wraps whatever's in TransitiveView.SQL
    // in the platform's create-or-replace view DDL. So we emit ONLY the SELECT
    // body — never a CREATE VIEW header — otherwise the database rejects the
    // double-prefixed statement.
    const sql = [
        `SELECT`,
        '    ' + selectList.join(',\n    '),
        fromClause,
        ...joinClauses,
    ].join('\n');

    return {
        viewName,
        schemaName,
        sql,
        hubKeyField: path.hubKeyField,
        spokeOutputField,
        spokeJoinField: spokePKColumn,
    };
}

/** @deprecated Use {@link GenerateBridgeView}. */
export function generateBridgeView(
    path: BridgePath,
    spokePKColumn: string,
    opts: BridgeViewSQLGeneratorOptions = {},
): GeneratedBridgeView {
    return GenerateBridgeView(path, spokePKColumn, opts);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildViewName(pattern: string, path: BridgePath): string {
    const raw = pattern
        .replace(/\{hub\}/g, path.hubTable)
        .replace(/\{spoke\}/g, path.spokeTable)
        .replace(/\{key\}/g, path.hubKeyField);
    // Sanitize: SQL identifier — alphanumeric + underscore only, max 128 chars.
    const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 128);
    return cleaned;
}

/**
 * Returns the platform's identifier quoter, doubling the closing delimiter inside a name.
 * Exhaustive on purpose (no `default`): a provider added to `DatabaseConfig['provider']` fails to
 * compile here instead of silently getting SQL Server brackets, and the caller's default is the only
 * place a missing provider becomes `'sqlserver'`.
 */
function identifierQuoter(provider: BridgeViewProvider): (name: string) => string {
    switch (provider) {
        case 'postgresql':
        case 'oracle':
            return (name) => `"${name.replace(/"/g, '""')}"`;
        case 'mysql':
            return (name) => `\`${name.replace(/`/g, '``')}\``;
        case 'sqlserver':
            return (name) => `[${name.replace(/]/g, ']]')}]`;
    }
}
