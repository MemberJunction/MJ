/**
 * Removes the virtual fields of Open App entities that the app's GraphQL type does not define.
 *
 * After an app's migrations, the Open App install refreshes the app schema's metadata, which adds
 * every base-view column as a field. When an app release widens a view without regenerating its
 * code, the browser then asks for a field that the app's GraphQL type does not have, and every
 * read of that entity fails with "Cannot query field".
 */

const fs = require('fs');
const path = require('path');

const TYPE_FIELD = /([A-Za-z_$][A-Za-z0-9_$]*_)\.prototype, "([A-Za-z_$][A-Za-z0-9_$]*)"/g;

/**
 * Adds every GraphQL type field decorated in compiled server code (`Type_.prototype, "Field"`)
 * to `types` and returns it.
 * @param {string} text
 * @param {Map<string, Set<string>>} types Type name to field names.
 */
function CollectTypeFields(text, types = new Map()) {
    for (const [, type, field] of text.matchAll(TYPE_FIELD)) {
        if (!types.has(type)) types.set(type, new Set());
        types.get(type).add(field);
    }
    return types;
}

/** The GraphQL name of an entity field, as CodeGen writes it. */
function graphQLFieldName(name) {
    return name.startsWith('__mj') ? `_mj_${name.substring(4)}` : name;
}

/**
 * The fields that the GraphQL type of their entity (`<ClassName>_`) does not define. Fields of an
 * entity with no type in `types` are kept.
 * @param {{ Entity: string, ClassName: string, Field: string }[]} fields
 * @param {Map<string, Set<string>>} types
 */
function FieldsNotInType(fields, types) {
    return fields.filter((field) => {
        const typeFields = types.get(`${field.ClassName}_`);
        return typeFields !== undefined && !typeFields.has(graphQLFieldName(field.Field));
    });
}

/** A bracket-quoted SQL Server identifier. */
function quoteName(name) {
    return `[${name.replace(/]/g, ']]')}]`;
}

/**
 * The SQL batches that keep a view under the name `<view>__Full` and recreate the view with only
 * the given columns and the given grants.
 * @param {string} schema
 * @param {string} view
 * @param {string[]} columns
 * @param {{ Permission: string, Grantee: string }[]} grants
 * @returns {string[]}
 */
function NarrowViewBatches(schema, view, columns, grants) {
    const full = `${view}__Full`;
    const viewName = `${quoteName(schema)}.${quoteName(view)}`;
    const list = columns.map(quoteName).join(', ');
    return [
        `EXEC sp_rename '${viewName.replace(/'/g, "''")}', '${full.replace(/'/g, "''")}';`,
        `CREATE VIEW ${viewName} AS SELECT ${list} FROM ${quoteName(schema)}.${quoteName(full)};`,
        ...grants.map((grant) => `GRANT ${grant.Permission} ON ${viewName} TO ${quoteName(grant.Grantee)};`),
    ];
}

/**
 * Narrows the base view of each named entity to the columns that have entity fields, so a
 * procedure's `SELECT *` read-back matches the metadata. Views that already match are left alone.
 * @param {import('mssql').ConnectionPool} pool
 * @param {string} schema The MJ core schema.
 * @param {string[]} entityNames
 */
async function NarrowBaseViews(pool, schema, entityNames) {
    for (const entityName of entityNames) {
        const entity = (await pool.request().input('name', entityName).query(
            `SELECT ID, SchemaName, BaseView FROM [${schema}].vwEntities WHERE Name = @name`
        )).recordset[0];
        if (!entity) continue;
        const viewName = `${quoteName(entity.SchemaName)}.${quoteName(entity.BaseView)}`;
        const columns = (await pool.request().input('view', viewName).input('entity', entity.ID).query(
            `SELECT c.name AS Name, CASE WHEN f.ID IS NULL THEN 0 ELSE 1 END AS HasField
             FROM sys.columns c LEFT JOIN [${schema}].EntityField f ON f.EntityID = @entity AND f.Name = c.name
             WHERE c.object_id = OBJECT_ID(@view) ORDER BY c.column_id`
        )).recordset;
        const keep = columns.filter((column) => column.HasField === 1).map((column) => column.Name);
        if (keep.length === 0 || keep.length === columns.length) continue;
        const grants = (await pool.request().input('view', viewName).query(
            `SELECT permission_name AS Permission, USER_NAME(grantee_principal_id) AS Grantee
             FROM sys.database_permissions WHERE major_id = OBJECT_ID(@view) AND state = 'G'`
        )).recordset;
        for (const batch of NarrowViewBatches(entity.SchemaName, entity.BaseView, keep, grants)) {
            await pool.request().batch(batch);
        }
    }
}

