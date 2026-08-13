/**
 * Registers the 'Add Game' action and grants it to the Game Night Scorekeeper.
 *
 * Separate from register-agent.cjs so re-running either is independent. All writes go through
 * BaseEntity.Save(); idempotent.
 */
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');

const ACTION_NAME = 'Add Game';
const DRIVER_CLASS = '__AddGame';
const AGENT_NAME = 'Game Night Scorekeeper';

const PARAMS = [
  { Name: 'Name', Type: 'Input', ValueType: 'Scalar', IsRequired: true,
    Description: "The game's title as printed on the box, e.g. 'Skull'. Refused if a game with that name already exists." },
  { Name: 'Category', Type: 'Input', ValueType: 'Scalar', IsRequired: false,
    Description: "One of: Strategy, Family, Party, Co-op, Deck Builder, Abstract, Dexterity, Trivia, Legacy. These are the ONLY legal values — the database rejects anything else, so pick the closest fit (a bluffing game is usually Party). Defaults to Strategy." },
  { Name: 'MinPlayers', Type: 'Input', ValueType: 'Scalar', IsRequired: false,
    Description: 'Minimum players the rules support. Defaults to 2.' },
  { Name: 'MaxPlayers', Type: 'Input', ValueType: 'Scalar', IsRequired: false,
    Description: 'Maximum players the rules support. Must be >= MinPlayers. Defaults to MinPlayers.' },
  { Name: 'Publisher', Type: 'Input', ValueType: 'Scalar', IsRequired: false,
    Description: "Publisher name. If it already exists it is reused; if not, a new publisher record is CREATED and reported back. Omit for traditional or public-domain games and it uses the 'Public Domain' placeholder." },
  { Name: 'YearPublished', Type: 'Input', ValueType: 'Scalar', IsRequired: false, Description: 'Year of first publication.' },
  { Name: 'MinPlayTimeMinutes', Type: 'Input', ValueType: 'Scalar', IsRequired: false, Description: 'Publisher-stated minimum play time in minutes.' },
  { Name: 'MaxPlayTimeMinutes', Type: 'Input', ValueType: 'Scalar', IsRequired: false, Description: 'Publisher-stated maximum play time in minutes.' },
  { Name: 'Weight', Type: 'Input', ValueType: 'Scalar', IsRequired: false,
    Description: 'Complexity from 1.00 (lightest) to 5.00 (heaviest), BoardGameGeek style. Outside that range is rejected.' },
  { Name: 'OwnershipStatus', Type: 'Input', ValueType: 'Scalar', IsRequired: false,
    Description: 'One of: Owned, Wishlist, Loaned Out, Sold, Retired. Defaults to Owned.' },
  { Name: 'PurchasePrice', Type: 'Input', ValueType: 'Scalar', IsRequired: false, Description: 'Price paid in USD.' },
  { Name: 'Notes', Type: 'Input', ValueType: 'Scalar', IsRequired: false, Description: 'Free-form notes about this copy.' },
  { Name: 'GameID', Type: 'Output', ValueType: 'Scalar', IsRequired: false, Description: 'ID of the game that was created.' },
];

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

  const findOne = async (entityName, filter) => {
    const r = await rv.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple' }, user);
    if (!r.Success) throw new Error(`Read failed on ${entityName}: ${r.ErrorMessage}`);
    return r.Results?.[0] ?? null;
  };
  const saveOrThrow = async (e, label) => {
    if (!(await e.Save())) throw new Error(`${label} save failed: ${e.LatestResult?.CompleteMessage ?? 'unknown'}`);
  };

  const prior = await findOne('MJ: Actions', `Name='${ACTION_NAME}'`);
  const action = await md.GetEntityObject('MJ: Actions', user);
  if (prior) { await action.Load(prior.ID); } else { action.NewRecord(); }
  action.Name = ACTION_NAME;
  action.Description =
    'Adds a new board game to the collection, the same write the Games form performs. Resolves or creates ' +
    'the publisher (PublisherID is required by the schema) and validates Category and OwnershipStatus ' +
    'against their allowed value lists. Refuses duplicates by name.';
  action.Type = 'Custom';
  action.Status = 'Active';
  action.DriverClass = DRIVER_CLASS;
  action.IconClass = 'fa-solid fa-plus';
  await saveOrThrow(action, 'Action');
  console.log(`${prior ? 'Updated' : 'Created'} action '${ACTION_NAME}' -> ${DRIVER_CLASS}`);

  let count = 0;
  for (const spec of PARAMS) {
    const p0 = await findOne('MJ: Action Params', `ActionID='${action.ID}' AND Name='${spec.Name}'`);
    const p = await md.GetEntityObject('MJ: Action Params', user);
    if (p0) { await p.Load(p0.ID); } else { p.NewRecord(); }
    p.ActionID = action.ID;
    p.Name = spec.Name;
    p.Type = spec.Type;
    p.ValueType = spec.ValueType;
    p.IsArray = false;
    p.IsRequired = spec.IsRequired;
    p.Description = spec.Description;
    await saveOrThrow(p, `ActionParam ${spec.Name}`);
    count++;
  }
  console.log(`Action params written: ${count}`);

  const agent = await findOne('MJ: AI Agents', `Name='${AGENT_NAME}'`);
  if (!agent) throw new Error(`Agent '${AGENT_NAME}' not found — run register-agent.cjs first.`);

  const priorLink = await findOne('MJ: AI Agent Actions', `AgentID='${agent.ID}' AND ActionID='${action.ID}'`);
  const link = await md.GetEntityObject('MJ: AI Agent Actions', user);
  if (priorLink) { await link.Load(priorLink.ID); } else { link.NewRecord(); }
  link.AgentID = agent.ID;
  link.ActionID = action.ID;
  link.Status = 'Active';
  await saveOrThrow(link, 'AgentAction');
  console.log(`${priorLink ? 'Updated' : 'Created'} grant: ${AGENT_NAME} -> ${ACTION_NAME}`);

  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
