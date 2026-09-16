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
    ViewName: string;
    /** Default schema (caller may override). */
    schemaName: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
    /** The bare SELECT body for the bridge view — exactly what TransitiveView.SQL should carry.
     *  CodeGen wraps it in the platform's create-or-replace view DDL, so the header must NOT be
     *  included here. Written in the dialect of the generator's `provider`. */
    Sql: string;
    /** The hub-key field projected by the view (matches TransitiveMatchFieldNames[0]). */
    HubKeyField: string;
    /** The output column projected for the spoke (matches TransitiveOutputFieldName). */
    SpokeOutputField: string;
    /** The spoke PK column the form-panel join joins ON (matches RelatedEntityJoinFieldName). */
    SpokeJoinField: string;
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
    ViewNamePattern?: string;
    /** Override the view's schema. Defaults to the SPOKE's schema (where it'll be most natural to find). */
    ViewSchema?: string;
    /** Platform whose identifier quoting the body uses. Default `'sqlserver'`, matching `DatabaseConfig.provider`. */
    provider?: BridgeViewProvider;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
}

const DEFAULTS: Required<BridgeViewSQLGeneratorOptions> = {
    ViewNamePattern: 'vw{spoke}_{key}_bridge',
    ViewSchema: '',
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
    const viewName = buildViewName(o.ViewNamePattern, path);
    const schemaName = o.ViewSchema || path.SpokeSchema;
    const spokeOutputField = `${path.SpokeTable}_${spokePKColumn}`;

    // ─── Build alias map ────────────────────────────────────────────────────
    // hop[0].fromTable = spoke   (alias "spoke")
    // hop[i].toTable for 0<i<len-1 = intermediate (alias t1, t2, ...)
    // hop[last].toTable = hub    (alias "hub")
    const aliases: string[] = [];
    aliases.push('spoke'); // index 0 = spoke
    for (let i = 1; i < path.Hops.length; i++) {
        aliases.push(`t${i}`);
    }
    aliases.push('hub'); // final = hub

    // ─── JOIN clauses ───────────────────────────────────────────────────────
    const fromClause = `FROM ${qident(path.SpokeSchema)}.${qident(path.SpokeTable)} ${aliases[0]}`;
    const joinClauses: string[] = [];
    for (let i = 0; i < path.Hops.length; i++) {
        const hop = path.Hops[i];
        const fromAlias = aliases[i];
        const toAlias = aliases[i + 1];
        joinClauses.push(
            `INNER JOIN ${qident(hop.toSchema)}.${qident(hop.toTable)} ${toAlias} ON ${fromAlias}.${qident(hop.fromColumn)} = ${toAlias}.${qident(hop.toColumn)}`,
        );
    }

    // ─── SELECT list ────────────────────────────────────────────────────────
    const selectList = [
        `hub.${qident(path.HubKeyField)} AS ${qident(path.HubKeyField)}`,
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
        ViewName: viewName,
        schemaName,
        Sql: sql,
        HubKeyField: path.HubKeyField,
        SpokeOutputField: spokeOutputField,
        SpokeJoinField: spokePKColumn,
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
        .replace(/\{hub\}/g, path.HubTable)
        .replace(/\{spoke\}/g, path.SpokeTable)
        .replace(/\{key\}/g, path.HubKeyField);
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
