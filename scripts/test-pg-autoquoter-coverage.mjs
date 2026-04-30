/**
 * Step 8: API-level autoQuoter coverage test.
 *
 * Hits MJAPI with a battery of GraphQL queries that exercise the SQL paths
 * autoQuoter is meant to protect: PascalCase column references in
 * Conversations, AI Agent Runs, and Dashboards. We watch for non-Success
 * results and print any error messages so the orchestrator can correlate
 * with /tmp/mjapi.log SQL errors.
 *
 * Usage: node scripts/test-pg-autoquoter-coverage.mjs
 */

const ENDPOINT = process.env.MJ_API_ENDPOINT ?? 'http://localhost:4001/';
const API_KEY = process.env.MJ_API_KEY;

if (!API_KEY) {
  console.error('MJ_API_KEY env var is required (use the value from your MJAPI .env).');
  process.exit(1);
}

async function gql(query, label) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-mj-api-key': API_KEY },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  return { label, status: res.status, body: json };
}

function fmt(result) {
  const { label, status, body } = result;
  if (body.errors?.length) {
    return `[GRAPHQL-ERROR] ${label}: ${body.errors.map((e) => e.message).join(' | ')}`;
  }
  const data = body.data;
  if (!data) return `[NO-DATA] ${label}: status=${status}`;
  // Find the first key that has Success/ErrorMessage shape
  const top = Object.values(data)[0];
  if (top && typeof top === 'object' && 'Success' in top) {
    if (!top.Success) {
      return `[VIEW-FAIL] ${label}: ${top.ErrorMessage} (rows=${top.TotalRowCount ?? 0})`;
    }
    return `[OK] ${label}: rows=${top.TotalRowCount ?? top.Results?.length ?? 0}`;
  }
  return `[OK-SCALAR] ${label}: ${JSON.stringify(top).slice(0, 80)}`;
}

