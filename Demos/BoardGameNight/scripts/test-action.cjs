/**
 * Exercises the Log Play Session action the way an agent would, and proves the session rules apply
 * to it. Three cases: a legal competitive session, an illegal two-winner session, and a bad player
 * name. Cleans up whatever it creates.
 */
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');
// Resolved by absolute dist path rather than package name: this script runs from CodeGenLib (which has
// mssql + the provider), and pnpm's strict resolution would refuse these package names from there.
const ROOT = '/Users/caitlintuttle/Projects/MJ/MJ/packages';
const { ActionEngineServer } = require(`${ROOT}/Actions/Engine/dist/index.js`);
require(`${ROOT}/GeneratedEntities/dist/index.js`);
const { LoadGameNightEntities } = require(`${ROOT}/GameNight/dist/index.js`);
LoadGameNightEntities();
// Registers __LogPlaySession with the ClassFactory.
require(`${ROOT}/MJAPI/dist/custom/log-play-session.action.js`);

const run = async (engine, action, user, label, params) => {
  const result = await engine.RunAction({ Action: action, ContextUser: user, Params: params });
  const code = result?.Result?.ResultCode ?? result?.ResultCode ?? '(none)';
  const msg = result?.Message ?? result?.Result?.Message ?? '';
  console.log(`\n--- ${label}`);
  console.log(`    Success: ${result?.Success}`);
  console.log(`    Code:    ${code}`);
  if (msg) console.log(`    Message: ${String(msg).slice(0, 260)}`);
  return result;
};

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

  const engine = ActionEngineServer.Instance;
  await engine.Config(false, user);

  const action = engine.Actions.find((a) => a.Name === 'Log Play Session');
  if (!action) throw new Error("Action 'Log Play Session' not found in ActionEngine — is the metadata registered?");
  console.log(`Found action: ${action.Name} (${action.DriverClass})`);

  const p = (Name, Value) => ({ Name, Type: 'Input', Value });

  // 1. LEGAL: 2-player Patchwork, one winner. Patchwork is Min2/Max2 so this fits exactly.
  const ok = await run(engine, action, user, 'LEGAL competitive session (should SUCCEED)', [
    p('Game', 'Patchwork'),
    p('Outcome', 'Completed'),
    p('LocationName', 'Action test'),
    p('DurationMinutes', '25'),
    p('Notes', 'Created by test-action.cjs'),
    p('Participants', JSON.stringify([
      { Player: 'Cait', Score: 30, Placement: 1, IsWinner: true },
      { Player: 'Han', Score: 22, Placement: 2, IsWinner: false },
    ])),
  ]);

  // 2. ILLEGAL: two winners in a non-Party game. The entity rule must reject this.
  await run(engine, action, user, 'ILLEGAL two winners (should FAIL on the rule)', [
    p('Game', 'Patchwork'),
    p('Outcome', 'Completed'),
    p('Participants', JSON.stringify([
      { Player: 'Cait', Score: 30, Placement: 1, IsWinner: true },
      { Player: 'Han', Score: 22, Placement: 1, IsWinner: true },
    ])),
  ]);

  // 3. ILLEGAL: unknown player — should come back with the valid list, not a guess.
  await run(engine, action, user, 'UNKNOWN player (should FAIL with the roster)', [
    p('Game', 'Patchwork'),
    p('Participants', JSON.stringify([{ Player: 'Nobody McGee', Score: 1, Placement: 1, IsWinner: true }])),
  ]);

  // 4. ILLEGAL: participant count outside the game's range (Patchwork is strictly 2).
  await run(engine, action, user, 'TOO MANY players for the game (should FAIL on the range rule)', [
    p('Game', 'Patchwork'),
    p('Outcome', 'Completed'),
    p('Participants', JSON.stringify([
      { Player: 'Cait', Score: 30, Placement: 1, IsWinner: true },
      { Player: 'Han', Score: 22, Placement: 2, IsWinner: false },
      { Player: 'Mars', Score: 18, Placement: 3, IsWinner: false },
    ])),
  ]);

  // ---- Cleanup: remove anything case 1 created ------------------------------------------------
  const created = await rv.RunView({
    EntityName: 'Play Sessions',
    ExtraFilter: `Notes = 'Created by test-action.cjs'`,
    ResultType: 'simple',
  }, user);

  let removed = 0;
  for (const row of created.Results ?? []) {
    const session = await md.GetEntityObject('Play Sessions', user);
    await session.Load(row.ID);
    // OnRemove 'delete' on the Participants collection means the children go with it.
    await session.Participants.LoadRecords?.();
    if (await session.Delete()) removed++;
  }
  console.log(`\nCleanup: deleted ${removed} test session(s).`);

  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('\nFAILED:', e.message); console.error(e.stack?.split('\n').slice(1, 4).join('\n')); process.exit(1); });
