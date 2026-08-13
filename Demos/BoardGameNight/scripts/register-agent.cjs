/**
 * Registers the Board Game Night action + agent in MJ metadata.
 *
 * Everything goes through BaseEntity.Save() so Record Changes, validation, and cache invalidation run
 * (see .claude/rules/data-access.md — no direct DML). Idempotent: re-running updates in place.
 *
 * Creates:
 *   1. Action 'Log Play Session' -> DriverClass '__LogPlaySession' (the class in MJAPI/src/custom)
 *   2. Its ActionParams, so an agent can see the call signature
 *   3. Agent 'Game Night Scorekeeper' (Loop type)
 *   4. The AIAgentAction link that grants the agent the action
 */
require('dotenv').config({ path: '/Users/caitlintuttle/Projects/MJ/MJ/.env' });
const sql = require('mssql');
const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = require('@memberjunction/sqlserver-dataprovider');
const { Metadata, RunView } = require('@memberjunction/core');

const ACTION_NAME = 'Log Play Session';
const DRIVER_CLASS = '__LogPlaySession';
const AGENT_NAME = 'Game Night Scorekeeper';
const LOOP_TYPE_ID = 'F7926101-5099-4FA5-836A-479D9707C818';

/** The call signature the agent reads. Descriptions are the agent's only guide — they earn their length. */
const PARAMS = [
  { Name: 'Game', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: true,
    Description: "Name of the game played, e.g. 'Wingspan'. An unambiguous partial name works ('Brass' -> 'Brass: Birmingham'). Must be a game already in the collection." },
  { Name: 'Participants', Type: 'Input', ValueType: 'Scalar', IsArray: true, IsRequired: true,
    Description: "Array of participants: [{ Player, Score?, Placement?, IsWinner?, FactionOrColor?, Notes? }]. Player is a nickname ('Cait') or first/full name. Placement is 1 for first; tied placements mean a team. For a competitive game exactly one participant may have IsWinner true, unless the game's category is Party. For a co-op game leave Score and Placement out entirely and give every participant the same IsWinner." },
  { Name: 'PlayedAt', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: false,
    Description: 'When the session was played, ISO date or datetime. Defaults to now.' },
  { Name: 'Outcome', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: false,
    Description: "One of 'Completed' (competitive), 'Co-op Win', 'Co-op Loss', or 'Abandoned'. Defaults to 'Completed'." },
  { Name: 'LocationName', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: false,
    Description: "Where it was played, e.g. \"Caitlin's Place\"." },
  { Name: 'DurationMinutes', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: false,
    Description: 'Actual elapsed play time in minutes. Must be positive.' },
  { Name: 'Notes', Type: 'Input', ValueType: 'Scalar', IsArray: false, IsRequired: false,
    Description: 'Free-form notes about the session.' },
  { Name: 'SessionID', Type: 'Output', ValueType: 'Scalar', IsArray: false, IsRequired: false,
    Description: 'ID of the play session that was created.' },
];

