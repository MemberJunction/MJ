/**
 * Seed the regression conversation fixture (test-metadata/conversations/.conversations.json)
 * directly in SQL.
 *
 * Why not `mj sync push`? The push runs as the System user, and
 * MJConversationDetailEntityExtended.Save() refuses writes to a conversation the
 * context user neither owns nor holds an Edit grant on. The fixture's conversations
 * belong to the test user, so every Conversation Details row is denied and the whole
 * push rolls back. Relaxing that guard for the System user would weaken a real
 * permission check just to seed test data.
 *
 * The JSON file stays the single source of truth. This script resolves its two lookup
 * forms (`@lookup:MJ: Users.Email=...` and `@lookup:MJ: Environments.Name=...`) and
 * `@parent:ID`. It skips a conversation that already exists for the user, so re-runs
 * are harmless.
 */

const fs = require('fs');
const { sql, connect } = require('./lib/db.cjs');

const FIXTURE = process.env.CONVERSATION_FIXTURE || '/app/test-metadata/conversations/.conversations.json';

/** Resolves `@lookup:MJ: Users.Email=...` / `@lookup:MJ: Environments.Name=...` to an ID. */
async function resolveLookup(pool, value) {
    if (typeof value !== 'string' || !value.startsWith('@lookup:')) {
        return value ?? null;
    }
    const match = value.match(/^@lookup:MJ: (Users|Environments)\.(Email|Name)=(.+)$/);
    if (!match) {
        throw new Error(`Unsupported lookup in conversation fixture: ${value}`);
    }
    const [, entity, field, key] = match;
    const table = entity === 'Users' ? '[User]' : 'Environment';
    const row = (await pool.request()
        .input('key', sql.NVarChar, key)
        .query(`SELECT ID FROM __mj.${table} WHERE ${field} = @key`)).recordset[0];
    if (!row) {
        throw new Error(`Lookup found no row: ${value}`);
    }
    return row.ID;
}

(async () => {
    const pool = await connect();
    const conversations = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    let created = 0;

    for (const conversation of conversations) {
        const f = conversation.fields;
        const userId = await resolveLookup(pool, f.UserID);
        const environmentId = await resolveLookup(pool, f.EnvironmentID);

        const existing = (await pool.request()
            .input('name', sql.NVarChar, f.Name)
            .input('userId', sql.UniqueIdentifier, userId)
            .query('SELECT ID FROM __mj.Conversation WHERE Name = @name AND UserID = @userId')).recordset[0];
        if (existing) {
            console.log(`  Conversation exists: ${f.Name}`);
            continue;
        }

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
            const conversationId = (await new sql.Request(transaction)
                .input('name', sql.NVarChar, f.Name)
                .input('description', sql.NVarChar, f.Description ?? null)
                .input('userId', sql.UniqueIdentifier, userId)
                .input('environmentId', sql.UniqueIdentifier, environmentId)
                .input('type', sql.NVarChar, f.Type ?? 'Chat')
                .input('status', sql.NVarChar, f.Status ?? 'Available')
                .input('scope', sql.NVarChar, f.ApplicationScope ?? 'Global')
                .input('archived', sql.Bit, !!f.IsArchived)
                .input('pinned', sql.Bit, !!f.IsPinned)
                .query(`INSERT INTO __mj.Conversation (Name, Description, UserID, EnvironmentID, Type, Status, ApplicationScope, IsArchived, IsPinned)
                        OUTPUT inserted.ID
                        VALUES (@name, @description, @userId, @environmentId, @type, @status, @scope, @archived, @pinned)`)).recordset[0].ID;

            const details = conversation.relatedEntities?.['MJ: Conversation Details'] ?? [];
            for (let i = 0; i < details.length; i++) {
                const d = details[i].fields;
                // Stagger created-at so the thread keeps the fixture's message order.
                await new sql.Request(transaction)
                    .input('conversationId', sql.UniqueIdentifier, conversationId)
                    .input('userId', sql.UniqueIdentifier, await resolveLookup(pool, d.UserID))
                    .input('role', sql.NVarChar, d.Role)
                    .input('message', sql.NVarChar, d.Message)
                    .input('status', sql.NVarChar, d.Status ?? 'Complete')
                    .input('hidden', sql.Bit, !!d.HiddenToUser)
                    .input('pinned', sql.Bit, !!d.IsPinned)
                    .input('offsetMs', sql.Int, i * 1000)
                    .query(`INSERT INTO __mj.ConversationDetail (ConversationID, UserID, Role, Message, Status, HiddenToUser, IsPinned, __mj_CreatedAt, __mj_UpdatedAt)
                            VALUES (@conversationId, @userId, @role, @message, @status, @hidden, @pinned,
                                    DATEADD(ms, @offsetMs, SYSDATETIMEOFFSET()), DATEADD(ms, @offsetMs, SYSDATETIMEOFFSET()))`);
            }
            await transaction.commit();
            created++;
            console.log(`  Seeded conversation: ${f.Name} (${details.length} messages)`);
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    }

    console.log(`  Conversation fixture: ${created} created`);
    await pool.close();
})().catch(err => {
    console.error(`  Conversation fixture seed failed: ${err.message}`);
    process.exit(1);
});
