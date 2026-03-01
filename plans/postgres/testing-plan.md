# General
- We want to test BOTH SQL Server and Postgres for this release
- Claude Code running locally will supervise two instances of the `docker workbench` setup.
- One will do SQL Server testing
- The other will do PG testing
- Claude Code (CC) LOCAL is the **coordinator**: it diagnoses errors, makes code fixes, builds, runs unit tests, and tells the user when it's ready to commit. CC LOCAL does NOT commit without explicit user approval.
- The purpose of this phase of testing is to ensure complete system functionality

# Shared
- for both systems after spinng up docker environments we will
- optional but good idea --- turn off the database docker that we're not using so the PG instancde can turn off its SQL Server and vice-versa for SQL docker turning off PG docker in it
- Create a new database in the docker's database (just PG for the PG one and just SQL for the SQL one)
- Apply the v5 migrations - for the SQL Server version we can run `mj migrate` whereas for PG I don't know if we have fixed `mj migrate` and Skyway to support PG yet, I believe not. If so, we can use flyway or just manjually apply the migrations one by one
- After migrations are in place, we will then do the following tests

# Phase 1 Tests
1) Simple boot up test - launch MJAPI and watch console to see if any errors. Lots of noise coming from this build with debug statements but that is expected. Looking for actual errors. Same for MJExplorer. Launch Playwright **HEADLESS** in the docker and login using the dummy Auth0 account (make sure setup for Auth0 on both .env and for MJExplorer setup in the docker). Just logging in and seeing a list of apps on home dashboard (and check console in MJAPI and MJExplorer as well for errors). Getting to this result with clean consoles is End of first test.
2) Boot up MJAPI/MJExplorer. Navigate to Data Explorer App. Go to Action Categories. Open any record. Edit the record. Should see change in the database, no errors in MJAPI or MJExplorer console. Also should see `Record Changes` properly populate in the database and click on the icon in the UI should show the changes made. Test this 4 times in various records and make 2 or 3 cahnges per record to test. After Action Categories do the same thing in AI Prompt Models entity. Correct fnctionality, database state corect and no errors in console for MJAPI and MJExplroer is what is needed to finish this test
3) Boot up MJAPI/MJEXplorer. Go to Chat application. Strike up conversation with Sage. Ask sage to do thjings like check stock prices, get weather,write poety, and generate images related to the conversation. Should all work. Should have no errors in console in MJAPI or MJExplorer to pass test along with expected bheavior. Erros in LLM aren't the concern, that's ok happenssometimes. It is errors in our framework to concern with. 
4) Open up testing app. Find the Potato Soup test for resarch agent and run it from UI. Close the dialolg after it starts, go to Chat and see the thread that was created. Refresh page if don't see it. Monitor this and wait for result, should be a nice report when done.

These tests (Phase 1) exhauistively test the existing system. We do them in SQL and PG in parallel. To fix issues, see Test Fix Process section below.

# Phase 2: Custom Schema + CodeGen Test
After Phase 1 passes, test the full entity lifecycle with a brand new schema:

1) **Backup clean DB** — After v5 migrations are applied and Phase 1 passes, backup the database (e.g., `sqlcmd` backup for SQL Server, `pg_dump` for PG). This clean snapshot is used to restore if Phase 2 needs to restart.
2) **Create sample domain schema** — Design a small but realistic domain app (HR, CRM, Sales, Restaurant, etc.) with 5-10 tables, foreign keys, constraints, various column types. Write as a migration file in MJ format (`VYYYYMMDDHHMM__v[VERSION].x_[DESCRIPTION].sql`).
3) **Run `npx mj migrate`** — Apply the new migration. Monitor for errors.
4) **Run `npx mj codegen`** — Generate entity classes, stored procedures, views, Angular forms. Monitor for errors.
5) **Test in Data Explorer** — Open each new entity in MJExplorer Data Explorer. For each entity:
   - Create a new record
   - Edit the record (2-3 field changes)
   - Verify database state is correct
   - Verify Record Changes populate correctly
   - Check MJAPI and MJExplorer consoles for errors
6) **If errors** — Fix CodeGen, SQLServerDataProvider, PostgreSQLDataProvider, or whatever is broken. Then restore DB from the clean backup, create a NEW sample schema (don't reuse the broken one), and repeat from step 2.
7) **Pass criteria** — All entities from the sample schema can be created, edited, and viewed with correct Record Changes and clean consoles.

To fix issues, see Test Fix Process section below.

# Test Fix Process
- When CC in **DOCKER** encounters errors, it diagnoses and reports a summary back to CC **LOCAL**.
- CC **LOCAL** determines how to fix, makes the code fixes, builds, and runs unit tests locally.
- CC **LOCAL** does NOT commit without explicit user approval. When fixes are ready, CC LOCAL tells the user and waits for permission to commit/push.
- After commit/push, CC in **DOCKER** pulls from the remote branch and re-runs the failed test.
- This process repeats until a given test passes.
- This process allows CC **LOCAL** to coordinate common errors and ensure fixes aren't duplicated across the parallel SQL/PG Docker branches.

# Logging
- Update this testing plan file, add a new section below and put updates in as major chagnes are done and sections are completed in each branch and final report at bottom when done.