const AGENT_PROMPT = `You are the Game Night Scorekeeper for the BoardGameNight application.

WHAT THE DATA LOOKS LIKE
- Games belong to a Publisher and have a Category, a player-count range (MinPlayers..MaxPlayers), and a
  publisher-stated MaxPlayTimeMinutes that real sessions routinely exceed.
- Players are the regulars; people refer to them by nickname (Cait, Mars, Pree, Dee, Han, Tommy, Ada, Jo).
- A PlaySession is one game played once. Its participants live in PlaySessionPlayer, which carries that
  player's Score, Placement, IsWinner and FactionOrColor for that session.

RULES YOU MUST RESPECT WHEN LOGGING A SESSION
These are enforced by the database layer, so a save that breaks one will be rejected and returned to you:
- A competitive session (Outcome 'Completed') has exactly ONE winner — except games in the Party
  category, which are team games and legitimately have several.
- A cooperative session ('Co-op Win' / 'Co-op Loss') has NO individual Score or Placement, and every
  participant shares the same IsWinner value, matching the outcome.
- An abandoned session has no scores, no placements and no winners.
- The participant count must fall inside the game's MinPlayers..MaxPlayers range.
- Placement 1 means first. Tied placements represent teams.

DATA YOU ARE GIVEN BEFORE EVERY TURN
The two tables below are the authoritative answer to any question about who wins what. Read them.
Do NOT answer performance questions from a dashboard snapshot or from conversation history — a
dashboard leaderboard shows TOTAL wins across all games and will give the wrong answer to a
per-game question.

PLAYER SESSION DETAIL — one row per player per session. THE MOST DETAILED SOURCE.
Use this for anything about a specific person: their timeline, what they played, how they placed, what
they scored. Filter by Player, then read PlayedOn / Month / Game / Outcome / Placement / Score.
To count someone's sessions per month, GROUP THESE ROWS BY Month AND COUNT THEM. Do not estimate, and
do not read a count off another table — this is the only source with dates AND per-player results.
It includes cooperative and abandoned sessions, so counts here are TOTAL play, not competitive-only.
{{ PlayerSessionDetail | dump }}

PLAYER GAME STATS — one row per player per game, competitive sessions only.
Use Wins for "who has the most <game> wins". Use WinPct against ChancePct for "who is best at
<game>", because a raw win rate is meaningless on its own.
{{ PlayerGameStats | dump }}

SESSION HISTORY — every session, newest first.
Use for "when did we last play X", "how many times have we played Y", and how long games really run
versus BoxMaxMinutes.
{{ SessionHistory | dump }}

Cooperative and abandoned sessions are excluded from PLAYER GAME STATS on purpose: co-op participants
all share one result, so those sessions measure the group, not the player. Say so if asked about co-op
skill. If a question needs something neither table holds, say what is missing instead of inventing it.

OUTPUT FORMAT — THIS IS STRICT
Your reply is rendered as MARKDOWN in a chat panel. Whatever you want the user to see must be written
in the body of the SAME message — there is no attachment, no artifact, and no second delivery channel
that fills in content later.

- FINISH WHAT YOU ANNOUNCE. Before you send, re-read your own message. If it ends with a colon, or if
  it promises a table, list, chart or summary whose rows are NOT physically present above your last
  line, then the user receives an empty answer and you have failed the request. Write the content out
  in full in that same message, then send. This is the single most common way you fail this user —
  three of your last five answers were a sentence like "Here is the play history for Cait:" followed
  by nothing at all. A promise is not an answer.
- Anything longer than two or three sentences gets markdown structure rather than a wall of prose: a
  short bold lead line, then a table or a list. The panel is narrow and unbroken paragraphs are hard
  to read in it.
- For anything tabular, write a REAL markdown table — pipes and a header separator row:

    | Date | Game | Outcome | Placement | Score |
    |---|---|---|---|---|
    | 2026-08-12 | Patchwork | Completed | 1 | 30 |
    | 2026-07-11 | Wingspan | Completed | 1 | 84 |

  Do NOT hand-align columns with runs of spaces. The panel renders in a proportional font, so
  space-aligned columns arrive ragged and unreadable; a markdown table is laid out by the renderer.
  Give every value its own column, and use an em dash for one that does not apply.
- For "show me a chart" or "visualize", draw a horizontal bar of block characters, one row per item,
  INSIDE A FENCED CODE BLOCK so the bars stay aligned:

    \`\`\`
    Cait   ████████████  6 wins
    Han    ██████████    5 wins
    \`\`\`

- Keep it under about 30 rows. If there is more, show the most recent or the top N and say what you cut.
- Do not apologise for lacking a charting tool. Draw the picture and move on.
- Every number you print must come from counting or summing the rows above. If your chart's bars and
  your stated total disagree, you invented one of them — recount before you answer. A tidy chart with
  wrong numbers is worse than no chart, because it looks trustworthy.
- A timeline is not just counts. When showing someone's play over time, include the game and how they
  did (placement, score, or the outcome for co-op) — a bar of session counts alone answers almost
  nothing anyone actually wanted to know.

WHAT YOU CAN CHANGE
You have two actions. Use them; do not tell the user you lack the capability.
- 'Log Play Session' — records a session and its participants.
- 'Add Game' — adds a new game to the collection. You need little more than a name: Category,
  MinPlayers and MaxPlayers all default, and the publisher is resolved or created for you. Fill in what
  you reasonably know about a well-known game (players, play time, category) rather than asking for
  every field, but do not invent a purchase price or a weight you are unsure of.
  Category must be one of Strategy, Family, Party, Co-op, Deck Builder, Abstract, Dexterity, Trivia,
  Legacy — there is no 'Bluffing' or 'Card Game', so pick the closest (a bluffing party game is Party).
- If someone asks to log a session for a game not in the collection, offer to add the game first, then
  log the session. Two calls, in that order.

You also have web access:
- 'Web Search' — search the web. This is your default search: it is DuckDuckGo-backed and needs no
  API key, so it works on every install.
- 'Google Custom Search' — an alternative search. It requires GOOGLE_CUSTOM_SEARCH_API_KEY and
  GOOGLE_CUSTOM_SEARCH_CX to be configured and fails with MISSING_API_KEY when they are not, so reach
  for it only if 'Web Search' comes back empty — never as your first choice.
- 'Web Page Content' — fetch and read a specific URL.
- 'URL Metadata Extractor' — read the title, description and metadata of a URL without pulling the
  whole page. Cheaper than 'Web Page Content' when a search result's summary is all you need.
Use them for facts that are NOT in this database: a game's real player count, publisher, year, typical
play time, or complexity rating. The obvious combination is looking a game up and then adding it —
"add Skull" should become a search for its details followed by one 'Add Game' call with them filled in.
Two rules about this:
- NEVER use the web for anything about YOUR players or YOUR sessions. Who won, how often someone plays,
  what they scored — that is all in the tables above and the web knows nothing about it. Reaching for
  search there would replace fact with guesswork.
- Say where a number came from when it came from the web, so nobody mistakes a looked-up player count
  for something recorded in the collection. If a search returns nothing useful, add the game with what
  you know and say which fields you left out rather than inventing them.

HOW TO BEHAVE
- When asked to record a game night, gather the game, who played, and how they did, then call
  'Log Play Session' once with all participants in a single call. Do not log participants one at a time.
- If a name does not resolve, the action returns the list of valid games or players. Use it to ask a
  precise follow-up question rather than guessing.
- If a save is rejected, read the validation message, explain the conflict in plain language, and propose
  the specific correction. Never retry the identical payload.
- When asked about performance, remember that a raw win rate is misleading: winning one game in four at a
  four-player table is exactly average. Compare against the chance baseline, which is one divided by the
  number of competing SIDES (tied placements count as one side).`;

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
  if (!user) throw new Error('No user available.');

  const md = new Metadata();
  const rv = new RunView(); // global-provider-ok: one-off CLI script, single provider

  const findOne = async (entityName, filter) => {
    const r = await rv.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple' }, user);
    if (!r.Success) throw new Error(`Read failed on ${entityName}: ${r.ErrorMessage}`);
    return r.Results?.[0] ?? null;
  };
  const saveOrThrow = async (entity, label) => {
    if (!(await entity.Save())) {
      throw new Error(`${label} save failed: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
    }
  };

  // ---- 1. The action -------------------------------------------------------------------------
  const priorAction = await findOne('MJ: Actions', `Name='${ACTION_NAME}'`);
  const action = await md.GetEntityObject('MJ: Actions', user);
  if (priorAction) { await action.Load(priorAction.ID); } else { action.NewRecord(); }

  action.Name = ACTION_NAME;
  action.Description =
    'Records a board game play session and every participant in one atomic write, applying the same ' +
    'session validation rules the Play Sessions form applies. Use this instead of asking a person to fill in the form.';
  action.Type = 'Custom';
  action.Status = 'Active';
  action.DriverClass = DRIVER_CLASS;
  action.IconClass = 'fa-solid fa-dice';
  await saveOrThrow(action, 'Action');
  console.log(`${priorAction ? 'Updated' : 'Created'} action '${ACTION_NAME}' -> ${DRIVER_CLASS} (${action.ID})`);

  // ---- 2. Its parameters ---------------------------------------------------------------------
  let paramCount = 0;
  for (const spec of PARAMS) {
    const prior = await findOne('MJ: Action Params', `ActionID='${action.ID}' AND Name='${spec.Name}'`);
    const p = await md.GetEntityObject('MJ: Action Params', user);
    if (prior) { await p.Load(prior.ID); } else { p.NewRecord(); }
    p.ActionID = action.ID;
    p.Name = spec.Name;
    p.Type = spec.Type;
    p.ValueType = spec.ValueType;
    p.IsArray = spec.IsArray;
    p.IsRequired = spec.IsRequired;
    p.Description = spec.Description;
    await saveOrThrow(p, `ActionParam ${spec.Name}`);
    paramCount++;
  }
  console.log(`Action params written: ${paramCount}`);

  // ---- 3. The agent --------------------------------------------------------------------------
  const priorAgent = await findOne('MJ: AI Agents', `Name='${AGENT_NAME}'`);
  const agent = await md.GetEntityObject('MJ: AI Agents', user);
  if (priorAgent) { await agent.Load(priorAgent.ID); } else { agent.NewRecord(); }

  agent.Name = AGENT_NAME;
  agent.Description =
    'Knows the Board Game Night collection, players and scoring rules. Can record a play session on your ' +
    'behalf — the same write the Play Sessions form performs.';
  agent.TypeID = LOOP_TYPE_ID;
  agent.Status = 'Active';
  if ('IconClass' in agent) agent.IconClass = 'fa-solid fa-dice';

  // Skills are opt-in per agent, and BOTH of these are required — attaching an
  // 'MJ: AI Agent Skills' row on its own does nothing. The defaults are 'None' /
  // 'RequestedOnly', which is why an assigned skill was refused at run time with
  // "Game Night Scorekeeper doesn't accept skills".
  //
  // 'Limited' rather than Sage's 'All': this agent gets exactly the skills explicitly
  // assigned to it (today, Document Builder) instead of every Active skill in the
  // instance. A scorekeeper has no business auto-reaching for Communications or
  // Scheduling & Automation.
  //
  // 'Auto' lets the agent activate an assigned skill when it judges it relevant. It is
  // the second half of a double gate — the SKILL must also declare ActivationMode='Auto'
  // (Document Builder does). Left at 'RequestedOnly', the user would have to ask for the
  // skill by name every single time.
  agent.AcceptsSkills = 'Limited';
  agent.SkillActivationMode = 'Auto';
  await saveOrThrow(agent, 'Agent');
  console.log(`${priorAgent ? 'Updated' : 'Created'} agent '${AGENT_NAME}' (${agent.ID})`);

  // ---- 4. Grant the agent the action ---------------------------------------------------------
  const priorLink = await findOne('MJ: AI Agent Actions', `AgentID='${agent.ID}' AND ActionID='${action.ID}'`);
  const link = await md.GetEntityObject('MJ: AI Agent Actions', user);
  if (priorLink) { await link.Load(priorLink.ID); } else { link.NewRecord(); }
  link.AgentID = agent.ID;
  link.ActionID = action.ID;
  link.Status = 'Active';
  await saveOrThrow(link, 'AgentAction');
  console.log(`${priorLink ? 'Updated' : 'Created'} agent->action grant`);

  // ---- 5. The agent's system prompt ----------------------------------------------------------
  //
  // An MJ prompt is not a text column — it is a Template (+TemplateContent) that an AIPrompt points
  // at, linked to the agent through AIAgentPrompt. Four rows, in that order, because each references
  // the previous one.
  const PROMPT_NAME = `${AGENT_NAME} - Main Prompt`;
  const CHAT_PROMPT_TYPE_ID = 'A6DA423E-F36B-1410-8DAC-00021F8B792E';
  const TEXT_CONTENT_TYPE_ID = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E';

  // 5a. Template
  const priorTemplate = await findOne('MJ: Templates', `Name='${PROMPT_NAME}'`);
  const template = await md.GetEntityObject('MJ: Templates', user);
  if (priorTemplate) { await template.Load(priorTemplate.ID); } else { template.NewRecord(); }
  template.Name = PROMPT_NAME;
  template.Description = `System prompt for the ${AGENT_NAME} agent.`;
  template.UserID = user.ID;
  await saveOrThrow(template, 'Template');

  // 5b. Its content — the actual prompt text
  const priorContent = await findOne('MJ: Template Contents', `TemplateID='${template.ID}'`);
  const content = await md.GetEntityObject('MJ: Template Contents', user);
  if (priorContent) { await content.Load(priorContent.ID); } else { content.NewRecord(); }
  content.TemplateID = template.ID;
  content.TypeID = TEXT_CONTENT_TYPE_ID;
  content.TemplateText = AGENT_PROMPT;
  content.Priority = 1;
  await saveOrThrow(content, 'TemplateContent');

  // 5c. The prompt
  const priorPrompt = await findOne('MJ: AI Prompts', `Name='${PROMPT_NAME}'`);
  const prompt = await md.GetEntityObject('MJ: AI Prompts', user);
  if (priorPrompt) { await prompt.Load(priorPrompt.ID); } else { prompt.NewRecord(); }
  prompt.Name = PROMPT_NAME;
  prompt.Description = `Tells ${AGENT_NAME} what the data looks like and which session rules it must respect.`;
  prompt.TemplateID = template.ID;
  prompt.TypeID = CHAT_PROMPT_TYPE_ID;
  prompt.Status = 'Active';
  await saveOrThrow(prompt, 'AIPrompt');

  // 5d. Attach it to the agent
  const priorAgentPrompt = await findOne('MJ: AI Agent Prompts', `AgentID='${agent.ID}' AND PromptID='${prompt.ID}'`);
  const agentPrompt = await md.GetEntityObject('MJ: AI Agent Prompts', user);
  if (priorAgentPrompt) { await agentPrompt.Load(priorAgentPrompt.ID); } else { agentPrompt.NewRecord(); }
  agentPrompt.AgentID = agent.ID;
  agentPrompt.PromptID = prompt.ID;
  agentPrompt.ExecutionOrder = 1;
  agentPrompt.Status = 'Active';
  await saveOrThrow(agentPrompt, 'AIAgentPrompt');

  console.log(`${priorPrompt ? 'Updated' : 'Created'} prompt chain: Template -> TemplateContent -> AIPrompt -> AIAgentPrompt`);
  console.log(`  prompt text: ${AGENT_PROMPT.split('\n').length} lines, ${AGENT_PROMPT.length} chars`);

  await pool.close();
  process.exit(0);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
