# MJ Explorer Full-Stack Regression Testing Plan

**Status**: Draft for Team Review
**Created**: 2026-03-27
**Target**: Automated regression suite for each candidate release

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Infrastructure & Pipeline](#3-infrastructure--pipeline)
4. [Test Definitions](#4-test-definitions)
5. [Implementation Phases](#5-implementation-phases)
6. [Cost & Performance Estimates](#6-cost--performance-estimates)
7. [CI/CD Integration](#7-cicd-integration)
8. [Open Questions](#8-open-questions)

---
## 1. Executive Summary

### Goal
Automated end-to-end regression testing of MJ Explorer using the existing MJ Testing Framework + Computer Use engine. Tests run headless Chromium inside Docker, driven by LLM-based browser automation, and validate results via the oracle system. Every candidate release off `next` gets a full regression pass before promotion.

### What Already Exists
- **Testing Framework** (EngineBase, Engine, CLI) — driver/oracle pattern, variable resolution, result persistence to DB entities (TestRun, TestSuiteRun, TestRunOutput)
- **ComputerUseTestDriver** — registered driver that runs headless Chromium via MJComputerUseEngine, 3 built-in oracles (goal-completion, url-match, step-count) plus global oracles (llm-judge, schema-validate, exact-match, trace-validate, sql-validate)
- **Docker test pipeline skeleton** — `docker-compose.test.yml` with sqlserver → mjapi → mjexplorer → playwright services, plus Dockerfiles for each
- **Docker workbench** — full dev environment with db-bootstrap.sh, auth-setup.sh, Flyway migrations, CodeGen
- **AssociationDB** — comprehensive demo database (58 tables, 10K+ records, install scripts)
- **Auth0 automated login** — TEST_UID/TEST_PWD env vars, FormLogin strategy in ComputerUse auth

### What We Need to Build
1. **Regression pipeline orchestration** — wire the existing pieces together with proper startup sequencing
2. **~25 Computer Use test definitions** — metadata records organized in a regression suite
3. **Pipeline hardening** — Dockerfiles that actually run migrations, CodeGen, AssociationDB install
4. **Result collection & reporting** — capture test results, screenshots, and generate human-readable reports
5. **Regression comparison** — implement the compare command for run-over-run analysis
6. **GitHub Actions workflow** — trigger on release candidates, post results to PR

### Cost Per Run
Estimated $10–40 per full suite run (25 tests × ~15 steps each × LLM cost per step). Acceptable for release-gating.

---
## 2. Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Compose Test Stack                     │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐   ┌───────────┐ │
│  │ SQL      │    │ MJAPI    │    │ MJ       │   │ Test      │ │
│  │ Server   │◄───│ Server   │◄───│ Explorer │◄──│ Runner    │ │
│  │          │    │          │    │ (Angular)│   │ (Chromium)│ │
│  │ - MJ DB  │    │ - GraphQL│    │ - UI     │   │ - Tests   │ │
│  │ - Assoc  │    │ - Auth   │    │ - Auth0  │   │ - Oracles │ │
│  │   DB     │    │ - API    │    │          │   │ - Reports │ │
│  └──────────┘    └──────────┘    └──────────┘   └───────────┘ │
│       :1433           :4000          :4200                      │
└─────────────────────────────────────────────────────────────────┘
         ▲                                              │
         │              Results persisted to             │
         └──────────── TestRun / TestSuiteRun ──────────┘
                       TestRunOutput (screenshots)
```

### Startup Sequence

```
Phase 1: Database Setup
  1. Start SQL Server container (wait for healthcheck)
  2. Create MemberJunction_Test database
  3. Run Flyway migrations (full MJ schema)
  4. Install AssociationDB demo data into same database
  5. Run CodeGen (generates entity classes, views, stored procs)

Phase 2: Application Servers
  6. Start MJAPI (connects to MJ_Test DB, runs health endpoint)
  7. Start MJExplorer (connects to MJAPI GraphQL, serves Angular app)
  8. Wait for both healthchecks to pass

Phase 3: Test Execution
  9.  Seed test metadata (TestTypes, Tests, TestSuites) if not present
  10. Run regression suite: mj test suite --name="MJ Explorer Regression"
  11. Each test: launch headless Chromium → login → execute workflow → evaluate oracles
  12. Persist results to TestRun/TestSuiteRun entities in the same database

Phase 4: Reporting
  13. Export results to JSON/Markdown
  14. Generate comparison with previous run (if exists)
  15. Upload artifacts (screenshots, report)
  16. Post summary to GitHub PR (if triggered from PR)
```

### Key Design Decisions

**1. Single Database for Everything**
The MJ schema, AssociationDB demo data, and test results all live in the same SQL Server database. This mirrors production topology and lets the test runner persist results via the standard MJ entity system (TestRun, TestRunOutput entities).

**2. Fresh Database Per Run**
Each regression run starts with a fresh database (tmpfs for speed). This ensures:
- No leftover state from previous runs
- Write-tests don't need cleanup logic
- Deterministic starting conditions
- AssociationDB always at known baseline

**3. ComputerUseTestDriver as the Test Driver**
We use the existing Computer Use engine rather than raw Playwright scripts because:
- It already integrates with the Testing Framework's oracle/scoring system
- It captures screenshots at every step (built-in visual audit trail)
- It handles Auth0 login via FormLogin strategy
- Results persist to TestRun/TestRunOutput entities automatically
- The LLM-driven approach is resilient to minor UI changes (no brittle CSS selectors)

**4. Hybrid Oracle Strategy**
Each test uses a combination of oracles:
- `goal-completion` (weight 0.5) — LLM judge evaluates if the goal was achieved
- `url-match` (weight 0.3) — validates the browser ended on the expected page
- `step-count` (weight 0.2) — efficiency check (did it take a reasonable number of steps?)

Some tests add specialized oracles:
- `sql-validate` — verifies database state after write operations
- `llm-judge` — for complex visual validation ("does the dashboard show charts?")

---
## 3. Infrastructure & Pipeline

### 3.1 Docker Compose Enhancements

The existing `docker/docker-compose.test.yml` needs significant updates. Currently it's skeletal — the Dockerfiles don't handle migrations, CodeGen, or AssociationDB.

**Revised Service Architecture:**

```yaml
# docker/docker-compose.test.yml (revised)
services:
  sqlserver:
    # Unchanged — SQL Server 2022 with healthcheck
    # tmpfs for fast ephemeral storage

  db-setup:
    # NEW — one-shot init container
    # Runs: Flyway migrations + AssociationDB install + CodeGen
    # Exits when done, depends_on sqlserver healthy

  mjapi:
    # Revised — no longer needs to run migrations itself
    # depends_on db-setup (service_completed_successfully)
    # Healthcheck on /health endpoint

  mjexplorer:
    # Revised — pre-built Angular app served by nginx or node
    # depends_on mjapi healthy

  test-runner:
    # Revised (renamed from "playwright")
    # Runs: mj test suite --name="MJ Explorer Regression"
    # depends_on mjexplorer (service_started + custom healthcheck)
    # Volumes: test-results output
```

**Why a Separate `db-setup` Container:**
- Migrations and CodeGen are one-shot tasks, not long-running services
- Keeps MJAPI Dockerfile simple (just runs the server)
- `service_completed_successfully` condition ensures DB is fully ready before MJAPI starts
- Easier to debug migration failures in isolation

### 3.2 Dockerfile Changes Required

#### `docker/Dockerfile.db-setup` (NEW)
```
Purpose: Run Flyway migrations, install AssociationDB, run CodeGen
Base: node:24-slim + Flyway CLI + sqlcmd
Steps:
  1. Copy migrations/ directory
  2. Copy Demos/AssociationDB/ directory
  3. Copy MJ packages needed for CodeGen
  4. npm ci for CodeGen dependencies
  5. Entrypoint script:
     a. flyway migrate (MJ core schema)
     b. sqlcmd -i AssociationDB combined_build.sql
     c. mj codegen (generate entity classes, views, sprocs)
     d. Exit 0 on success
```

#### `docker/Dockerfile.api` (REVISED)
```
Current: Copies all source, runs npm ci + build from scratch
Revised:
  - Multi-stage build
  - Stage 1: npm ci + npm run build (full monorepo build)
  - Stage 2: Copy only built MJAPI + node_modules
  - Entrypoint: node dist/index.js (no migration, no codegen)
  - Healthcheck: curl localhost:4000/health
  - Env: DB_HOST, DB_DATABASE, AUTH0_*, etc.
```

#### `docker/Dockerfile.explorer` (REVISED)
```
Current: Copies all source, runs npm ci + build from scratch
Revised:
  - Multi-stage build
  - Stage 1: npm ci + npm run build:explorer (Angular AOT build)
  - Stage 2: nginx serving dist/ static files
  - nginx.conf: proxy /graphql to mjapi:4000, serve Angular on /
  - Much faster startup than node-based dev server
```

#### `docker/Dockerfile.test-runner` (REVISED from Dockerfile.playwright)
```
Current: Copies TestingFramework, runs npx mj-test
Revised:
  - Base: mcr.microsoft.com/playwright:v1.58.1-noble
  - Copy full built monorepo (needs Testing Framework + ComputerUse + AI packages)
  - Install Chromium browser
  - Entrypoint: regression-runner.sh
    a. Wait for MJExplorer healthcheck (curl retry loop)
    b. Seed test metadata if needed (mj test validate / mj sync push)
    c. mj test suite --name="MJ Explorer Regression" --format=json --output=/results/
    d. Generate markdown report
    e. Exit with suite pass/fail code
  - Volumes: /app/test-results → host for artifact collection
```

### 3.3 Environment Variables

The test stack needs these environment variables (provided via `.env.test` or CI secrets):

```bash
# Database
TEST_SA_PASSWORD=TestPassword123!       # SQL Server SA password
TEST_DB_NAME=MemberJunction_Test        # Database name

# Auth0 (required for login tests)
TEST_AUTH0_DOMAIN=your-tenant.us.auth0.com
TEST_AUTH0_CLIENT_ID=xxxxx
TEST_AUTH0_CLIENT_SECRET=xxxxx
TEST_UID=robot-tester@example.com       # Automated test user email
TEST_PWD=SecureTestPassword!            # Automated test user password

# AI (required for Computer Use LLM calls)
AI_VENDOR_API_KEY__AnthropicLLM=sk-ant-xxx   # For controller/judge LLM

# Pipeline
TEST_SUITE_NAME=MJ Explorer Regression  # Suite to run
TEST_TIMEOUT_MINUTES=30                  # Max total time
PREVIOUS_RUN_ID=                         # For regression comparison (optional)
```

### 3.4 Auth0 Test Tenant Setup

The automated test user needs to exist in Auth0 with:
- Email: matches `TEST_UID`
- Password: matches `TEST_PWD`
- Email verified: `true` (skip verification during login)
- No MFA enabled (would block automation)
- Allowed callback URLs: `http://mjexplorer:4200` (docker-internal)

**Recommendation**: Create a dedicated Auth0 "test" application with:
- `http://localhost:4200`, `http://mjexplorer:4200` in callback URLs
- Disable rate limiting for the test client
- The robot tester should be a standard MJ user with sufficient permissions to exercise all test scenarios

### 3.5 Test Result Artifacts

Each suite run produces:

| Artifact | Format | Location | Retention |
|----------|--------|----------|-----------|
| Suite results | JSON | `/test-results/suite-run-{id}.json` | 90 days |
| Markdown report | .md | `/test-results/report-{date}.md` | 90 days |
| Step screenshots | PNG (base64 in DB) | TestRunOutput entities | Permanent |
| Comparison report | .md | `/test-results/comparison-{id}.md` | 90 days |
| Console logs | .log | `/test-results/console-{date}.log` | 30 days |

---
## 4. Test Definitions

### Test Organization

```
TestSuite: "MJ Explorer Regression"
  ├── P0: Critical Path (must pass for release)
  │   ├── T01: Auth0 Login
  │   ├── T02: Home Application Load
  │   ├── T03: Application Switcher
  │   ├── T04: Data Explorer - Browse Entities
  │   ├── T05: Data Explorer - Open Entity Record
  │   ├── T06: Data Explorer - Search
  │   ├── T07: Entity Form - View Record Details
  │   └── T08: Basic Navigation & Tab Management
  │
  ├── P1: Core Functionality
  │   ├── T09: Entity Form - Create New Record
  │   ├── T10: Entity Form - Edit and Save Record
  │   ├── T11: Run a Saved Query
  │   ├── T12: Admin Dashboard - ERD Viewer
  │   ├── T13: Admin Dashboard - User Management
  │   ├── T14: AI Application - Agent List View
  │   └── T15: AI Application - Prompt Management
  │
  ├── P2: Extended Functionality
  │   ├── T16: Lists - Create and Populate
  │   ├── T17: Settings Page Navigation
  │   ├── T18: Communication Templates View
  │   ├── T19: Query Browser - Execute Query
  │   ├── T20: Dashboard Browser
  │   ├── T21: AI Monitor Dashboard
  │   └── T22: Integrations Overview
  │
  └── P3: Resilience & Edge Cases
      ├── T23: Handle Invalid Navigation Gracefully
      ├── T24: Session Persistence (Reload Page)
      └── T25: Multiple Tab Workflow
```

### 4.1 P0 Tests — Critical Path

#### T01: Auth0 Login
```
Goal: Navigate to MJ Explorer login page and authenticate with test credentials.
StartUrl: http://localhost:4200
Auth:
  bindings:
    - domains: ["localhost", "*.auth0.com"]
      method:
        Type: Basic
        Username: ${TEST_UID}
        Password: ${TEST_PWD}
        Strategy: FormLogin
MaxSteps: 15
MaxExecutionTime: 60000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.8)
    Criteria: User is logged in and sees the MJ Explorer home screen
  - url-match (weight: 0.4)
    Pattern: "^http://localhost:4200(?!/login|/callback)"
    (any URL that is NOT the login or callback page)
ExpectedOutcomes:
  goalCompleted: true
  finalUrlPattern: "^http://localhost:4200(?!/login|/callback)"
  maxSteps: 15
```

#### T02: Home Application Load
```
Goal: After login, verify the Home application loads with navigation elements visible.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 10
MaxExecutionTime: 45000
Oracles:
  - goal-completion (weight: 0.7, minConfidence: 0.8)
    Criteria: Home application is displayed with header, app switcher,
    and at least one navigation item visible
  - url-match (weight: 0.3)
    Pattern: "^http://localhost:4200"
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 10
  judgeValidationCriteria:
    - "Application header with MJ logo is visible"
    - "App switcher or navigation sidebar is present"
    - "No error messages or blank screens"
```

#### T03: Application Switcher
```
Goal: Use the application switcher to navigate from Home to Data Explorer,
then to AI application, then back to Home.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: Successfully switched between 3 applications and returned to Home
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Data Explorer content was visible at some point"
    - "AI application content was visible at some point"
    - "Returned to Home application"
```

#### T04: Data Explorer — Browse Entities
```
Goal: Navigate to Data Explorer and browse the list of available entities.
Locate "Members" entity from AssociationDB and click on it to see records.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.5, minConfidence: 0.7)
    Criteria: Viewing a list/grid of Member records from the AssociationDB
  - url-match (weight: 0.3)
    Pattern: "localhost:4200"
  - step-count (weight: 0.2, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Entity list or grid showing member records is visible"
    - "Multiple records are displayed (not empty)"
```

#### T05: Data Explorer — Open Entity Record
```
Goal: From the Members entity grid, open a specific member record
to view its detail form.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 25
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.5, minConfidence: 0.7)
    Criteria: A member detail form is open showing fields like Name, Email,
    Organization, Membership Type
  - step-count (weight: 0.3, maxSteps: 25)
  - url-match (weight: 0.2)
    Pattern: "localhost:4200"
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 25
  judgeValidationCriteria:
    - "Member detail form is displayed with populated fields"
    - "Fields like Name, Email, or Organization are visible and have values"
```

#### T06: Data Explorer — Search
```
Goal: Use the search functionality to find an entity or record.
Search for "Event" and verify results appear.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 15
MaxExecutionTime: 60000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: Search results showing Event-related entities or records are displayed
  - step-count (weight: 0.4, maxSteps: 15)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 15
  judgeValidationCriteria:
    - "Search input contains 'Event' or similar"
    - "Results related to Events are displayed"
```

#### T07: Entity Form — View Record Details
```
Goal: Open the Events entity, select an event record, and verify the
detail form displays correctly with all expected fields.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 25
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: Event detail form is open showing event name, date, location, and status fields
  - step-count (weight: 0.4, maxSteps: 25)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 25
  judgeValidationCriteria:
    - "Event form is displayed with field labels and values"
    - "Event name, date, and status are all visible"
    - "Form is not in an error state"
```

#### T08: Basic Navigation & Tab Management
```
Goal: Open multiple entity records in separate tabs, switch between tabs,
and close a tab without losing the others.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 25
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: Multiple tabs were opened, user switched between them,
    and closing one tab left the others intact
  - step-count (weight: 0.4, maxSteps: 25)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 25
  judgeValidationCriteria:
    - "Multiple tabs are visible in the tab bar"
    - "Content changed when switching tabs"
    - "After closing a tab, at least one other tab remained open"
```

---
### 4.2 P1 Tests — Core Functionality

#### T09: Entity Form — Create New Record
```
Goal: Navigate to the Members entity, create a new member record by
filling in Name, Email, and MembershipType fields, then save it.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 30
MaxExecutionTime: 180000
Oracles:
  - goal-completion (weight: 0.4, minConfidence: 0.7)
    Criteria: A new member record was created and saved successfully
    (save confirmation visible or record appears in grid)
  - sql-validate (weight: 0.4)
    Query: "SELECT COUNT(*) as cnt FROM AssociationDemo.Member
            WHERE Email LIKE '%regression-test%'"
    Expected: cnt >= 1
  - step-count (weight: 0.2, maxSteps: 30)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 30
  judgeValidationCriteria:
    - "New record form was opened"
    - "Fields were populated with test data"
    - "Save operation completed (success indicator or record in list)"
Notes:
  Use a distinctive email like "regression-test-{timestamp}@test.com"
  for sql-validate oracle verification.
```

#### T10: Entity Form — Edit and Save Record
```
Goal: Open an existing Member record, modify the Notes/Description field,
save the changes, and verify the save succeeded.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 25
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.5, minConfidence: 0.7)
    Criteria: An existing record was edited and saved successfully
  - step-count (weight: 0.3, maxSteps: 25)
  - url-match (weight: 0.2)
    Pattern: "localhost:4200"
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 25
  judgeValidationCriteria:
    - "Record form was opened with existing data"
    - "A field value was changed"
    - "Save completed successfully (confirmation visible)"
```

#### T11: Run a Saved Query
```
Goal: Navigate to the Query Browser, find and execute the
"Active Members" query (or similar from AssociationDB queries),
and verify results are displayed.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: A saved query was executed and results are displayed
    in a grid or table
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Query browser or query list is visible"
    - "A query was selected and executed"
    - "Query results are displayed in a table/grid with data rows"
```

#### T12: Admin Dashboard — ERD Viewer
```
Goal: Navigate to the Admin application, open the ERD (Entity Relationship
Diagram) viewer, and verify it renders entities and relationships.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: ERD diagram is displayed showing entity boxes
    with relationship lines
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Admin application is active"
    - "ERD viewer is displayed"
    - "Entity boxes or nodes are visible in the diagram"
```

#### T13: Admin Dashboard — User Management
```
Goal: Navigate to Admin > Users and verify the user management dashboard
loads with a list of users.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: User management dashboard is displayed with at least
    one user record visible
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Admin application is active"
    - "User list or management interface is visible"
    - "At least one user record is displayed"
```

#### T14: AI Application — Agent List View
```
Goal: Navigate to the AI application and view the list of configured
AI agents.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: AI application is open showing a list or grid of AI agents
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "AI application is active"
    - "Agent list or configuration view is displayed"
    - "No error messages"
```

#### T15: AI Application — Prompt Management
```
Goal: Navigate to AI > Prompts and view the prompt management interface.
Open a prompt to see its detail form.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 25
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
    Criteria: Prompt management view is displayed and a prompt detail
    form is open
  - step-count (weight: 0.4, maxSteps: 25)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 25
  judgeValidationCriteria:
    - "AI Prompts section is active"
    - "Prompt list or browser is visible"
    - "A prompt detail form is open with prompt text visible"
```

---
### 4.3 P2 Tests — Extended Functionality

#### T16: Lists — Create and Populate
```
Goal: Navigate to the Lists application, create a new list named
"Regression Test List", add a member record to it, and verify
the list contains the record.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 30
MaxExecutionTime: 180000
Oracles:
  - goal-completion (weight: 0.5, minConfidence: 0.7)
  - step-count (weight: 0.3, maxSteps: 30)
  - sql-validate (weight: 0.2)
    Query: "SELECT COUNT(*) as cnt FROM __mj.List
            WHERE Name LIKE '%Regression Test%'"
    Expected: cnt >= 1
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 30
  judgeValidationCriteria:
    - "Lists application is active"
    - "A new list was created"
    - "At least one record was added to the list"
```

#### T17: Settings Page Navigation
```
Goal: Open the user settings/preferences page and verify the settings
categories are displayed (Account, General, Application Settings, etc.).
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 15
MaxExecutionTime: 60000
Oracles:
  - goal-completion (weight: 0.7, minConfidence: 0.7)
  - step-count (weight: 0.3, maxSteps: 15)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 15
  judgeValidationCriteria:
    - "Settings page or dialog is open"
    - "Multiple settings categories are visible"
```

#### T18: Communication Templates View
```
Goal: Navigate to the Communication application and view
communication templates.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Communication application is active"
    - "Template list or browser is displayed"
```

#### T19: Query Browser — Execute Query
```
Goal: Navigate to Data Explorer > Queries, find a query related to
events or members, execute it, and verify results display.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 25
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
  - step-count (weight: 0.4, maxSteps: 25)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 25
  judgeValidationCriteria:
    - "Query browser is active"
    - "A query was selected and run"
    - "Results are displayed in tabular format with data"
```

#### T20: Dashboard Browser
```
Goal: Navigate to Data Explorer > Dashboards and open a dashboard
to verify it renders correctly.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Dashboard browser is displayed"
    - "At least one dashboard is listed or displayed"
```

#### T21: AI Monitor Dashboard
```
Goal: Navigate to AI > Monitor and verify the monitoring dashboard
loads with agent execution data or status indicators.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "AI Monitor view is active"
    - "Dashboard or monitoring widgets are displayed"
    - "No error messages or crash screens"
```

#### T22: Integrations Overview
```
Goal: Navigate to the Integrations application and verify the
overview dashboard loads.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 20
MaxExecutionTime: 90000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
  - step-count (weight: 0.4, maxSteps: 20)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 20
  judgeValidationCriteria:
    - "Integrations application is active"
    - "Overview or connection list is displayed"
```

### 4.4 P3 Tests — Resilience & Edge Cases

#### T23: Handle Invalid Navigation Gracefully
```
Goal: Attempt to navigate to a non-existent entity or URL path
and verify the application handles it gracefully (error page or
redirect, NOT a crash/blank screen).
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 15
MaxExecutionTime: 60000
Oracles:
  - goal-completion (weight: 0.7, minConfidence: 0.6)
  - step-count (weight: 0.3, maxSteps: 15)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 15
  judgeValidationCriteria:
    - "User navigated to an invalid/nonexistent path"
    - "Application displayed an error page or redirected gracefully"
    - "Application did NOT show a blank white screen or crash"
```

#### T24: Session Persistence (Reload Page)
```
Goal: Login, navigate to Data Explorer, open a record, reload the
browser page, and verify the session is maintained (user stays logged
in and can continue working).
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 25
MaxExecutionTime: 120000
Oracles:
  - goal-completion (weight: 0.7, minConfidence: 0.7)
  - step-count (weight: 0.3, maxSteps: 25)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 25
  judgeValidationCriteria:
    - "User was logged in and navigated to content"
    - "Page was reloaded"
    - "After reload, user is still logged in (not redirected to login)"
    - "Application is functional after reload"
```

#### T25: Multiple Tab Workflow
```
Goal: Open three different entity types in separate tabs (Members,
Events, Organizations), verify each tab has correct content, then
close the middle tab and verify the remaining tabs are still functional.
StartUrl: http://localhost:4200
Auth: (same as T01)
MaxSteps: 30
MaxExecutionTime: 180000
Oracles:
  - goal-completion (weight: 0.6, minConfidence: 0.7)
  - step-count (weight: 0.4, maxSteps: 30)
ExpectedOutcomes:
  goalCompleted: true
  maxSteps: 30
  judgeValidationCriteria:
    - "Three tabs were opened with different entity content"
    - "Middle tab was closed"
    - "Remaining two tabs are still functional with correct content"
```

---
### 4.5 Shared Test Configuration

All tests share a common configuration baseline. Individual tests override only what's different.

#### Common Configuration Template
```json
{
  "headless": true,
  "maxSteps": 20,
  "maxExecutionTime": 90000,
  "screenshotHistoryDepth": 3,
  "viewportWidth": 1280,
  "viewportHeight": 720,
  "controllerPromptName": "Computer Use: Controller",
  "judgePromptName": "Computer Use: Judge",
  "controllerModel": {
    "vendor": "anthropic",
    "model": "claude-sonnet-4-6",
    "driverClass": "AnthropicLLM"
  },
  "judgeModel": {
    "vendor": "anthropic",
    "model": "claude-sonnet-4-6",
    "driverClass": "AnthropicLLM"
  },
  "judgeFrequency": "EveryNSteps:3",
  "oracles": [
    { "type": "goal-completion", "weight": 0.5, "config": { "minConfidence": 0.7 } },
    { "type": "url-match", "weight": 0.3 },
    { "type": "step-count", "weight": 0.2 }
  ]
}
```

#### Common Auth Binding Template
```json
{
  "auth": {
    "bindings": [
      {
        "domains": ["localhost", "*.auth0.com"],
        "method": {
          "Type": "Basic",
          "Username": "${TEST_UID}",
          "Password": "${TEST_PWD}",
          "Strategy": "FormLogin"
        }
      }
    ]
  }
}
```

**Model Choice: Sonnet (not Opus) for Controller/Judge**
- Sonnet is 5-10x cheaper per step than Opus
- Computer Use tasks are primarily visual navigation, not deep reasoning
- Sonnet handles "click this button, fill this form" effectively
- Use Opus only if Sonnet proves unreliable for specific complex tests

**Judge Frequency: EveryNSteps:3**
- Evaluates every 3 steps instead of every step (default)
- Reduces LLM cost by ~66% for the judge
- Still catches failures quickly enough for 15-30 step tests

### 4.6 Test Variable System

Tests use the Testing Framework's variable resolution for environment-specific values:

```json
// TestType.VariablesSchema for "Computer Use" type
{
  "variables": [
    {
      "name": "BASE_URL",
      "displayName": "Application Base URL",
      "dataType": "string",
      "defaultValue": "http://localhost:4200",
      "required": true
    },
    {
      "name": "TEST_UID",
      "displayName": "Test User Email",
      "dataType": "string",
      "required": true
    },
    {
      "name": "TEST_PWD",
      "displayName": "Test User Password",
      "dataType": "string",
      "required": true
    },
    {
      "name": "API_URL",
      "displayName": "API Base URL",
      "dataType": "string",
      "defaultValue": "http://localhost:4000",
      "required": false
    }
  ]
}
```

Suite-level variable overrides allow running the same tests against different environments:
```json
// TestSuite.Variables for Docker environment
{
  "BASE_URL": "http://mjexplorer:4200",
  "API_URL": "http://mjapi:4000"
}

// TestSuite.Variables for local dev
{
  "BASE_URL": "http://localhost:4201",
  "API_URL": "http://localhost:4001"
}
```

### 4.7 Metadata Storage

Test definitions are stored as mj-sync metadata files:

```
metadata/
  regression-tests/
    .mj-sync.json              # Entity: "MJ: Tests", pattern: "**/*.json"
    suite/
      .regression-suite.json   # TestSuite: "MJ Explorer Regression"
    tests/
      .t01-auth0-login.json
      .t02-home-load.json
      .t03-app-switcher.json
      ... (one file per test)
    suite-tests/
      .suite-test-mappings.json  # TestSuiteTest junction records (ordering)
```

This allows `mj sync push` to seed tests into any environment.

---
## 5. Implementation Phases

### Phase 1: Pipeline Infrastructure (Estimated: 3-4 days)

**Goal**: Get the Docker test stack running end-to-end with a single smoke test.

#### 1.1 Create `Dockerfile.db-setup`
- Base image: `node:24-slim` with Flyway CLI and sqlcmd
- Copy `migrations/` directory for Flyway
- Copy `Demos/AssociationDB/` for demo data
- Copy necessary packages for CodeGen (MJCLI, CodeGenLib, etc.)
- Entrypoint script: `db-setup-entrypoint.sh`
  - Create database
  - Run `flyway migrate`
  - Run AssociationDB `prepare_build.sh` + `sqlcmd` install
  - Run `mj codegen`
  - Exit 0

#### 1.2 Revise `Dockerfile.api`
- Multi-stage build (build stage + runtime stage)
- Runtime stage: slim image with only built artifacts
- Entrypoint: start MJAPI server (no migration/codegen)
- Health endpoint: `/health`
- Environment: DB connection, Auth0 config

#### 1.3 Revise `Dockerfile.explorer`
- Multi-stage build (build stage + nginx serve stage)
- Build Angular app with production config
- nginx.conf: serve static files, proxy `/graphql` to mjapi
- Health: nginx returns 200 on `/`

#### 1.4 Revise `Dockerfile.test-runner` (renamed from `Dockerfile.playwright`)
- Base: `mcr.microsoft.com/playwright` with Chromium
- Copy built Testing Framework + ComputerUse packages
- Entrypoint: `regression-runner.sh`
  - Health-check wait for MJExplorer
  - Seed test metadata (mj sync push)
  - Run single smoke test
  - Output results

#### 1.5 Revise `docker-compose.test.yml`
- Add `db-setup` service with `service_completed_successfully` condition
- Update service dependencies
- Add `.env.test` file template
- Add `test-results` volume

#### Deliverables
- [ ] `docker/Dockerfile.db-setup` + `db-setup-entrypoint.sh`
- [ ] Revised `docker/Dockerfile.api` (multi-stage)
- [ ] Revised `docker/Dockerfile.explorer` (multi-stage + nginx)
- [ ] Revised `docker/Dockerfile.test-runner`
- [ ] Revised `docker/docker-compose.test.yml`
- [ ] `.env.test.example` template
- [ ] `docker/regression-runner.sh` orchestration script
- [ ] Smoke test: single T01 (Auth0 Login) runs and passes

---

### Phase 2: Test Definitions (Estimated: 2-3 days)

**Goal**: Create all 25 test definitions as metadata and verify they load correctly.

#### 2.1 Create Test Metadata Structure
```
metadata/
  regression-tests/
    .mj-sync.json
    suite/
    tests/
    suite-tests/
```

#### 2.2 Write Test Definition Files
- One `.json` file per test (T01–T25)
- Each file contains `fields` with:
  - Name, Description, TypeID (Computer Use type UUID)
  - Configuration (JSON blob with oracles, model config)
  - InputDefinition (JSON blob with goal, startUrl, auth)
  - ExpectedOutcomes (JSON blob with validation criteria)
  - MaxExecutionTimeMS, Tags, Priority
- Suite definition with ordered TestSuiteTest mappings

#### 2.3 Push to Database and Validate
- Run `mj sync push --dir=metadata/regression-tests`
- Run `mj test validate` to check all definitions
- Run `mj test list` to verify tests appear

#### 2.4 Smoke Test Each P0 Test Individually
- Run each P0 test (T01–T08) against local or workbench environment
- Fix any configuration issues
- Verify oracles evaluate correctly
- Tune maxSteps and timeouts based on actual step counts

#### Deliverables
- [ ] 25 test definition JSON files in `metadata/regression-tests/tests/`
- [ ] 1 suite definition in `metadata/regression-tests/suite/`
- [ ] 25 suite-test mapping records in `metadata/regression-tests/suite-tests/`
- [ ] `.mj-sync.json` configurations for each entity type
- [ ] All P0 tests passing individually in workbench

---

### Phase 3: Suite Execution & Reporting (Estimated: 2-3 days)

**Goal**: Full suite runs end-to-end in Docker with results reporting.

#### 3.1 Suite Runner Integration
- Verify `mj test suite` runs all 25 tests in sequence
- Handle test failures gracefully (continue on failure)
- Verify TestSuiteRun entity is populated with aggregate results
- Verify TestRunOutput entities store screenshots

#### 3.2 Result Export
- `regression-runner.sh` exports results:
  - `suite-run-{id}.json` — full result data
  - `report-{date}.md` — human-readable Markdown report
  - Exit code: 0 if all P0 pass, 1 if any P0 fail

#### 3.3 Markdown Report Format
```markdown
# MJ Explorer Regression Report
**Date**: 2026-03-28
**Branch**: next
**Commit**: abc1234
**Duration**: 18m 42s
**Cost**: $24.50

## Summary
| Priority | Pass | Fail | Skip | Total |
|----------|------|------|------|-------|
| P0       | 8    | 0    | 0    | 8     |
| P1       | 6    | 1    | 0    | 7     |
| P2       | 7    | 0    | 0    | 7     |
| P3       | 3    | 0    | 0    | 3     |
| **Total**| **24**| **1**| **0**| **25**|

## Failed Tests
### T11: Run a Saved Query (P1)
- Score: 0.35
- Status: Failed
- Oracle Results:
  - goal-completion: FAIL (confidence: 0.4, needed: 0.7)
  - url-match: PASS
  - step-count: PASS
- Error: Query browser did not display results
- Steps: 18 / 20 max
- Screenshots: [link to TestRunOutput]

## All Test Results
| # | Test | Priority | Score | Status | Steps | Duration |
|---|------|----------|-------|--------|-------|----------|
| T01 | Auth0 Login | P0 | 0.95 | Pass | 8/15 | 32s |
| T02 | Home Load | P0 | 0.92 | Pass | 5/10 | 18s |
...
```

#### 3.4 Full Pipeline Validation
- Run complete `docker compose up` → test → report cycle
- Verify results in `test-results/` volume
- Verify database contains TestRun/TestSuiteRun records
- Measure total pipeline duration (target: < 45 minutes)

#### Deliverables
- [ ] `regression-runner.sh` handles full suite lifecycle
- [ ] JSON export of suite results
- [ ] Markdown report generation
- [ ] Exit code reflects P0 pass/fail status
- [ ] Full pipeline runs successfully in Docker

---

### Phase 4: Regression Comparison (Estimated: 2-3 days)

**Goal**: Detect regressions between runs.

#### 4.1 Implement Compare Command
The existing `mj test compare` is a placeholder. Implement:

```bash
mj test compare --run1=<suite-run-id-1> --run2=<suite-run-id-2>
mj test compare --latest    # Compare two most recent suite runs
mj test compare --version=5.18.0 --against=5.17.0
```

#### 4.2 Comparison Logic
- Match tests by TestID between two suite runs
- For each test:
  - Score delta (current - previous)
  - Status change (Pass→Fail = REGRESSION, Fail→Pass = IMPROVEMENT)
  - Step count delta (efficiency tracking)
  - Cost delta
- Aggregate:
  - Total regressions count
  - Total improvements count
  - Average score delta
  - New failures list
  - Resolved failures list

#### 4.3 Comparison Report Format
```markdown
# Regression Comparison
**Current**: Suite Run abc123 (2026-03-28, branch: next, commit: def456)
**Previous**: Suite Run xyz789 (2026-03-21, branch: next, commit: ghi012)

## Summary
- Regressions: 2
- Improvements: 1
- Unchanged: 22

## Regressions (NEEDS ATTENTION)
| Test | Previous | Current | Delta |
|------|----------|---------|-------|
| T11: Run Saved Query | 0.85 PASS | 0.35 FAIL | -0.50 |
| T16: Lists Create | 0.90 PASS | 0.62 FAIL | -0.28 |

## Improvements
| Test | Previous | Current | Delta |
|------|----------|---------|-------|
| T09: Create Record | 0.65 FAIL | 0.88 PASS | +0.23 |
```

#### 4.4 Exit Codes for CI
- Exit 0: No regressions
- Exit 1: One or more regressions detected
- Exit 2: Unable to compare (missing data)

#### Deliverables
- [ ] `mj test compare` command fully implemented
- [ ] Comparison report generation (Markdown + JSON)
- [ ] CI-friendly exit codes
- [ ] `--latest` flag for automatic latest-two comparison

---

### Phase 5: CI/CD Integration (Estimated: 2-3 days)

**Goal**: Automated regression runs on release candidates.

#### 5.1 GitHub Actions Workflow

```yaml
# .github/workflows/regression-test.yml
name: Full-Stack Regression Tests

on:
  workflow_dispatch:
    inputs:
      branch:
        description: 'Branch to test'
        default: 'next'
  pull_request:
    branches: [next]
    types: [labeled]
    # Only trigger when "regression-test" label is added

jobs:
  regression:
    runs-on: ubuntu-latest-16-core  # Need beefy runner for Docker stack
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - name: Create .env.test
        run: |
          cat > docker/.env.test << EOF
          TEST_SA_PASSWORD=${{ secrets.TEST_SA_PASSWORD }}
          TEST_AUTH0_DOMAIN=${{ secrets.TEST_AUTH0_DOMAIN }}
          TEST_AUTH0_CLIENT_ID=${{ secrets.TEST_AUTH0_CLIENT_ID }}
          TEST_AUTH0_CLIENT_SECRET=${{ secrets.TEST_AUTH0_CLIENT_SECRET }}
          TEST_UID=${{ secrets.TEST_UID }}
          TEST_PWD=${{ secrets.TEST_PWD }}
          AI_VENDOR_API_KEY__AnthropicLLM=${{ secrets.ANTHROPIC_API_KEY }}
          EOF
      - name: Run regression suite
        run: docker compose -f docker/docker-compose.test.yml up --build --abort-on-container-exit
      - name: Upload test results
        uses: actions/upload-artifact@v4
        with:
          name: regression-results
          path: docker/test-results/
          retention-days: 90
      - name: Post summary to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            // Read report markdown and post as PR comment
            const fs = require('fs');
            const report = fs.readFileSync('docker/test-results/report-latest.md', 'utf8');
            github.rest.issues.createComment({
              ...context.repo,
              issue_number: context.issue.number,
              body: report
            });
```

#### 5.2 Secrets Configuration
Required GitHub repository secrets:
- `TEST_SA_PASSWORD`
- `TEST_AUTH0_DOMAIN`
- `TEST_AUTH0_CLIENT_ID`
- `TEST_AUTH0_CLIENT_SECRET`
- `TEST_UID`
- `TEST_PWD`
- `ANTHROPIC_API_KEY` (for Computer Use LLM calls)

#### 5.3 Trigger Strategy
- **Manual**: `workflow_dispatch` for on-demand regression runs
- **Label-triggered**: Add `regression-test` label to a PR to trigger
- **Scheduled** (future): Weekly or nightly runs against `next` branch
- **NOT on every PR**: Too expensive and slow for every push

#### Deliverables
- [ ] `.github/workflows/regression-test.yml`
- [ ] Secrets documentation
- [ ] PR comment integration
- [ ] Artifact upload for test results

---

### Phase 6: Hardening & Polish (Estimated: 2-3 days)

**Goal**: Make the suite reliable and maintainable.

#### 6.1 Flaky Test Detection
- Tests with `RepeatCount: 3` for statistical analysis
- Flag tests that pass/fail inconsistently (score variance > 0.3)
- Add `--flaky-check` flag to suite runner
- Flaky tests get `[FLAKY]` tag in reports

#### 6.2 Test Maintenance Tools
- `mj test validate` — check all test definitions parse correctly
- `mj test dry-run` — validate without executing (check oracle configs, variable resolution)
- Quick script to re-run a single failed test for debugging

#### 6.3 Screenshot Gallery
- HTML report with embedded screenshots for each step
- Clickable timeline showing test progression
- Side-by-side comparison of current vs previous run screenshots

#### 6.4 Documentation
- `docker/REGRESSION_TESTING.md` — how to run locally
- `metadata/regression-tests/README.md` — how to add/modify tests
- Update `docker/CLAUDE.md` with regression testing context

#### Deliverables
- [ ] Flaky test detection and reporting
- [ ] Test maintenance tools working
- [ ] Screenshot gallery HTML report
- [ ] Complete documentation

---
## 6. Cost & Performance Estimates

### Per-Test Cost Model

| Component | Cost per Step | Steps per Test | Cost per Test |
|-----------|--------------|----------------|---------------|
| Controller LLM (Sonnet) | ~$0.02 | 15 avg | $0.30 |
| Judge LLM (Sonnet, every 3 steps) | ~$0.02 | 5 avg | $0.10 |
| Screenshots (storage) | negligible | 15 avg | ~$0 |
| **Total per test** | | | **~$0.40** |

### Per-Suite Cost Model

| Suite Tier | Tests | Cost per Test | Subtotal |
|------------|-------|---------------|----------|
| P0 (Critical) | 8 | $0.40 | $3.20 |
| P1 (Core) | 7 | $0.50 | $3.50 |
| P2 (Extended) | 7 | $0.45 | $3.15 |
| P3 (Resilience) | 3 | $0.50 | $1.50 |
| **Total** | **25** | | **~$11.35** |

**Note**: P1/P2 tests tend to have more steps (complex workflows), so slightly higher cost. Actual costs will vary based on screenshot sizes and LLM response lengths.

**Upper bound**: If using Opus for controller (not recommended), costs would be ~$40-60 per run.

### Performance Estimates

| Phase | Duration |
|-------|----------|
| SQL Server startup + healthcheck | 30-60s |
| Flyway migrations | 2-3 min |
| AssociationDB install | 30-60s |
| CodeGen | 3-5 min |
| MJAPI startup + healthcheck | 30-60s |
| MJExplorer build (if not cached) | 5-8 min |
| MJExplorer startup | 15-30s |
| **Infrastructure total** | **~12-18 min** |
| Test suite execution (25 tests) | **~20-30 min** |
| Reporting | 30s |
| **Total pipeline** | **~35-50 min** |

**Optimization opportunities**:
- Pre-built Docker images (skip build steps): saves 10-15 min
- Parallel test execution (future): could cut test time by 50%
- Image caching in CI (Docker layer cache): saves 5-10 min on subsequent runs

### Monthly Cost Projections

| Cadence | Runs/Month | Cost/Month |
|---------|------------|------------|
| Per release (biweekly) | 2 | $23 |
| Weekly | 4 | $45 |
| Nightly | 30 | $340 |
| Per PR (selective) | ~10 | $113 |

**Recommended starting cadence**: Per release + manual triggers = ~$25-50/month.

---
## 7. CI/CD Integration

### Pipeline Flow in GitHub Actions

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ Trigger      │     │ Build &      │     │ Test &       │
│              │────►│ Setup        │────►│ Report       │
│ - manual     │     │              │     │              │
│ - PR label   │     │ - docker     │     │ - run suite  │
│ - schedule   │     │   compose up │     │ - compare    │
│              │     │ - wait for   │     │ - upload     │
│              │     │   healthy    │     │ - comment PR │
└─────────────┘     └──────────────┘     └──────────────┘
```

### Release Gating

**P0 tests are release-blocking:**
- All 8 P0 tests must pass for a release candidate to proceed
- P1/P2/P3 failures are reported but don't block
- The test-runner exits with code 0 only if all P0 pass

**Score thresholds:**
- P0 tests: minimum score 0.7 (configurable)
- P1 tests: minimum score 0.6
- P2/P3 tests: informational only (no minimum)

### Future: Parallel Test Execution

The Testing Framework suite runner currently executes tests sequentially. Future enhancement:
- Split tests into parallelism groups (tests that don't share state)
- Launch multiple browser instances
- Merge results at the end
- Could reduce suite time from 25 min to ~10 min

This requires:
- Multiple Chromium instances (memory: ~500MB each)
- Test isolation (each browser gets its own session)
- Result aggregation in the suite runner
- Not a Phase 1 concern — sequential is fine for initial release

---

## 8. Open Questions

### For Team Discussion

1. **Auth0 test tenant**: Do we already have a dedicated test Auth0 app and robot user? Or do we need to create one? What permissions should the robot user have?

2. **AssociationDB baseline**: Should the regression suite always install a fresh AssociationDB, or should we also support testing against an existing database state? (Recommendation: always fresh for determinism.)

3. **Model choice**: Sonnet is recommended for cost reasons. Should we allow per-test model overrides for tests that prove unreliable with Sonnet? (The config supports this already.)

4. **GitHub Actions runner**: The full Docker stack needs a beefy runner (16-core recommended for build speed). Do we have `ubuntu-latest-16-core` runners available, or do we need self-hosted?

5. **Test data mutations**: Tests T09 (Create Record) and T16 (Create List) write to the database. Since we use a fresh DB per run, this is fine. But should tests clean up after themselves anyway? (Recommendation: no, rely on fresh DB.)

6. **Nightly runs**: Should we set up nightly runs against `next` from day one, or start with manual-only? (Recommendation: start manual, add nightly in Phase 6 once stable.)

7. **Failure notifications**: When the regression suite fails, who gets notified? Slack channel? Email? GitHub issue auto-created? (Recommendation: start with PR comments + Slack notification.)

8. **Test versioning**: When tests need to change due to UI changes, how do we handle the version history? The Testing Framework has version/comparison support, but the workflow needs definition.

9. **PostgreSQL support**: The workbench supports PostgreSQL. Should the regression suite also run against PostgreSQL? (Recommendation: SQL Server only initially, add PostgreSQL as a separate suite later.)

10. **MJExplorer build caching**: Building Angular from scratch takes 5-8 min. Should we pre-build and publish an MJExplorer Docker image for each commit? (Recommendation: yes, in Phase 5, use GitHub Container Registry.)

---

## 9. File Summary — What Gets Created

### New Files
```
docker/
  Dockerfile.db-setup                    # Database init container
  db-setup-entrypoint.sh                 # Migration + AssociationDB + CodeGen
  regression-runner.sh                   # Test orchestration script
  .env.test.example                      # Environment template
  REGRESSION_TESTING.md                  # Runbook documentation

metadata/
  regression-tests/
    .mj-sync.json                        # Metadata sync config
    suite/
      .regression-suite.json             # Suite definition
    tests/
      .t01-auth0-login.json              # Test definitions (25 files)
      .t02-home-load.json
      ... (T03–T25)
    suite-tests/
      .suite-test-mappings.json          # Ordering/sequencing

.github/
  workflows/
    regression-test.yml                  # CI/CD workflow
```

### Modified Files
```
docker/
  docker-compose.test.yml               # Revised with db-setup + proper deps
  Dockerfile.api                         # Multi-stage build
  Dockerfile.explorer                    # Multi-stage + nginx
  Dockerfile.playwright → .test-runner   # Renamed + revised
  CLAUDE.md                              # Add regression testing context

packages/TestingFramework/CLI/
  src/commands/compare.ts                # Implement comparison logic
```

### Total Estimated Effort
| Phase | Effort | Depends On |
|-------|--------|------------|
| Phase 1: Pipeline Infrastructure | 3-4 days | Nothing |
| Phase 2: Test Definitions | 2-3 days | Phase 1 |
| Phase 3: Suite Execution & Reporting | 2-3 days | Phase 2 |
| Phase 4: Regression Comparison | 2-3 days | Phase 3 |
| Phase 5: CI/CD Integration | 2-3 days | Phase 3 |
| Phase 6: Hardening & Polish | 2-3 days | Phase 4+5 |
| **Total** | **~14-19 days** | |

Phases 4 and 5 can run in parallel since they have no dependencies on each other (only on Phase 3).
