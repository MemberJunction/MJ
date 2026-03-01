# General
- We want to test BOTH SQL Server and Postgres for this release
- Claude Code running locally will supervise two instances of the `docker workbench` setup.
- One will do SQL Server testing
- The other will do PG testing
- Claude Code (CC) local will NOT do any direct work but rather oversee the CC instances in each docker
- The purpose of this phase of testing is to ensure complete system functionality

# Shared
- for both systems after spinng up docker environments we will
- optional but good idea --- turn off the database docker that we're not using so the PG instancde can turn off its SQL Server and vice-versa for SQL docker turning off PG docker in it
- Create a new database in the docker's database (just PG for the PG one and just SQL for the SQL one)
- Apply the v5 migrations - for the SQL Server version we can run `mj migrate` whereas for PG I don't know if we have fixed `mj migrate` and Skyway to support PG yet, I believe not. If so, we can use flyway or just manjually apply the migrations one by one
- After migrations are in place, we will then do the following tests

# Tests
1) Simple boot up test - launch MJAPI and watch console to see if any errors. Lots of noise coming from this build with debug statements but that is expected. Looking for actual errors. Same for MJExplorer. Launch Playwright **HEADLESS** in the docker and login using the dummy Auth0 account (make sure setup for Auth0 on both .env and for MJExplorer setup in the docker). Just logging in and seeing a list of apps on home dashboard (and check console in MJAPI and MJExplorer as well for errors). Getting to this result with clean consoles is End of first test.
2) Boot up MJAPI/MJExplorer. Navigate to Data Explorer App. Go to Action Categories. Open any record. Edit the record. Should see change in the database, no errors in MJAPI or MJExplorer console. Also should see `Record Changes` properly populate in the database and click on the icon in the UI should show the changes made. Test this 4 times in various records and make 2 or 3 cahnges per record to test. After Action Categories do the same thing in AI Prompt Models entity. Correct fnctionality, database state corect and no errors in console for MJAPI and MJExplroer is what is needed to finish this test
3) Boot up MJAPI/MJEXplorer. Go to Chat application. Strike up conversation with Sage. Ask sage to do thjings like check stock prices, get weather,write poety, and generate images related to the conversation. Should all work. Should have no errors in console in MJAPI or MJExplorer to pass test along with expected bheavior. Erros in LLM aren't the concern, that's ok happenssometimes. It is errors in our framework to concern with. 
4) Open up testing app. Find the Potato Soup test for resarch agent and run it from UI. Close the dialolg after it starts, go to Chat and see the thread that was created. Refresh page if don't see it. Monitor this and wait for result, should be a nice report when done.

These tests will pretty exhauistively test the system. We do them in SQL and PG in parallel. To fix issues, see next section on Test Fix Process

# Test Fix Process
- As we encounter errors, we will have the CC **LOCAL** coordinate fixes. Whenever CC in **DOCKER** encounters errors it will diagnose and report back a summary of its errors to CC **LOCAL**. CC Local will determine how to fix, make the fixes, build, unit test, then commit/push. Then CC in docker will pull from remote branch in its docker file system and re-run the failed test. 
- This process repeats until a give test passes. 
- This process allows **CC LOCAL** to coordinate common errors and ensure fixes aren't done in CC Docker twice in each of the parallel branches doing testing for SQL/PG

# Logging
- Update this testing plan file, add a new section below and put updates in as major chagnes are done and sections are completed in each branch and final report at bottom when done.