/** The npm scopes of the `dynamicPackages` entries in mj.config.cjs, without `@memberjunction`. */
function PackageScopes(config) {
    const entries = [...(config.dynamicPackages?.server ?? []), ...(config.dynamicPackages?.client ?? [])];
    const scopes = new Set();
    for (const entry of entries) {
        const name = entry.PackageName ?? '';
        if (name.startsWith('@') && name.includes('/')) scopes.add(name.split('/')[0]);
    }
    scopes.delete('@memberjunction');
    return [...scopes].sort();
}

/** The `.js` files under a folder, recursively. */
function jsFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const child = path.join(dir, entry.name);
        if (entry.isDirectory()) jsFiles(child, out);
        else if (entry.name.endsWith('.js')) out.push(child);
    }
    return out;
}

/** GraphQL type fields in the `dist` folders of every installed package in the given scopes. */
function appTypeFields(storeDir, scopes) {
    const types = new Map();
    const prefixes = scopes.map((scope) => `${scope}+`);
    for (const folder of fs.readdirSync(storeDir)) {
        if (!prefixes.some((prefix) => folder.startsWith(prefix))) continue;
        const scopeDir = path.join(storeDir, folder, 'node_modules', folder.split('+')[0]);
        if (!fs.existsSync(scopeDir)) continue;
        for (const pkg of fs.readdirSync(scopeDir)) {
            const dist = path.join(scopeDir, pkg, 'dist');
            if (!fs.existsSync(dist)) continue;
            for (const file of jsFiles(dist)) CollectTypeFields(fs.readFileSync(file, 'utf8'), types);
        }
    }
    return types;
}

/**
 * Deletes the virtual fields of app entities that the app's GraphQL type does not define, with
 * the rows that reference them, and narrows those entities' base views to match.
 * @param {import('mssql').ConnectionPool} pool
 * @param {string} schema The MJ core schema.
 * @param {object} config The loaded mj.config.cjs.
 * @param {string} storeDir The pnpm store folder (node_modules/.pnpm).
 * @returns {Promise<{ Entity: string, Field: string }[]>} The deleted fields.
 */
async function DropUncodedViewFields(pool, schema, config, storeDir) {
    const scopes = PackageScopes(config);
    if (scopes.length === 0) return [];
    const types = appTypeFields(storeDir, scopes);
    const result = await pool.request().input('core', schema).query(
        `SELECT f.ID, e.Name AS Entity, e.ClassName, f.Name AS Field
         FROM [${schema}].EntityField f JOIN [${schema}].vwEntities e ON e.ID = f.EntityID
         WHERE f.IsVirtual = 1 AND e.SchemaName <> @core`
    );
    const drop = FieldsNotInType(result.recordset, types);
    for (const field of drop) {
        await pool.request().input('id', field.ID).query(
            `DELETE FROM [${schema}].EntityFieldValue WHERE EntityFieldID = @id;
             DELETE FROM [${schema}].EntityFieldPermission WHERE EntityFieldID = @id;
             UPDATE [${schema}].QueryField SET SourceEntityFieldID = NULL WHERE SourceEntityFieldID = @id;
             DELETE FROM [${schema}].EntityField WHERE ID = @id;`
        );
    }
    await NarrowBaseViews(pool, schema, [...new Set(drop.map((field) => field.Entity))]);
    return drop.map(({ Entity, Field }) => ({ Entity, Field }));
}

module.exports = {
    CollectTypeFields,
    FieldsNotInType,
    NarrowViewBatches,
    NarrowBaseViews,
    PackageScopes,
    DropUncodedViewFields,
};
