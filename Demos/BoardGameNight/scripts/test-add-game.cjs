/** Exercises Add Game: a real add, a duplicate refusal, and an illegal category. Cleans up after. */
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');
const ROOT = '/Users/caitlintuttle/Projects/MJ/MJ/packages';
const { ActionEngineServer } = require(`${ROOT}/Actions/Engine/dist/index.js`);
require(`${ROOT}/GeneratedEntities/dist/index.js`);
const { LoadGameNightEntities } = require(`${ROOT}/GameNight/dist/index.js`);
LoadGameNightEntities();
require(`${ROOT}/MJAPI/dist/custom/add-game.action.js`);

const run = async (engine, action, user, label, params) => {
  const r = await engine.RunAction({ Action: action, ContextUser: user, Params: params });
  console.log(`\n--- ${label}`);
  console.log(`    Success: ${r?.Success}`);
  console.log(`    Message: ${String(r?.Message ?? r?.Result?.Message ?? '').slice(0, 240)}`);
};

(async () => {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST, port: parseInt(process.env.DB_PORT, 10), database: process.env.DB_DATABASE,
    user: process.env.CODEGEN_DB_USERNAME, password: process.env.CODEGEN_DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: false },
  }).connect();

  await setupSQLServerClient(new SQLServerProviderConfigData(pool, '__mj'), { mode: 'task' });
  await UserCache.Instance.Refresh(pool);
  const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];

  const md = new Metadata();
  const rv = new RunView(); // global-provider-ok: one-off CLI script
  const engine = ActionEngineServer.Instance;
  await engine.Config(false, user);

  const action = engine.Actions.find((a) => a.Name === 'Add Game');
  if (!action) throw new Error("Action 'Add Game' not found — run register-add-game-action.cjs.");
  const p = (Name, Value) => ({ Name, Type: 'Input', Value });

  await run(engine, action, user, 'ADD a new game with a new publisher (should SUCCEED)', [
    p('Name', 'Skull'), p('Category', 'Party'), p('MinPlayers', '3'), p('MaxPlayers', '6'),
    p('Publisher', 'Lui-meme'), p('YearPublished', '2011'), p('MinPlayTimeMinutes', '15'),
    p('MaxPlayTimeMinutes', '45'), p('Weight', '1.5'), p('Notes', 'Created by test-add-game.cjs'),
  ]);

  await run(engine, action, user, 'DUPLICATE name (should FAIL)', [p('Name', 'Skull')]);
  await run(engine, action, user, 'EXISTING seed game (should FAIL)', [p('Name', 'Wingspan')]);
  await run(engine, action, user, 'ILLEGAL category (should FAIL, listing legal values)', [
    p('Name', 'Some Other Game'), p('Category', 'Bluffing'),
  ]);

  // ---- Cleanup ----
  const games = await rv.RunView({ EntityName: 'Games', ExtraFilter: `Notes='Created by test-add-game.cjs'`, ResultType: 'simple' }, user);
  let removed = 0;
  for (const g of games.Results ?? []) {
    const e = await md.GetEntityObject('Games', user);
    await e.Load(g.ID);
    if (await e.Delete()) removed++; else console.error(`  game: ${e.LatestResult?.CompleteMessage}`);
  }
  const pubs = await rv.RunView({ EntityName: 'Publishers', ExtraFilter: `Name='Lui-meme'`, ResultType: 'simple' }, user);
  let pubsRemoved = 0;
  for (const pu of pubs.Results ?? []) {
    const e = await md.GetEntityObject('Publishers', user);
    await e.Load(pu.ID);
    if (await e.Delete()) pubsRemoved++;
  }
  console.log(`\nCleanup: ${removed} game(s), ${pubsRemoved} publisher(s) deleted.`);

  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e.message); process.exit(1); });
