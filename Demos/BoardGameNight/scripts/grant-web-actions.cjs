/**
 * Grants the Game Night Scorekeeper MJ's existing web actions.
 *
 * Nothing is built here — 'Google Custom Search' and 'Web Page Content' already ship with MJ and are
 * Active; Sage uses the same two. This only adds the AIAgentAction rows that let our agent reach them.
 *
 * Goes through BaseEntity.Save(); idempotent.
 */
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');

const AGENT_NAME = 'Game Night Scorekeeper';
const ACTION_NAMES = ['Google Custom Search', 'Web Page Content'];

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

  const findOne = async (entityName, filter) => {
    const r = await rv.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple' }, user);
    if (!r.Success) throw new Error(`Read failed on ${entityName}: ${r.ErrorMessage}`);
    return r.Results?.[0] ?? null;
  };

  const agent = await findOne('MJ: AI Agents', `Name='${AGENT_NAME}'`);
  if (!agent) throw new Error(`Agent '${AGENT_NAME}' not found — run register-agent.cjs first.`);

  for (const name of ACTION_NAMES) {
    const action = await findOne('MJ: Actions', `Name='${name.replace(/'/g, "''")}'`);
    if (!action) {
      // Named rather than skipped silently: a missing core action means this MJ install differs.
      console.warn(`  SKIPPED '${name}' — action not found in this database.`);
      continue;
    }

    const prior = await findOne('MJ: AI Agent Actions', `AgentID='${agent.ID}' AND ActionID='${action.ID}'`);
    const link = await md.GetEntityObject('MJ: AI Agent Actions', user);
    if (prior) { await link.Load(prior.ID); } else { link.NewRecord(); }
    link.AgentID = agent.ID;
    link.ActionID = action.ID;
    link.Status = 'Active';
    if (!(await link.Save())) {
      throw new Error(`Grant for '${name}' failed: ${link.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
    console.log(`${prior ? 'Updated' : 'Created'} grant: ${AGENT_NAME} -> ${name}`);
  }

  const total = await rv.RunView({
    EntityName: 'MJ: AI Agent Actions',
    ExtraFilter: `AgentID='${agent.ID}' AND Status='Active'`,
    ResultType: 'simple',
  }, user);
  console.log(`\n${AGENT_NAME} now has ${total.Results?.length ?? 0} active actions.`);

  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
