// End-to-end check of MJ#4946's fix against the clean MJ_6_2_0_NOTIF_4946 database, through MJ's server-side classes built
// in this worktree with @memberjunction/notifications loaded (so CreateShareNotification fans through NotificationEngine and
// the scoped configs). Two saves of an approved Resource Permission on a conversation for the same grantee:
//   1. by the system (Owner-type) user  -> origin System -> the shipped locked row denies every channel -> no notification
//   2. by a person                       -> origin Person -> the type's defaults                          -> one notification
// Creates what it needs (a grantor person, a grantee person, a conversation) and deletes it again. Not committed.
//
//   node --env-file=../../../.env.clean scratch-4946-scoped-e2e.mjs   (from packages/Communication/notifications)
import '@memberjunction/core-entities';
import './dist/index.js';
import { Metadata } from '@memberjunction/core';
import { UserCache } from '@memberjunction/generic-database-provider';
import { NotificationEngine } from './dist/index.js';
import { SQLServerProviderConfigData, setupSQLServerClient } from '@memberjunction/sqlserver-dataprovider';
import { createRequire } from 'node:module';
const sql = createRequire(import.meta.resolve('@memberjunction/sqlserver-dataprovider'))('mssql');

const strip = (s) => (s || '').replace(/'/g, '');
const { DB_HOST, DB_PORT, DB_DATABASE } = process.env;
const pool = await new sql.ConnectionPool({ server: strip(DB_HOST), port: Number(DB_PORT ?? 1433), database: strip(DB_DATABASE), user: strip(process.env.DB_USERNAME), password: strip(process.env.DB_PASSWORD), options: { trustServerCertificate: true, encrypt: false } }).connect();
const provider = await setupSQLServerClient(new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'));
const q = async (s) => (await pool.request().query(s)).recordset;
const md = new Metadata();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const system = UserCache.Users.find((u) => (u?.Type ?? '').trim().toLowerCase() === 'owner');
if (!system) throw new Error('no Owner-type (system) user');
const [convType] = await q(`SELECT ID FROM __mj.vwResourceTypes WHERE Name = 'Conversations'`);
if (!convType) throw new Error('no Conversations resource type');
const [uiRole] = await q(`SELECT ID FROM __mj.vwRoles WHERE Name = 'UI'`);

async function person(name, email) {
    const existing = UserCache.Users.find((u) => u.Email === email);
    if (existing) return existing;
    const u = await md.GetEntityObject('MJ: Users', system);
    u.NewRecord(); u.Name = name; u.Email = email; u.Type = 'User'; u.IsActive = true;
    if (!(await u.Save())) throw new Error(`user ${email} not saved: ${u.LatestResult?.CompleteMessage}`);
    if (uiRole) { const ur = await md.GetEntityObject('MJ: User Roles', system); ur.NewRecord(); ur.UserID = u.ID; ur.RoleID = uiRole.ID; await ur.Save(); }
    await UserCache.Instance.Refresh(provider);
    return UserCache.Users.find((x) => x.Email === email);
}
const grantor = await person('Notif Check Grantor', 'notif-check-grantor@example.test');
const grantee = await person('Notif Check Grantee', 'notif-check-grantee@example.test');

// A sharer may only share what they own, so each grantor gets a conversation of their own.
async function conversationOwnedBy(owner) {
    const c = await md.GetEntityObject('MJ: Conversations', owner);
    c.NewRecord(); c.Name = `notif-check ${owner.Name} ${Date.now()}`; c.UserID = owner.ID;
    if (!(await c.Save())) throw new Error(`conversation not saved: ${c.LatestResult?.CompleteMessage}`);
    return c;
}
const conversations = { [system.ID]: await conversationOwnedBy(system), [grantor.ID]: await conversationOwnedBy(grantor) };

await NotificationEngine.Instance.Config(true, system, provider);
console.log(`scoped configs loaded: ${NotificationEngine.Instance.ScopedNotificationConfigs.length}`);
const count = async () => (await q(`SELECT COUNT(*) AS n FROM __mj.vwUserNotifications WHERE UserID = '${grantee.ID}'`))[0].n;

async function grantAs(who, label) {
    const before = await count();
    const rp = await md.GetEntityObject('MJ: Resource Permissions', who);
    rp.NewRecord();
    rp.ResourceTypeID = convType.ID; rp.ResourceRecordID = conversations[who.ID].ID; rp.Type = 'User'; rp.UserID = grantee.ID;
    rp.PermissionLevel = 'Edit'; rp.Status = 'Approved'; rp.SharedByUserID = who.ID;
    const saved = await rp.Save();
    await sleep(2500);
    const after = await count();
    console.log(`${label}: saved=${saved} ${saved ? '' : rp.LatestResult?.CompleteMessage ?? ''} notifications ${before} -> ${after}`);
    if (saved) {
        for (const n of await q(`SELECT ID FROM __mj.vwUserNotifications WHERE UserID = '${grantee.ID}'`)) { const e = await md.GetEntityObject('MJ: User Notifications', system); if (await e.Load(n.ID)) await e.Delete(); }
        await rp.Delete();
    }
    return { saved, delta: after - before };
}
const asSystem = await grantAs(system, 'grant by the SYSTEM user (origin System)');
const asPerson = await grantAs(grantor, 'grant by a PERSON          (origin Person)');
for (const c of Object.values(conversations)) await c.Delete();
const ok = asSystem.saved && asSystem.delta === 0 && asPerson.saved && asPerson.delta >= 1;
console.log(ok ? 'RESULT: PASS — the locked System-origin row silences the plumbing grant; a person\'s share still notifies' : 'RESULT: FAIL');
await pool.close();
process.exit(ok ? 0 : 1);
