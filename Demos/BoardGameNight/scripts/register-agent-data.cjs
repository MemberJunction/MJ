/**
 * Gives the Game Night Scorekeeper agent a READ path.
 *
 * Before this, the agent could only write (Log Play Session) — asked "who has the most Catan wins" it
 * had nothing to consult. MJ's mechanism is AIAgentDataSource: rows the AgentDataPreloader executes
 * BEFORE the agent runs, landing the results in its context. SourceType is 'RunQuery' | 'RunView'.
 *
 * Queries rather than RunView on purpose. A RunView over Play Session Players would hand the agent 120
 * rows of GUIDs and expect it to join Players, Games and Sessions in its head — reliable right up until
 * it isn't. These queries do the joins and the aggregation in SQL, so the agent reads
 * ('Cait', 'Catan', 3 wins) and simply looks up the answer.
 *
 * Everything goes through BaseEntity.Save(); idempotent.
 */
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');
require('/Users/caitlintuttle/Projects/MJ/MJ/packages/GeneratedEntities/dist/index.js');

const AGENT_NAME = 'Game Night Scorekeeper';

/**
 * Per-player-per-game competitive record.
 *
 * The chance baseline is 1 / COUNT(DISTINCT Placement) — competing SIDES, not head count — so a
 * six-player team game of Codenames scores against 2 sides (50%), not 6 (16.7%). Head count would
 * report Codenames players as twice as good as they are.
 *
 * Co-op and abandoned sessions are excluded: every co-op participant shares one IsWinner, so those
 * sessions measure the group rather than the player, and an abandoned session has no result at all.
 */
const STATS_SQL = `
WITH Sides AS (
    SELECT psp.PlaySessionID, COUNT(DISTINCT psp.Placement) AS Sides
    FROM [BoardGameNight].[PlaySessionPlayer] psp
        INNER JOIN [BoardGameNight].[PlaySession] s ON s.ID = psp.PlaySessionID
    WHERE s.Outcome = 'Completed' AND psp.Placement IS NOT NULL
    GROUP BY psp.PlaySessionID
)
SELECT
    p.[Nickname]                                                              AS [Player],
    p.[SkillLevel],
    g.[Name]                                                                  AS [Game],
    g.[Category],
    COUNT(*)                                                                  AS [Plays],
    SUM(CAST(psp.[IsWinner] AS INT))                                          AS [Wins],
    CAST(100.0 * SUM(CAST(psp.[IsWinner] AS INT)) / COUNT(*) AS DECIMAL(5,1)) AS [WinPct],
    CAST(100.0 * AVG(1.0 / sd.[Sides]) AS DECIMAL(5,1))                       AS [ChancePct],
    CAST(AVG(CAST(psp.[Placement] AS DECIMAL(5,2))) AS DECIMAL(5,2))          AS [AvgPlacement],
    CAST(AVG(CAST(psp.[Score] AS DECIMAL(10,2))) AS DECIMAL(10,2))            AS [AvgScore]
FROM [BoardGameNight].[PlaySessionPlayer] psp
    INNER JOIN [BoardGameNight].[PlaySession] s ON s.ID = psp.PlaySessionID
    INNER JOIN [Sides] sd                       ON sd.PlaySessionID = psp.PlaySessionID
    INNER JOIN [BoardGameNight].[Player] p      ON p.ID = psp.PlayerID
    INNER JOIN [BoardGameNight].[Game] g        ON g.ID = s.GameID
WHERE s.[Outcome] = 'Completed' AND psp.[Placement] IS NOT NULL
GROUP BY p.[Nickname], p.[SkillLevel], g.[Name], g.[Category]
ORDER BY g.[Name], [Wins] DESC, [Plays] DESC`.trim();