const QUERIES = [
  // ── Conversations area ───────────────────────────────────────────────
  {
    label: 'Conversations: list (basic)',
    q: `query { RunMJConversationDynamicView(input: { EntityName: "MJ: Conversations", OrderBy: "Name DESC" }) { Success ErrorMessage TotalRowCount Results { ID Name Description Status UserID } } }`,
  },
  {
    label: 'Conversations: filter by IsArchived',
    q: `query { RunMJConversationDynamicView(input: { EntityName: "MJ: Conversations", ExtraFilter: "IsArchived = false", OrderBy: "__mj_UpdatedAt DESC" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'ConversationDetails: filter by ConversationID',
    q: `query { RunMJConversationDetailDynamicView(input: { EntityName: "MJ: Conversation Details", ExtraFilter: "Role = 'User'", OrderBy: "__mj_CreatedAt ASC" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'ConversationArtifacts: list',
    q: `query { RunMJConversationArtifactDynamicView(input: { EntityName: "MJ: Conversation Artifacts", OrderBy: "Name ASC" }) { Success ErrorMessage TotalRowCount } }`,
  },
  // ── AI Agent Runs area ───────────────────────────────────────────────
  {
    label: 'AI Agent Runs: list',
    q: `query { RunMJAIAgentRunDynamicView(input: { EntityName: "MJ: AI Agent Runs", OrderBy: "StartedAt DESC" }) { Success ErrorMessage TotalRowCount Results { ID Status TotalCost TotalTokensUsed } } }`,
  },
  {
    label: 'AI Agent Runs: filter by Status',
    q: `query { RunMJAIAgentRunDynamicView(input: { EntityName: "MJ: AI Agent Runs", ExtraFilter: "Status = 'Complete'" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'AI Agent Run Steps: list ordered by StepNumber',
    q: `query { RunMJAIAgentRunStepDynamicView(input: { EntityName: "MJ: AI Agent Run Steps", OrderBy: "StepNumber ASC" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'AI Prompt Runs: list',
    q: `query { RunMJAIPromptRunDynamicView(input: { EntityName: "MJ: AI Prompt Runs", OrderBy: "RunAt DESC" }) { Success ErrorMessage TotalRowCount Results { ID TokensUsed TotalCost } } }`,
  },
  {
    label: 'AI Prompt Runs: filter by ModelID present',
    q: `query { RunMJAIPromptRunDynamicView(input: { EntityName: "MJ: AI Prompt Runs", ExtraFilter: "ModelID IS NOT NULL", OrderBy: "TotalCost DESC" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'AI Agents: list',
    q: `query { RunMJAIAgentDynamicView(input: { EntityName: "MJ: AI Agents", OrderBy: "Name ASC" }) { Success ErrorMessage TotalRowCount Results { ID Name TypeID } } }`,
  },
  {
    label: 'AI Agent Prompts: filter by ConfigurationID null',
    q: `query { RunMJAIAgentPromptDynamicView(input: { EntityName: "MJ: AI Agent Prompts", ExtraFilter: "ConfigurationID IS NULL" }) { Success ErrorMessage TotalRowCount } }`,
  },
  // ── Dashboards area ──────────────────────────────────────────────────
  {
    label: 'Dashboards: list',
    q: `query { RunMJDashboardDynamicView(input: { EntityName: "Dashboards", OrderBy: "Name ASC" }) { Success ErrorMessage TotalRowCount Results { ID Name UIConfigDetails CategoryID } } }`,
  },
  {
    label: 'Dashboard Categories: list',
    q: `query { RunMJDashboardCategoryDynamicView(input: { EntityName: "MJ: Dashboard Categories", OrderBy: "Name ASC" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'Dashboard User Preferences: list',
    q: `query { RunMJDashboardUserPreferenceDynamicView(input: { EntityName: "MJ: Dashboard User Preferences" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'Dashboard User States: list',
    q: `query { RunMJDashboardUserStateDynamicView(input: { EntityName: "MJ: Dashboard User States" }) { Success ErrorMessage TotalRowCount } }`,
  },
  // ── Metadata views (heavy autoQuoter targets) ────────────────────────
  {
    label: 'Entities: list with PascalCase fields',
    q: `query { RunMJEntityDynamicView(input: { EntityName: "Entities", OrderBy: "DisplayName ASC", ExtraFilter: "IncludeInAPI = true" }) { Success ErrorMessage TotalRowCount Results { ID Name BaseTable BaseView SchemaName IncludeInAPI AllowAllRowsAPI } } }`,
  },
  {
    label: 'Entity Fields: filter by AllowUpdateAPI',
    q: `query { RunMJEntityFieldDynamicView(input: { EntityName: "Entity Fields", ExtraFilter: "AllowUpdateAPI = true", OrderBy: "Sequence ASC" }) { Success ErrorMessage TotalRowCount } }`,
  },
  {
    label: 'Entity Permissions: list',
    q: `query { RunMJEntityPermissionDynamicView(input: { EntityName: "Entity Permissions", OrderBy: "RoleName ASC" }) { Success ErrorMessage TotalRowCount Results { ID RoleName CanRead CanCreate CanUpdate CanDelete } } }`,
  },
  // ── Single-record fetch (uses hand-written SQL with QuoteIdentifier) ──
  {
    label: 'Single User by ID',
    q: `query { MJUser(ID: "ecafccec-6a37-ef11-86d4-000d3a4e707e") { ID Name Email Type IsActive } }`,
  },
];

async function main() {
  console.log(`\n=== Step 8: autoQuoter coverage test (${QUERIES.length} queries) ===\n`);
  const results = [];
  for (const { label, q } of QUERIES) {
    try {
      const r = await gql(q, label);
      results.push(r);
      console.log(fmt(r));
    } catch (err) {
      console.log(`[NETWORK-FAIL] ${label}: ${err.message}`);
      results.push({ label, status: 0, body: { errors: [{ message: err.message }] } });
    }
  }
  // Summary
  const failures = results.filter((r) => {
    if (r.body.errors?.length) return true;
    const top = Object.values(r.body.data ?? {})[0];
    return top && typeof top === 'object' && 'Success' in top && !top.Success;
  });
  console.log(`\n=== Summary ===`);
  console.log(`Total queries: ${results.length}`);
  console.log(`Failures: ${failures.length}`);
  if (failures.length) {
    console.log(`\nFailure detail:`);
    for (const f of failures) console.log(`  - ${fmt(f)}`);
    process.exit(1);
  }
  console.log(`All queries passed ✓`);
}

main().catch((e) => {
  console.error('Test runner crashed:', e);
  process.exit(2);
});
