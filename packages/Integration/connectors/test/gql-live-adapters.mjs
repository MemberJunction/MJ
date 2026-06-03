/**
 * Real IO adapters for the GQL live harness (gql-live-harness.mjs). Kept separate from the
 * orchestration so the orchestration stays pure/injectable and unit-testable with mocks.
 *
 * CREDENTIAL SAFETY: these are constructed by the plan entrypoints (plans.mjs) from already-
 * dereferenced secret values; nothing here reads process.env. The HubSpot token is used only to
 * (a) build the CreateConnection CredentialValues and (b) call the HubSpot count endpoint directly;
 * it is never logged (the runner scrubs all output).
 */

const HUBSPOT_API_BASE = 'https://api.hubapi.com';

/**
 * Validates a SQL identifier before it is interpolated into a query (table/schema names come from
 * __mj.Entity metadata, not user input, but identifiers can't be parameterized — this is cheap
 * defense-in-depth so a poisoned metadata row can't inject). Allows the leading-underscore `__mj`.
 */
function ident(name) {
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(`invalid SQL identifier: ${String(name)}`);
    }
    return name;
}

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL client
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a `gql(query, variables)` that POSTs to the MJAPI endpoint and throws on GraphQL errors.
 * Auth (MJServer context.ts): a system API key goes in the `x-mj-api-key` header (authenticates as
 * the system user — simplest for a workbench), a user key (`mj_sk_*`) in `x-api-key`, or a JWT in
 * `Authorization: Bearer`. Pass whichever the target MJAPI is configured for; none = no header
 * (only works on a no-auth MJAPI).
 */