/** Every session, most recent first — answers "when did we last play X" and "how often do we play Y". */
const HISTORY_SQL = `
SELECT
    g.[Name]                                                        AS [Game],
    g.[Category],
    CONVERT(varchar(10), s.[PlayedAt], 23)                          AS [PlayedOn],
    s.[Outcome],
    s.[DurationMinutes],
    g.[MaxPlayTimeMinutes]                                          AS [BoxMaxMinutes],
    s.[LocationName],
    COUNT(psp.[ID])                                                 AS [Participants],
    STRING_AGG(p.[Nickname], ', ')                                  AS [Players],
    STRING_AGG(CASE WHEN psp.[IsWinner] = 1 THEN p.[Nickname] END, ', ') AS [Winners]
FROM [BoardGameNight].[PlaySession] s
    INNER JOIN [BoardGameNight].[Game] g                ON g.ID = s.GameID
    INNER JOIN [BoardGameNight].[PlaySessionPlayer] psp ON psp.PlaySessionID = s.ID
    INNER JOIN [BoardGameNight].[Player] p              ON p.ID = psp.PlayerID
GROUP BY g.[Name], g.[Category], s.[PlayedAt], s.[Outcome], s.[DurationMinutes],
         g.[MaxPlayTimeMinutes], s.[LocationName]
ORDER BY s.[PlayedAt] DESC`.trim();

/**
 * ROW-LEVEL per-player participation — one row per (player, session).
 *
 * Added because the two aggregate sources between them could not answer "show me Cait's play over
 * time with games and scores": Player Game Stats has scores but no dates, and Session History has
 * dates but flattens players into a "Cait, Mars, Han" string with no placement or score. Asked for a
 * timeline, the agent had no clean path and estimated — producing a tidy bar chart whose months were
 * wrong and whose total (18) matched neither the real figure (24) nor its own bars (16).
 *
 * Row-level rather than a monthly rollup on purpose: from these rows the agent can group by month
 * itself, AND answer "what did Cait score in Wingspan", which a rollup would have thrown away.
 *
 * Includes co-op and abandoned sessions — they are real play, and excluding them is what made the
 * competitive-only count (16) look plausible.
 */
const PLAYER_SESSIONS_SQL = `
SELECT
    p.[Nickname]                                        AS [Player],
    CONVERT(varchar(10), s.[PlayedAt], 23)              AS [PlayedOn],
    FORMAT(s.[PlayedAt], 'yyyy-MM')                     AS [Month],
    g.[Name]                                            AS [Game],
    g.[Category],
    s.[Outcome],
    psp.[Placement],
    psp.[Score],
    CAST(psp.[IsWinner] AS INT)                         AS [IsWinner],
    psp.[FactionOrColor],
    s.[DurationMinutes],
    s.[LocationName],
    (SELECT COUNT(*) FROM [BoardGameNight].[PlaySessionPlayer] x
      WHERE x.[PlaySessionID] = s.[ID])                 AS [Participants]
FROM [BoardGameNight].[PlaySessionPlayer] psp
    INNER JOIN [BoardGameNight].[PlaySession] s ON s.[ID] = psp.[PlaySessionID]
    INNER JOIN [BoardGameNight].[Player] p      ON p.[ID] = psp.[PlayerID]
    INNER JOIN [BoardGameNight].[Game] g        ON g.[ID] = s.[GameID]
ORDER BY p.[Nickname], s.[PlayedAt] DESC`.trim();

