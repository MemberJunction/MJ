---
"@memberjunction/ai": patch
"@memberjunction/ai-agent-manager": patch
"@memberjunction/ai-agents": patch
"@memberjunction/ai-bridge-discord": patch
"@memberjunction/ai-bridge-googlemeet": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-slack": patch
"@memberjunction/ai-bridge-teams": patch
"@memberjunction/ai-bridge-webex": patch
"@memberjunction/ai-bridge-zoom": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-engine-base": patch
"@memberjunction/cli": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/computer-use": patch
"@memberjunction/computer-use-engine": patch
"@memberjunction/context-crush": patch
"@memberjunction/core-entities": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/integration-test-suite": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/predictive-studio": patch
"@memberjunction/query-processor": patch
"@memberjunction/react-test-harness": patch
"@memberjunction/record-cloning-base": patch
"@memberjunction/rubrics": patch
"@memberjunction/search-engine": patch
"@memberjunction/sql-converter": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/sql-parser": patch
"@memberjunction/standards": patch
"@memberjunction/task-graph": patch
"@memberjunction/testing-engine": patch
"@memberjunction/video-studio": patch
"@memberjunction/work-queue-engine": patch
---

Declare the repo-root data (metadata/, migrations/, metadata-optional/ and other repo-root files) that these packages' tests read as a turbo `test` input, so a change to that data re-runs them instead of replaying a cached pass. Adds a package `turbo.json` to each; no runtime change.
