# MemberJunction Cowork Plugin Strategy

## Overview

This document outlines a strategy for building [Claude Cowork Plugins](https://github.com/anthropics/knowledge-work-plugins) that extend MemberJunction's reach into the Cowork ecosystem. The plan covers three plugins:

1. **MJ Admin/Developer Plugin** — For MJ developers and administrators
2. **MJ Agent Builder Plugin** — Direct agent interaction through Cowork/MCP
3. **Association Management Plugin** — Standalone plugin for associations, extended by MJ

All plugins follow the standard Cowork plugin architecture: markdown skills, slash commands, MCP connectors, and sub-agents — no runtime code, no build steps.

```
plugin-name/
├── .claude-plugin/plugin.json   # Manifest
├── .mcp.json                    # MCP server connections
├── commands/                    # Slash commands (user-invoked)
└── skills/                      # Domain knowledge (auto-triggered)
```

---

## Plugin 1: MJ Admin/Developer Plugin

**Audience:** MJ developers, DBAs, system administrators
**MCP Dependency:** Requires a running MJ MCP Server instance

### Purpose

Turn Cowork into an MJ-aware development assistant. A developer working in Cowork can query entities, scaffold migrations, trigger codegen, and manage metadata — all through natural conversation backed by MJ's MCP server.

### Directory Structure

```
memberjunction-admin/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── commands/
│   ├── entity-lookup.md           # /mj:entity — Find and describe any entity
│   ├── run-query.md               # /mj:query — Run a view/query against any entity
│   ├── scaffold-migration.md      # /mj:migration — Generate a SQL migration file
│   ├── scaffold-action.md         # /mj:action — Scaffold and register a new Action
│   ├── entity-relationships.md    # /mj:relationships — Show FK/relationship graph for an entity
│   ├── codegen-status.md          # /mj:codegen — Check what CodeGen would generate
│   └── health-check.md            # /mj:health — Check MJ server status and connectivity
├── skills/
│   ├── entity-metadata-model.md   # How MJ's entity/metadata system works
│   ├── migration-patterns.md      # Migration best practices, naming, FK rules
│   ├── action-design.md           # Action philosophy: boundaries, thin actions, direct imports
│   ├── codegen-workflow.md        # What CodeGen generates, when it runs, how to use it
│   ├── naming-conventions.md      # PascalCase publics, entity naming, MJ: prefix rules
│   ├── runview-patterns.md        # RunView vs RunViews, ResultType, Fields optimization
│   ├── mcp-server-config.md       # How to configure MJ's MCP server (entity/agent/action tools)
│   └── monorepo-structure.md      # Package organization, build system, dependency rules
└── settings.local.json.example    # Template for user-specific config
```

### MCP Connector Configuration

```json
{
  "mcpServers": {
    "memberjunction": {
      "url": "${MJ_MCP_SERVER_URL:-http://localhost:3100}",
      "auth": {
        "type": "api-key",
        "key": "${MJ_API_KEY}"
      }
    }
  }
}
```

This connects to MJ's existing MCP server which already exposes:
- **Entity tools:** CRUD on any entity (GET, CREATE, UPDATE, DELETE)
- **View tools:** RunView for complex filtered queries
- **Action tools:** Execute any registered Action
- **Agent tools:** Discover, execute, monitor, and cancel agents

### Key Skills Detail

**`entity-metadata-model.md`** — Teaches Cowork how MJ's metadata system works: entities have fields, relationships, permissions, and generated TypeScript classes. When a user asks about "the user table" or "how contacts relate to companies," this skill gives Claude the mental model to ask the right MCP queries.

**`migration-patterns.md`** — Encodes the rules from CLAUDE.md: use `${flyway:defaultSchema}`, hardcoded UUIDs, never include `__mj_CreatedAt`/`__mj_UpdatedAt`, never create FK indexes (CodeGen handles both).

**`runview-patterns.md`** — When to use `entity_object` vs `simple`, when `Fields` is ignored, how to batch with `RunViews`, and the critical pattern of checking `result.Success` instead of try/catch.

### Key Commands Detail

**`/mj:entity`** — User provides an entity name or keyword. Claude uses the MCP `Discover_Entities` tool to find matching entities, then fetches field details. Returns a formatted summary with field types, relationships, and any value list constraints.

**`/mj:query`** — User describes what data they want in natural language. Claude translates to a RunView call via MCP, executes it, and presents results. Skill knowledge ensures proper filter syntax and field selection.

**`/mj:migration`** — User describes a schema change. Claude generates a properly formatted migration SQL file following all naming conventions, UUID rules, and CodeGen constraints from the skills.

---

## Plugin 2: MJ Agent Builder Plugin

**Audience:** Anyone building, testing, or managing MJ AI Agents
**MCP Dependency:** Requires a running MJ MCP Server instance with agent tools enabled

### Purpose

Expose MJ's full agent infrastructure through Cowork. Users can create agents, configure prompts, execute agents interactively, monitor running agents, and iterate on agent behavior — all through conversation. The key differentiator is **direct agent interaction**: Cowork becomes a front-end for MJ agents.

### Directory Structure

```
memberjunction-agents/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── commands/
│   ├── create-agent.md            # /mj-agent:create — Scaffold a new agent with type, prompts, actions
│   ├── run-agent.md               # /mj-agent:run — Execute an agent and stream results
│   ├── chat-with-agent.md         # /mj-agent:chat — Multi-turn conversation with a specific agent
│   ├── monitor.md                 # /mj-agent:monitor — Check status of running agents
│   ├── debug-run.md               # /mj-agent:debug — Analyze a failed agent run (steps, errors, tokens)
│   ├── tune-prompt.md             # /mj-agent:tune — Iterate on an agent's prompts with A/B testing
│   ├── list-agents.md             # /mj-agent:list — Browse available agents with descriptions
│   └── agent-analytics.md         # /mj-agent:analytics — Usage stats, success rates, cost analysis
├── skills/
│   ├── agent-architecture.md      # MJ agent types, runner, context system, memory management
│   ├── prompt-engineering.md      # Best practices for MJ AI prompts, roles, positions
│   ├── action-integration.md      # How agents discover and use Actions
│   ├── agent-entity-model.md      # AI Agents, Agent Types, Agent Runs, Agent Run Steps entities
│   ├── conversation-model.md      # How MJ conversations work, artifacts, multi-turn patterns
│   ├── model-selection.md         # AI Models, vendors, cost considerations, capability matching
│   └── debugging-patterns.md      # Common failure modes, token limits, timeout issues
└── settings.local.json.example
```

### Direct Agent Interaction via MCP

MJ's MCP server already exposes these agent tools:

| MCP Tool | Purpose |
|----------|---------|
| `Discover_Agents` | List available agents with descriptions |
| `Run_Agent` | Execute any agent by name/ID with a user message |
| `Execute_[AgentName]_Agent` | Named tool for each configured agent |
| `Agent_Run_Status` | Check status of a running agent |
| `Cancel_Agent_Run` | Cancel a running agent |
| `Get_Agent_Run_Details` | Full diagnostic info for a completed run |
| `Get_Agent_Run_Step_Details` | Step-by-step execution trace |

### Key Interaction Patterns

**Pattern 1: Direct Agent Execution**

User says: "Ask the Research Agent to find recent papers on transformer architectures"

Cowork uses `/mj-agent:run` which calls `Run_Agent` via MCP → MJ server runs the agent → results stream back to Cowork → user sees the agent's output directly in their conversation.

**Pattern 2: Agent Builder Workflow**

The `/mj-agent:create` command walks through:
1. Choose or define an agent type
2. Configure system/user prompts (using the prompt engineering skill)
3. Select which Actions the agent can access
4. Choose AI model(s) and parameters
5. Create the agent entity via MCP entity CRUD tools
6. Test it immediately with `/mj-agent:run`

**Pattern 3: Prompt Iteration Loop**

The `/mj-agent:tune` command:
1. Run the agent with a test input, capture the output
2. User provides feedback on the output
3. Claude suggests prompt modifications (informed by `prompt-engineering.md` skill)
4. Update the prompt via MCP entity update
5. Re-run, compare results
6. Repeat until satisfied

**Pattern 4: Multi-Turn Agent Chat**

The `/mj-agent:chat` command:
1. Start or resume a conversation with a specific agent
2. Each user message is sent to the agent via `Run_Agent` with a conversation ID
3. Agent responses are displayed inline
4. Conversation history is maintained server-side by MJ
5. User can switch between agents mid-conversation

### MCP Server Enhancements Needed

To fully support the Agent Builder plugin, the MCP server would benefit from:

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| `List_Agent_Types` tool | High | Return available agent types with their configurations |
| `Get_Agent_Prompts` tool | High | Return prompts for a specific agent |
| `Update_Agent_Prompt` tool | High | Modify an agent's prompt text |
| `Get_Agent_Run_History` tool | Medium | Recent runs for an agent with success/fail/cost summary |
| `Clone_Agent` tool | Medium | Duplicate an agent for A/B prompt testing |
| Streaming agent output | Low | SSE stream of agent execution for real-time feedback |

Some of these can be accomplished through the existing entity CRUD tools (querying `MJ: AI Agent Prompts`, updating prompt text, etc.), but dedicated higher-level tools would provide a better Cowork UX.

---

## Plugin 3: Association Management Plugin

**Audience:** Association staff, executive directors, committee chairs, membership managers
**MCP Dependency:** None required (standalone). MJ extends capabilities significantly.

### Vision

A **free, open-source Cowork plugin** published by the MJ team that helps anyone working in the association/membership organization space. It works entirely standalone using Claude's built-in capabilities (web search, document analysis, writing). When connected to MemberJunction, it unlocks direct data access, automated workflows, and agent-powered member services.

This positions MJ as a thought leader in the association tech space and creates a natural on-ramp to the full platform.

### The Association Domain

Associations — trade associations, professional societies, chambers of commerce, standards bodies, alumni organizations — share a remarkably consistent set of business functions regardless of size or industry focus:

| Function | Description | Pain Points |
|----------|-------------|-------------|
| **Membership** | Recruitment, onboarding, renewals, engagement, retention | Lapsed member recovery, engagement measurement, value articulation |
| **Events** | Conferences, webinars, chapter meetings, workshops | Speaker management, sponsor ROI, CE credit tracking, hybrid logistics |
| **Governance** | Board management, committees, bylaws, elections | Meeting prep burden, policy consistency, volunteer coordination |
| **Communications** | Newsletters, announcements, social media, press | Content volume, personalization, multi-channel coordination |
| **Advocacy** | Legislative tracking, position papers, action alerts, lobbying | Rapid response to legislation, member mobilization, coalition building |
| **Education** | Certifications, CE/CPE programs, mentorship, career services | Program design, credit tracking, accreditation compliance |
| **Revenue** | Dues, sponsorships, grants, advertising, partnerships | Non-dues revenue growth, sponsor retention, grant compliance |
| **Content** | Research reports, standards, white papers, best practices | Volume, timeliness, member-relevance |
| **Chapters** | Local/regional affiliates, national alignment | Inconsistent quality, reporting, communication gaps |
| **Awards** | Recognition programs, nominations, selection | Fair processes, promotional materials, ceremony logistics |

### Directory Structure

```
association-management/
├── .claude-plugin/
│   └── plugin.json
├── .mcp.json
├── commands/
│   ├── member-welcome.md          # /assoc:welcome — Create onboarding package for new members
│   ├── board-prep.md              # /assoc:board-prep — Generate board meeting agenda + briefing packet
│   ├── draft-newsletter.md        # /assoc:newsletter — Draft member newsletter with sections
│   ├── event-plan.md              # /assoc:event-plan — Plan event from concept to logistics checklist
│   ├── advocacy-brief.md          # /assoc:advocacy — Draft position paper or action alert
│   ├── grant-proposal.md          # /assoc:grant — Write a grant proposal
│   ├── sponsor-pitch.md           # /assoc:sponsor — Create sponsorship package/prospectus
│   ├── retention-campaign.md      # /assoc:retention — Design lapsed member win-back campaign
│   ├── annual-report.md           # /assoc:annual-report — Draft annual report content
│   ├── committee-charter.md       # /assoc:committee — Draft committee charter and work plan
│   ├── bylaws-review.md           # /assoc:bylaws — Review or draft bylaws amendments
│   ├── strategic-plan.md          # /assoc:strategic-plan — Facilitate strategic planning process
│   ├── ce-program.md              # /assoc:ce-program — Design continuing education program
│   ├── member-survey.md           # /assoc:survey — Design and analyze member surveys
│   ├── rfp-response.md            # /assoc:rfp — Draft RFP/RFI responses
│   └── crisis-comm.md             # /assoc:crisis — Draft crisis communications
├── skills/
│   ├── association-fundamentals.md
│   ├── membership-lifecycle.md
│   ├── event-management.md
│   ├── governance-best-practices.md
│   ├── association-communications.md
│   ├── advocacy-campaigns.md
│   ├── education-certification.md
│   ├── revenue-diversification.md
│   ├── chapter-management.md
│   ├── volunteer-engagement.md
│   ├── dei-inclusion.md
│   └── association-metrics.md
└── settings.local.json.example
```

### Standalone Skills (No MJ Required)

These skills encode deep domain knowledge that makes Claude immediately useful for association work without any external tools.

#### `association-fundamentals.md`

Core knowledge about how associations operate:
- Distinction between 501(c)(3), (c)(6), and (c)(4) organizations and their tax/lobbying implications
- Membership models: individual, organizational, tiered, freemium, hybrid
- Revenue mix benchmarks (dues typically 30-45% of revenue for trade associations)
- ASAE (American Society of Association Executives) benchmarks and standards
- Common org structures: board → committees → staff → chapters
- Fiscal year planning cycles and seasonal rhythms (renewal season, conference season, budget season, legislative session)

#### `membership-lifecycle.md`

Best practices across the full member journey:
- **Recruitment:** Value proposition frameworks, segmented messaging by prospect type (corporate vs. individual, early-career vs. senior), referral programs, trial membership models
- **Onboarding:** First 90-day engagement plans, welcome series email cadences, buddy/mentor matching, quick-win resource guides
- **Engagement:** Engagement scoring models (event attendance, committee participation, content consumption, advocacy participation), escalation triggers, personalization strategies
- **Renewal:** Multi-touch renewal campaigns, lapsed member segmentation (1-year, 2-year, 3+ year), win-back messaging frameworks, exit survey design
- **Retention:** Early warning indicators, high-value member identification, ROI calculators members can use to justify dues to their employer

#### `event-management.md`

Conference and event planning expertise:
- Timeline templates (12-month, 6-month, 90-day pre-event)
- Budget frameworks with typical line items and percentage allocations
- Speaker recruitment, management, and content curation
- Exhibitor/sponsor tier structures and fulfillment checklists
- Hybrid event technology considerations
- CE/CPE credit submission processes for major credentialing bodies
- Post-event analysis: NPS, session ratings, sponsor satisfaction, financial reconciliation
- RFP templates for venues, AV, catering, registration platforms

#### `governance-best-practices.md`

Board and committee management:
- Robert's Rules of Order essentials for association contexts
- Board meeting agenda templates (consent agenda pattern, committee reports, strategic discussion, action items)
- Board orientation packet contents
- Fiduciary duties: duty of care, duty of loyalty, duty of obedience
- Committee types: standing, ad hoc, task force, advisory
- Committee charter templates with scope, deliverables, timeline, authority
- Board self-assessment frameworks
- Succession planning for officers and committee chairs
- Conflict of interest policies
- Executive session protocols

#### `association-communications.md`

Multi-channel communication strategies:
- Newsletter content frameworks: industry news, member spotlight, event preview, advocacy update, education highlight
- Email cadence management to avoid fatigue
- Social media content calendars for association context (LinkedIn-heavy, event-driven)
- Press release templates for association announcements
- Crisis communication playbooks
- Member segmentation for targeted messaging
- Annual report content architecture

#### `advocacy-campaigns.md`

Government affairs and advocacy:
- Legislative tracking methodology and alert triggers
- Position paper structure: issue summary, background, association position, impact analysis, call to action
- Grassroots campaign design: action alert templates, key message development, constituent story collection
- Fly-in/lobby day planning and preparation
- Coalition building strategies
- PAC management basics (where legally permitted)
- Regulatory comment drafting (federal register responses)
- State-level vs. federal advocacy considerations

#### `education-certification.md`

Professional development programs:
- Continuing education program design (needs assessment, content development, delivery, evaluation)
- CE/CPE/CEU credit frameworks for common credentialing bodies
- Certification program development: job task analysis, exam design, maintenance requirements
- Learning management system evaluation criteria
- Micro-credentialing and digital badge strategies
- Mentorship program structures: 1-to-1, group, reverse, peer
- Competency framework development

#### `revenue-diversification.md`

Non-dues revenue strategy:
- Sponsorship package design: tiered structures, digital vs. in-person, year-round vs. event-specific
- Grant writing fundamentals for association context
- Affinity program partnerships (insurance, travel, office supplies)
- Content licensing and publication revenue
- Advertising rate card development
- Consulting/advisory service offerings
- Foundation/charitable arm structure
- Corporate partnership models beyond traditional sponsorship

#### `chapter-management.md`

Local/regional affiliate coordination:
- Chapter health metrics and scorecards
- National-to-local communication frameworks
- Chapter leader training programs
- Resource sharing models (templates, content, speakers)
- Chapter financial reporting and compliance
- Geographic territory design
- Virtual chapter models for dispersed members

#### `volunteer-engagement.md`

Volunteer management for association context:
- Volunteer recruitment targeting and interest matching
- Role descriptions and time commitment expectations
- Recognition and appreciation programs
- Volunteer-to-leader pipeline development
- Burnout prevention and term limits
- Virtual volunteering opportunities
- Skills-based volunteering alignment

#### `dei-inclusion.md`

Diversity, equity, and inclusion in associations:
- Inclusive governance: board composition analysis, pipeline diversification
- Accessible event planning: physical, digital, financial accessibility
- Inclusive communications: language, imagery, representation
- Scholarship and mentorship programs for underrepresented groups
- Supplier diversity in association procurement
- DEI metrics and reporting frameworks

#### `association-metrics.md`

KPIs and benchmarking:
- Membership metrics: retention rate, acquisition rate, lifetime value, engagement score
- Event metrics: attendance, NPS, revenue per attendee, sponsor retention
- Financial metrics: dues-to-total revenue ratio, reserves ratio, cost per member
- Communication metrics: open rates, click rates, unsubscribe benchmarks
- Advocacy metrics: action alert response rates, legislative wins
- Education metrics: completion rates, satisfaction scores, credential holders
- ASAE benchmarks for comparison by organization size and type

### Standalone Commands Detail

#### `/assoc:board-prep`

Generates a complete board meeting preparation package:

1. Asks for: meeting date, key agenda topics, any special business (votes, elections, budget approval)
2. Produces:
   - Formal agenda following consent agenda pattern
   - Executive director's report template
   - Financial summary template with key metrics to populate
   - Committee report request template (to send to chairs)
   - Strategic discussion framing for each agenda topic
   - Draft motions for any action items
   - Board book table of contents
3. Follows Robert's Rules formatting where applicable
4. Includes time allocations based on meeting duration

#### `/assoc:newsletter`

Drafts a member newsletter:

1. Asks for: organization name, industry/profession, key topics, any upcoming events, recent wins
2. Produces:
   - Subject line options (A/B test variants)
   - President/chair message (brief, personal tone)
   - Industry news roundup (uses web search for current news)
   - Upcoming events section with CTAs
   - Member spotlight template
   - Advocacy update section
   - Education/professional development highlight
   - Closing with engagement CTA
3. Adapts tone for the organization's audience

#### `/assoc:advocacy`

Creates advocacy materials:

1. Asks for: issue, position, target audience (members, legislators, public), urgency level
2. Produces (based on type selected):
   - **Position Paper:** Background, analysis, position statement, impact assessment, recommendations
   - **Action Alert:** Issue summary, why it matters, what members should do, script/talking points, contact information
   - **Legislative Summary:** Bill overview, status, impact on members, association position, timeline
   - **Regulatory Comment:** Introduction, specific responses to proposed rule sections, data/evidence, recommendations
3. Uses web search to pull current legislative/regulatory context

#### `/assoc:retention`

Designs a lapsed member win-back campaign:

1. Asks for: organization name, typical member profile, known reasons for lapsing, budget constraints
2. Produces:
   - Segmentation strategy (lapse duration, member type, engagement history)
   - Multi-touch campaign timeline (email, phone, mail, peer outreach)
   - Email templates for each touch (5-7 messages over 90 days)
   - Phone script for personal outreach
   - Special offer structures (reduced dues, trial period, event discount)
   - Win-back survey to understand departure reasons
   - Success metrics and tracking plan
   - ROI calculation framework

#### `/assoc:event-plan`

Plans an event from concept to execution:

1. Asks for: event type, size, budget range, virtual/hybrid/in-person, timeline
2. Produces:
   - Event concept and goals document
   - Master timeline with milestones
   - Budget template with line items
   - Venue/platform RFP template
   - Speaker recruitment outreach template
   - Sponsor prospectus outline
   - Registration pricing strategy
   - Marketing/promotion plan
   - Day-of logistics checklist
   - Post-event evaluation plan

#### `/assoc:strategic-plan`

Facilitates strategic planning:

1. Asks for: organization name, current strategic priorities, planning horizon, stakeholder groups
2. Produces:
   - Environmental scan framework (PESTLE adapted for associations)
   - SWOT analysis template with association-specific prompts
   - Member needs assessment survey draft
   - Stakeholder interview guide
   - Strategic pillar framework with goals, objectives, tactics, metrics
   - Implementation timeline template
   - Board presentation outline for plan approval
   - Communication plan for rolling out strategy to members

### MJ-Extended Capabilities

When the user connects MemberJunction via `.mcp.json`, the plugin gains superpowers:

#### Tier 1: Data Access (Entity CRUD + RunView via MCP)

| Capability | Standalone | With MJ |
|------------|-----------|---------|
| Member directory lookup | Manual input | Query Members entity directly |
| Engagement scoring | Provide framework | Calculate from actual activity data |
| Event attendance | Manual upload | Query Event Registration entities |
| Dues status check | Manual input | Query Membership/Payment entities |
| Committee rosters | Manual input | Query Committee Member entities |
| Communication history | Not available | Query Communication Log entities |
| Renewal forecasting | Template-based | Data-driven from actual renewal patterns |

#### Tier 2: Automated Workflows (Actions via MCP)

| Workflow | How It Works |
|----------|-------------|
| Send renewal reminders | MJ Action: draft personalized email → Communication engine sends |
| Generate engagement reports | MJ RunView: pull activity data → aggregate → format report |
| Update member records | MJ Entity CRUD: update contact info, preferences, tags |
| Log board decisions | MJ Entity CRUD: create records in Decisions/Minutes entities |
| Schedule follow-ups | MJ Action: create scheduled tasks for staff |

#### Tier 3: Agent-Powered Services (Agent Execution via MCP)

| Agent | Purpose |
|-------|---------|
| Member Concierge Agent | Answer member questions about benefits, events, resources |
| Engagement Analyst Agent | Analyze member engagement patterns, identify at-risk members |
| Content Curator Agent | Find and summarize industry news relevant to the association |
| Event Recommender Agent | Suggest events/sessions to members based on interests and history |
| Advocacy Monitor Agent | Track legislation and flag relevant bills with impact summaries |

### MCP Configuration (MJ-Extended Mode)

```json
{
  "mcpServers": {
    "memberjunction": {
      "url": "${MJ_MCP_SERVER_URL:-http://localhost:3100}",
      "auth": {
        "type": "api-key",
        "key": "${MJ_API_KEY}"
      }
    }
  }
}
```

When MJ is not connected, the `.mcp.json` can optionally wire to other common association tools:

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-slack"]
    },
    "google-calendar": {
      "command": "npx",
      "args": ["-y", "@anthropic/mcp-google-calendar"]
    }
  }
}
```

### Settings Template

```json
{
  "organization": {
    "name": "Your Association Name",
    "type": "trade_association | professional_society | chamber | standards_body | alumni | other",
    "industry": "e.g., Healthcare, Technology, Manufacturing, Legal",
    "memberCount": 5000,
    "staffCount": 12,
    "annualBudget": 2000000,
    "fiscalYearStart": "January"
  },
  "membership": {
    "types": ["Individual", "Corporate", "Student", "Retired"],
    "duesRange": { "min": 75, "max": 2500 },
    "renewalMonth": "January",
    "retentionRate": 0.85
  },
  "events": {
    "annualConference": {
      "name": "Annual Meeting & Expo",
      "typicalAttendance": 1200,
      "month": "September"
    },
    "recurringEvents": ["Monthly Webinars", "Quarterly Chapter Meetings", "Leadership Summit"]
  },
  "governance": {
    "boardSize": 15,
    "meetingFrequency": "quarterly",
    "committees": ["Membership", "Education", "Government Affairs", "Finance", "Nominating"]
  },
  "advocacy": {
    "focus": ["Federal regulation", "State licensing", "Industry standards"],
    "hasLobbyist": true,
    "hasPAC": false
  },
  "technology": {
    "ams": "iMIS | Nimble AMS | Aptify | MemberSuite | GrowthZone | Wild Apricot | MemberJunction | Other",
    "emailPlatform": "Mailchimp | Constant Contact | HubSpot | Other",
    "lms": "TopClass | Path LMS | Elevate | Other | None"
  }
}
```

---

## Implementation Roadmap

### Phase 1: Association Plugin (Standalone)

**Goal:** Ship a free, high-quality association plugin that works without MJ.
**Effort:** Content authoring only — markdown skills and command files.

| Step | Description |
|------|-------------|
| 1a | Create repo structure: `memberjunction/cowork-plugins` |
| 1b | Write all 12 skills files with deep association domain knowledge |
| 1c | Write all 16 command files with structured workflows |
| 1d | Create `plugin.json` manifest and `settings.local.json.example` |
| 1e | Write README with installation instructions and customization guide |
| 1f | Test with real association scenarios (draft newsletter, plan event, etc.) |
| 1g | Submit to Anthropic plugin marketplace |

### Phase 2: MJ Admin Plugin

**Goal:** MJ developers can manage their instance through Cowork.
**Effort:** Markdown content + validate against existing MCP tools.

| Step | Description |
|------|-------------|
| 2a | Write skills files distilled from CLAUDE.md and guides |
| 2b | Write command files that map to existing MCP entity/action/agent tools |
| 2c | Test each command against a live MJ MCP server |
| 2d | Document required MCP server configuration |

### Phase 3: Agent Builder Plugin

**Goal:** Non-developers can create and manage MJ agents through Cowork.
**Effort:** Markdown content + potential MCP server enhancements.

| Step | Description |
|------|-------------|
| 3a | Write skills covering agent architecture and prompt engineering |
| 3b | Write commands for the create → test → iterate workflow |
| 3c | Evaluate if existing MCP tools suffice or need enhancements |
| 3d | If needed: add `List_Agent_Types`, `Get_Agent_Prompts`, `Update_Agent_Prompt` to MCP server |
| 3e | Test the full agent creation and tuning workflow end-to-end |

### Phase 4: Association Plugin + MJ Integration

**Goal:** Association plugin detects MJ and unlocks extended capabilities.
**Effort:** Additional skills/commands + potential MCP server tools for association-specific entities.

| Step | Description |
|------|-------------|
| 4a | Add MJ-aware skills that describe association entities (Members, Events, Committees, etc.) |
| 4b | Add MJ-specific commands: `/assoc:member-lookup`, `/assoc:engagement-report`, etc. |
| 4c | Build association-focused MJ Agents (Member Concierge, Engagement Analyst, etc.) |
| 4d | Create metadata for association-specific entities if not already present in MJ |
| 4e | Test full MJ-integrated workflow: Cowork → MCP → MJ → member data → back to user |

### Phase 5: Enterprise Plugin Catalog

**Goal:** MJ customers can have org-specific plugins pre-installed for their staff.
**Timing:** After Anthropic ships org-wide plugin catalog support.

| Step | Description |
|------|-------------|
| 5a | Build tooling for MJ admins to generate org-specific plugin configs |
| 5b | Auto-generate settings.local.json from MJ instance metadata |
| 5c | Custom skills populated from org's actual entity model and business rules |
| 5d | Distribution via Anthropic's enterprise plugin catalog |

---

## Strategic Value

### For MJ

- **Lead generation:** Free association plugin introduces MJ to the association market
- **Developer ecosystem:** Admin/Agent plugins make MJ developers more productive
- **Platform stickiness:** Cowork becomes another client for MJ's MCP server
- **Market positioning:** First association-focused Cowork plugin establishes thought leadership

### For Association Users

- **Immediate value:** Standalone plugin works day one, no infrastructure needed
- **Upgrade path:** MJ integration unlocks progressively more capability
- **Domain expertise:** Skills encode decades of association management best practices
- **Time savings:** Common tasks (newsletters, board prep, event planning) go from hours to minutes

### For the Cowork Ecosystem

- **Vertical plugin model:** Demonstrates how to build industry-specific plugins
- **MCP integration pattern:** Shows how a platform (MJ) can extend Cowork through MCP
- **Tiered value:** Standalone → integrated is a pattern other platforms can follow