const QUERIES = [
  {
    Name: 'Board Game Night - Player Session Detail',
    UserQuestion: "Show one player's sessions over time, with the game, placement and score.",
    Description:
      'ONE ROW PER PLAYER PER SESSION — the most detailed source, and the one to use for anything ' +
      'about a specific person over time. Has PlayedOn, Month, Game, Category, Outcome, Placement, ' +
      'Score, IsWinner, FactionOrColor, DurationMinutes and Participants. Filter by Player for a ' +
      'timeline; group by Month to count sessions per month; read Placement and Score for how they did. ' +
      'Includes cooperative and abandoned sessions, so counts from here are TOTAL play, not just ' +
      'competitive. Never estimate a per-player count — count these rows.',
    SQL: PLAYER_SESSIONS_SQL,
    DestinationPath: 'PlayerSessionDetail',
  },
  {
    Name: 'Board Game Night - Player Game Stats',
    UserQuestion: 'Who wins the most at a particular game, and are they actually better than chance?',
    Description:
      'Competitive record per player per game: plays, wins, win %, the chance baseline for the tables ' +
      'actually played, average placement and average score. Use Wins to answer "who has the most X wins", ' +
      'and WinPct vs ChancePct to judge whether that is skill or just table count. Excludes cooperative ' +
      'and abandoned sessions, which have no individual result.',
    SQL: STATS_SQL,
    DestinationPath: 'PlayerGameStats',
  },
  {
    Name: 'Board Game Night - Session History',
    UserQuestion: 'What have we played, when, and who won?',
    Description:
      'Every play session, most recent first: game, date, outcome, duration against the box estimate, ' +
      'location, participants and winners. Use for "when did we last play X", "how many times have we ' +
      'played Y", and questions about how long games actually run.',
    SQL: HISTORY_SQL,
    DestinationPath: 'SessionHistory',
  },
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

  const agent = await findOne('MJ: AI Agents', `Name='${AGENT_NAME}'`);
  if (!agent) throw new Error(`Agent '${AGENT_NAME}' not found — run register-agent.cjs first.`);

  let order = 1;
  for (const spec of QUERIES) {
    // 1. The query itself. Status 'Approved' is what makes it runnable.
    const priorQ = await findOne('MJ: Queries', `Name='${spec.Name.replace(/'/g, "''")}'`);
    const q = await md.GetEntityObject('MJ: Queries', user);
    if (priorQ) { await q.Load(priorQ.ID); } else { q.NewRecord(); }
    q.Name = spec.Name;
    q.UserQuestion = spec.UserQuestion;
    q.Description = spec.Description;
    q.SQL = spec.SQL;
    q.Status = 'Approved';
    await saveOrThrow(q, `Query ${spec.Name}`);
    console.log(`${priorQ ? 'Updated' : 'Created'} query '${spec.Name}'`);

    // 2. Hand it to the agent as a preloaded data source.
    const priorDS = await findOne('MJ: AI Agent Data Sources', `AgentID='${agent.ID}' AND Name='${spec.Name.replace(/'/g, "''")}'`);
    const ds = await md.GetEntityObject('MJ: AI Agent Data Sources', user);
    if (priorDS) { await ds.Load(priorDS.ID); } else { ds.NewRecord(); }
    ds.AgentID = agent.ID;
    ds.Name = spec.Name;
    ds.Description = spec.Description;
    ds.SourceType = 'RunQuery';
    ds.QueryName = spec.Name;
    // WITHOUT THESE TWO the source silently fails. AgentDataPreloader switches on DestinationType and
    // pushes anything unrecognised (including NULL) onto failedSources with "Unknown destination type",
    // so the query never reaches the agent — which is exactly how this agent ended up confidently
    // answering a Catan question from the dashboard's total-wins leaderboard instead.
    //
    // 'Data' is the only LLM-visible destination: 'Context' is for actions only and 'Payload' is agent
    // state. DestinationPath is the key the prompt template renders, so it must match the Nunjucks
    // variable in the prompt exactly.
    ds.DestinationType = 'Data';
    ds.DestinationPath = spec.DestinationPath;
    ds.MaxRows = 250; // Bounded so a growing session log cannot quietly crowd out the prompt.
    ds.ExecutionOrder = order++;
    ds.Status = 'Active';
    await saveOrThrow(ds, `DataSource ${spec.Name}`);
    console.log(`  -> data source attached (RunQuery, order ${ds.ExecutionOrder}, MaxRows ${ds.MaxRows})`);
  }

  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
