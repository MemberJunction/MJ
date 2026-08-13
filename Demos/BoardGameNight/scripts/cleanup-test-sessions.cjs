/**
 * Removes sessions created by test-action.cjs.
 *
 * Deletes children explicitly before the parent: the Participants collection's OnRemove 'delete' only
 * cascades for rows the collection has actually loaded, and Delete() returns false (rather than
 * throwing) when the FK still has referencing rows — which is why the inline cleanup silently reported 0.
 */
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');

// Registers the BoardGameNight entity classes; without this GetEntityObject cannot resolve them.
// Absolute dist path because this runs from CodeGenLib, which does not declare the package.
require('/Users/caitlintuttle/Projects/MJ/MJ/packages/GeneratedEntities/dist/index.js');

const MARKER = 'Created by test-action.cjs';

(async () => {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
    user: process.env.CODEGEN_DB_USERNAME,
    password: process.env.CODEGEN_DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: false },
  }).connect();

  await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'), { mode: 'task' });
  await UserCache.Instance.Refresh(pool);
  const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];

  const md = new Metadata();
  const rv = new RunView(); // global-provider-ok: one-off CLI script

  const sessions = await rv.RunView({
    EntityName: 'Play Sessions',
    ExtraFilter: `Notes = '${MARKER}'`,
    ResultType: 'simple',
  }, user);
  if (!sessions.Success) throw new Error(sessions.ErrorMessage);

  let kids = 0;
  let parents = 0;

  for (const s of sessions.Results ?? []) {
    const children = await rv.RunView({
      EntityName: 'Play Session Players',
      ExtraFilter: `PlaySessionID = '${s.ID}'`,
      ResultType: 'simple',
    }, user);
    if (!children.Success) throw new Error(children.ErrorMessage);

    for (const c of children.Results ?? []) {
      const row = await md.GetEntityObject('Play Session Players', user);
      await row.Load(c.ID);
      if (await row.Delete()) kids++;
      else console.error(`  child ${c.ID}: ${row.LatestResult?.CompleteMessage ?? 'delete failed'}`);
    }

    const session = await md.GetEntityObject('Play Sessions', user);
    await session.Load(s.ID);
    if (await session.Delete()) parents++;
    else console.error(`  session ${s.ID}: ${session.LatestResult?.CompleteMessage ?? 'delete failed'}`);
  }

  console.log(`Deleted ${parents} session(s) and ${kids} participation row(s).`);
  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
