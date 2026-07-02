/**
 * BridgeViewSQLGenerator — Pattern 3 SQL emission.
 *
 * Takes a BridgePath (from FKGraphWalker) and produces the CREATE VIEW SQL
 * statement that PR #2193's CodeGen ingest (`processOrganicKeyConfig`) will
 * EXECUTE when materializing the organic-key configuration.
 *
 * Output SQL shape — minimal valid bridge view per the PR #2193 docs example:
 *
 *   CREATE OR ALTER VIEW [schema].[viewName] AS
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

/** Bundle returned for each bridge path. */
export interface GeneratedBridgeView {
    /** View name suitable for the PR #2193 TransitiveView.Name field. */
    viewName: string;
    /** Default schema (caller may override). */
    schemaName: string;
    /** The bare SELECT body for the bridge view — exactly what TransitiveView.SQL should carry.
     *  PR #2193's CodeGen wraps this in `CREATE OR ALTER VIEW <schema>.<name> AS`, so the
     *  header must NOT be included here. */
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
}

const DEFAULTS: Required<BridgeViewSQLGeneratorOptions> = {
    viewNamePattern: 'vw{spoke}_{key}_bridge',
    viewSchema: '',
};

export function generateBridgeView(
    path: BridgePath,
    spokePKColumn: string,
    opts: BridgeViewSQLGeneratorOptions = {},
): GeneratedBridgeView {
    const o = { ...DEFAULTS, ...opts };
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
    // PR #2193's CodeGen processOrganicKeyConfig() prepends `CREATE OR ALTER
    // VIEW <schema>.<name> AS\n` to whatever's in TransitiveView.SQL. So we
    // emit ONLY the SELECT body — never the CREATE VIEW header — otherwise
    // SQL Server rejects the double-prefixed statement.
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

function qident(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`;
}