export function makeGqlClient(url, auth = {}) {
    const { mjSystemKey, mjUserKey, mjToken } = typeof auth === 'string' ? { mjToken: auth } : auth;
    const authHeaders = mjSystemKey ? { 'x-mj-api-key': mjSystemKey }
        : mjUserKey ? { 'x-api-key': mjUserKey }
        : mjToken ? { Authorization: `Bearer ${mjToken}` }
        : {};
    return async (query, variables) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders },
            body: JSON.stringify({ query, variables }),
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON GQL response (HTTP ${res.status}): ${text.slice(0, 300)}`); }
        if (json.errors?.length) throw new Error(`GraphQL errors: ${JSON.stringify(json.errors).slice(0, 800)}`);
        if (!json.data) throw new Error(`GraphQL returned no data (HTTP ${res.status})`);
        return json.data;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// HubSpot count (direct API — for completeness/parity assertions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds `hubspotTotal(objectName)` → the live total for a CRM object (the parity target).
 * Uses the v3 list endpoint (`?limit=1` returns `total`). Returns null for objects without a
 * simple total (e.g. associations) so the harness skips strict parity for those.
 */
export function makeHubspotTotal(token) {
    return async (objectName) => {
        if (/assoc/i.test(objectName)) return null;
        const res = await fetch(`${HUBSPOT_API_BASE}/crm/v3/objects/${objectName}?limit=1`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null; // non-CRM/unsupported — skip strict parity, don't fail the run
        const body = await res.json();
        return typeof body.total === 'number' ? body.total : null;
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// DB client (count-parity + record-map integrity) — dual dialect
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the DB assertion client for a platform ('sqlserver' | 'postgresql').
 * Resolves each MJ entity's (SchemaName, BaseTable, ID) from __mj.Entity, then counts rows in the
 * destination table and the record-map rows for that (CompanyIntegration, Entity). The record-map
 * stats expose total vs distinct-ExternalSystemRecordID so the harness can assert 1:1 identity.
 *
 * @param {'sqlserver'|'postgresql'} platform
 * @param {object} dbCfg  { host, port, database, user, password, mjSchema='__mj' }
 */
export async function makeDbClient(platform, dbCfg) {
    const mjSchema = dbCfg.mjSchema ?? '__mj';
    return platform === 'postgresql' ? makePgClient(dbCfg, mjSchema) : makeMssqlClient(dbCfg, mjSchema);
}

async function makeMssqlClient(dbCfg, mjSchema) {
    const sql = (await import('mssql')).default;
    const pool = new sql.ConnectionPool({
        server: dbCfg.host ?? 'localhost',
        port: Number(dbCfg.port ?? 1433),
        database: dbCfg.database,
        user: dbCfg.user ?? 'sa',
        password: dbCfg.password,
        options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
    });
    await pool.connect();

    const entityMeta = async (entityName) => {
        const r = await pool.request().input('n', sql.NVarChar, entityName)
            .query(`SELECT TOP 1 SchemaName, BaseTable, ID FROM [${mjSchema}].[Entity] WHERE Name = @n`);
        const row = r.recordset?.[0];
        if (!row) throw new Error(`Entity '${entityName}' not found in [${mjSchema}].[Entity]`);
        return row;
    };

    return {
        async entityRowCount(entityName) {
            const e = await entityMeta(entityName);
            const r = await pool.request().query(`SELECT COUNT(*) AS c FROM [${ident(e.SchemaName)}].[${ident(e.BaseTable)}]`);
            return Number(r.recordset[0].c);
        },
        async recordMapStats(ciid, entityName) {
            const e = await entityMeta(entityName);
            const r = await pool.request().input('ci', sql.UniqueIdentifier, ciid).input('eid', sql.UniqueIdentifier, e.ID)
                .query(`SELECT COUNT(*) AS total, COUNT(DISTINCT ExternalSystemRecordID) AS distinctExternal
                        FROM [${ident(mjSchema)}].[CompanyIntegrationRecordMap]
                        WHERE CompanyIntegrationID = @ci AND EntityID = @eid`);
            const row = r.recordset[0];
            return { total: Number(row.total), distinctExternal: Number(row.distinctExternal) };
        },
        async deleteCredential(credentialID) {
            await pool.request().input('id', sql.UniqueIdentifier, credentialID)
                .query(`DELETE FROM [${mjSchema}].[Credential] WHERE ID = @id`);
        },
        async resolveId(query, params) {
            const req = pool.request();
            for (const [k, v] of Object.entries(params ?? {})) req.input(k, v);
            const r = await req.query(query);
            return r.recordset?.[0]?.ID ?? null;
        },
        async rows(query) { const r = await pool.request().query(query); return r.recordset ?? []; },
        async close() { await pool.close(); },
    };
}

async function makePgClient(dbCfg, mjSchema) {
    const pg = await import('pg');
    const client = new pg.default.Client({
        host: dbCfg.host ?? 'localhost',
        port: Number(dbCfg.port ?? 5432),
        database: dbCfg.database,
        user: dbCfg.user,
        password: dbCfg.password,
    });
    await client.connect();

    // MJ on Postgres preserves PascalCase identifiers via quoting.
    const entityMeta = async (entityName) => {
        const r = await client.query(`SELECT "SchemaName", "BaseTable", "ID" FROM "${mjSchema}"."Entity" WHERE "Name" = $1 LIMIT 1`, [entityName]);
        const row = r.rows?.[0];
        if (!row) throw new Error(`Entity '${entityName}' not found in "${mjSchema}"."Entity"`);
        return row;
    };

    return {
        async entityRowCount(entityName) {
            const e = await entityMeta(entityName);
            const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${ident(e.SchemaName)}"."${ident(e.BaseTable)}"`);
            return Number(r.rows[0].c);
        },
        async recordMapStats(ciid, entityName) {
            const e = await entityMeta(entityName);
            const r = await client.query(
                `SELECT COUNT(*)::int AS total, COUNT(DISTINCT "ExternalSystemRecordID")::int AS "distinctExternal"
                 FROM "${ident(mjSchema)}"."CompanyIntegrationRecordMap"
                 WHERE "CompanyIntegrationID" = $1 AND "EntityID" = $2`, [ciid, e.ID]);
            const row = r.rows[0];
            return { total: Number(row.total), distinctExternal: Number(row.distinctExternal) };
        },
        async deleteCredential(credentialID) {
            await client.query(`DELETE FROM "${mjSchema}"."Credential" WHERE "ID" = $1`, [credentialID]);
        },
        async resolveId(query, params) {
            const r = await client.query(query, params ?? []);
            return r.rows?.[0]?.id ?? r.rows?.[0]?.ID ?? null;
        },
        async rows(query) { const r = await client.query(query); return r.rows ?? []; },
        async close() { await client.end(); },
    };
}

/**
 * Resolves the three setup IDs CreateConnection needs. integrationID is resolved by name (reliable);
 * companyID and credentialTypeID fall back to cfg overrides (the broker/job supplies them once) since
 * they are deployment-specific.
 */
export async function resolveSetupIds(db, cfg) {
    const mjSchema = cfg.mjSchema ?? '__mj';
    const integrationID = cfg.integrationID ?? await db.resolveId(
        cfg.platform === 'postgresql'
            ? `SELECT "ID" FROM "${mjSchema}"."Integration" WHERE "Name" = $1 LIMIT 1`
            : `SELECT TOP 1 ID FROM [${mjSchema}].[Integration] WHERE Name = @n`,
        cfg.platform === 'postgresql' ? ['HubSpot'] : { n: 'HubSpot' });
    return { integrationID, companyID: cfg.companyID, credentialTypeID: cfg.credentialTypeID };
}
