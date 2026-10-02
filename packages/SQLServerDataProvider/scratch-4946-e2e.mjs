// End-to-end check of MJ#4946 against the COLLAB_NEXT database, through MJ's own server-side classes built in this worktree:
// a new approved Resource Permission saved with SkipShareNotification creates no "shared with you" notification; the same save
// without the option creates one. Each row written is deleted again. Not committed: a local check for Ian's review.
//
//   node --env-file=../bizapps-collaboration/.env scratch-4946-e2e.mjs
import '@memberjunction/core-entities';
import { EntitySaveOptions, Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { SQLServerProviderConfigData, setupSQLServerClient } from './dist/index.js';
import sql from 'mssql';

const CONVERSATIONS_RESOURCE_TYPE_ID = '81D4BC3D-9FEB-EF11-B01A-286B35C04427';
const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
const pool = await new sql.ConnectionPool({ server: DB_HOST, port: Number(DB_PORT ?? 1433), database: DB_DATABASE, user: DB_USERNAME, password: DB_PASSWORD, options: { trustServerCertificate: true, encrypt: false } }).connect();
const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
const q = async (s) => (await pool.request().query(s)).recordset;
const system = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner');
const grantee = UserCache.Users.find((u) => u.Email === 'bea.member@collab-world.example');
if (!system || !grantee) throw new Error('system user or Bea not found');

// A Northwind conversation Bea holds no grant on yet
const [conversation] = await q(`SELECT TOP 1 c.ID, c.Name, c.UserID FROM __mj.vwConversations c
  JOIN __mj_BizAppsCollaboration.vwSpaceChats sc ON sc.ConversationID = c.ID
  WHERE sc.SpaceID = 'C1000001-0000-4000-8000-000000000001'
    AND NOT EXISTS (SELECT 1 FROM __mj.vwResourcePermissions rp WHERE rp.ResourceRecordID = CONVERT(varchar(36), c.ID) AND rp.UserID = '${grantee.ID}')
  ORDER BY c.Name`);
if (!conversation) throw new Error('no Northwind conversation without a grant for Bea');
console.log(`conversation: ${conversation.Name} (${conversation.ID}); grantee: ${grantee.Email}`);

const notificationCount = async () => (await q(`SELECT COUNT(*) AS n FROM __mj.vwUserNotifications WHERE UserID = '${grantee.ID}'`))[0].n;
const md = new Metadata();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function grant(skip) {
    const before = await notificationCount();
    const rp = await md.GetEntityObject('MJ: Resource Permissions', system);
    rp.NewRecord();
    rp.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
    rp.ResourceRecordID = conversation.ID;
    rp.Type = 'User';
    rp.UserID = grantee.ID;
    rp.PermissionLevel = 'Edit';
    rp.Status = 'Approved';
    rp.SharedByUserID = system.ID;
    const options = new EntitySaveOptions();
    if (skip) options.SkipShareNotification = true;
    const saved = await rp.Save(options);
    await sleep(2500); // the notice is fire-and-forget after the save
    const after = await notificationCount();
    console.log(`${skip ? 'WITH   ' : 'WITHOUT'} SkipShareNotification: saved=${saved} ${saved ? '' : rp.LatestResult?.CompleteMessage ?? ''} notifications ${before} -> ${after} (${after - before >= 1 ? 'a notice was sent' : 'no notice'})`);
    // clean up: the grant, and any notice it made
    if (saved) {
        const made = await q(`SELECT TOP 5 ID FROM __mj.vwUserNotifications WHERE UserID = '${grantee.ID}' AND __mj_CreatedAt > DATEADD(second, -30, GETUTCDATE()) ORDER BY __mj_CreatedAt DESC`);
        for (const n of made) { const e = await md.GetEntityObject('MJ: User Notifications', system); if (await e.Load(n.ID)) await e.Delete(); }
        await rp.Delete();
    }
    return { saved, delta: after - before };
}

const withSkip = await grant(true);
const without = await grant(false);
const ok = withSkip.saved && withSkip.delta === 0 && without.saved && without.delta >= 1;
console.log(ok ? 'RESULT: PASS — the option silences the notice; without it the notice is sent' : 'RESULT: FAIL');
await pool.close();
process.exit(ok ? 0 : 1);
