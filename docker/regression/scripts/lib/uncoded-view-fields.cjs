/**
 * Removes the virtual fields of Open App entities that no installed app package defines.
 *
 * After an app's migrations, the Open App install refreshes the app schema's metadata, which adds
 * every base-view column as a field. When an app release widens a view without regenerating its
 * code, the browser then asks for a field that the app's GraphQL type does not have, and every
 * read of that entity fails with "Cannot query field".
 */

const fs = require('fs');
const path = require('path');

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/** Adds every identifier in `text` to `ids` and returns it. */
function CollectIdentifiers(text, ids = new Set()) {
    for (const match of text.matchAll(IDENTIFIER)) ids.add(match[0]);
    return ids;
}

/**
 * The fields whose name is not an identifier in the app code.
 * @param {{ Entity: string, Field: string }[]} fields
 * @param {Set<string>} identifiers
 */
function FieldsWithoutCode(fields, identifiers) {
    return fields.filter((field) => !identifiers.has(field.Field));
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

/** Identifiers in the `dist` folders of every installed package in the given scopes. */
function appCodeIdentifiers(storeDir, scopes) {
    const ids = new Set();
    const prefixes = scopes.map((scope) => `${scope}+`);
    for (const folder of fs.readdirSync(storeDir)) {
        if (!prefixes.some((prefix) => folder.startsWith(prefix))) continue;
        const scopeDir = path.join(storeDir, folder, 'node_modules', folder.split('+')[0]);
        if (!fs.existsSync(scopeDir)) continue;
        for (const pkg of fs.readdirSync(scopeDir)) {
            const dist = path.join(scopeDir, pkg, 'dist');
            if (!fs.existsSync(dist)) continue;
            for (const file of jsFiles(dist)) CollectIdentifiers(fs.readFileSync(file, 'utf8'), ids);
        }
    }
    return ids;
}

/**
 * Deletes the virtual fields of app entities that no installed app package defines, with the
 * rows that reference them.
 * @param {import('mssql').ConnectionPool} pool
 * @param {string} schema The MJ core schema.
 * @param {object} config The loaded mj.config.cjs.
 * @param {string} storeDir The pnpm store folder (node_modules/.pnpm).
 * @returns {Promise<{ Entity: string, Field: string }[]>} The deleted fields.
 */
async function DropUncodedViewFields(pool, schema, config, storeDir) {
    const scopes = PackageScopes(config);
    if (scopes.length === 0) return [];
    const identifiers = appCodeIdentifiers(storeDir, scopes);
    const result = await pool.request().input('core', schema).query(
        `SELECT f.ID, e.Name AS Entity, f.Name AS Field
         FROM [${schema}].EntityField f JOIN [${schema}].Entity e ON e.ID = f.EntityID
         WHERE f.IsVirtual = 1 AND e.SchemaName <> @core`
    );
    const drop = FieldsWithoutCode(result.recordset, identifiers);
    for (const field of drop) {
        await pool.request().input('id', field.ID).query(
            `DELETE FROM [${schema}].EntityFieldValue WHERE EntityFieldID = @id;
             DELETE FROM [${schema}].EntityFieldPermission WHERE EntityFieldID = @id;
             UPDATE [${schema}].QueryField SET SourceEntityFieldID = NULL WHERE SourceEntityFieldID = @id;
             DELETE FROM [${schema}].EntityField WHERE ID = @id;`
        );
    }
    return drop.map(({ Entity, Field }) => ({ Entity, Field }));
}

module.exports = { CollectIdentifiers, FieldsWithoutCode, PackageScopes, DropUncodedViewFields };
