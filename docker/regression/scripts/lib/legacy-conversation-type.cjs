/**
 * Lets the CodeGen conversation procedures accept the `@Type` parameter (a type name) that
 * Open App migrations written before MJ 6.3 pass. MJ 6.3 replaced `Conversation.Type` with
 * `TypeID`, so those calls fail with "@Type is not a parameter".
 */

const PROCEDURES = ['spCreateConversation', 'spUpdateConversation'];

/**
 * Returns the ALTER text of a conversation procedure with an optional `@Type` parameter added
 * after `@TypeID`; the body first sets `@TypeID` from the type's name when only `@Type` is given.
 * Returns null when the procedure already takes `@Type`. Throws when its shape is not the
 * expected CodeGen shape.
 * @param {string} definition The procedure text (OBJECT_DEFINITION).
 * @param {string} schema The MJ core schema, for example `__mj`.
 * @returns {string | null}
 */
function AddLegacyTypeParameter(definition, schema) {
    if (/@Type\s+nvarchar/i.test(definition)) return null;
    const header = /^\s*CREATE\s+PROC(EDURE)?\s/i;
    if (!header.test(definition)) throw new Error('Expected a CREATE PROCEDURE statement');
    const lastParameter = /(\n\s*@TypeID\s+uniqueidentifier\s*=\s*NULL)(\s*\nAS\s*\nBEGIN\s*\n)/i;
    if (!lastParameter.test(definition)) {
        throw new Error('Expected @TypeID uniqueidentifier = NULL as the last parameter, followed by AS BEGIN');
    }
    const lookup =
        `    IF @TypeID IS NULL AND @Type IS NOT NULL SELECT @TypeID = [ID] FROM [${schema}].[ConversationType] WHERE [Name] = @Type;\n`;
    return definition
        .replace(header, (match) => match.replace(/CREATE/i, 'ALTER'))
        .replace(lastParameter, `$1,\n    @Type nvarchar(100) = NULL\nAS\nBEGIN\n${lookup}`);
}

/**
 * Adds the `@Type` parameter to both conversation procedures in the connected database.
 * @param {import('mssql').ConnectionPool} pool
 * @param {string} schema The MJ core schema.
 * @returns {Promise<string[]>} The procedures that were changed.
 */
async function ApplyLegacyConversationType(pool, schema) {
    const changed = [];
    for (const name of PROCEDURES) {
        const result = await pool
            .request()
            .input('name', `${schema}.${name}`)
            .query('SELECT OBJECT_DEFINITION(OBJECT_ID(@name)) AS Definition');
        const definition = result.recordset[0]?.Definition;
        if (!definition) throw new Error(`${schema}.${name} does not exist`);
        const altered = AddLegacyTypeParameter(definition, schema);
        if (altered === null) continue;
        await pool.request().batch(altered);
        changed.push(name);
    }
    return changed;
}

module.exports = { AddLegacyTypeParameter, ApplyLegacyConversationType };
