---
"@memberjunction/search-engine": patch
"@memberjunction/server": patch
"@memberjunction/cli-core": patch
"@memberjunction/testing-cli": patch
"@memberjunction/aiengine": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/ai-bridge-discord": patch
"@memberjunction/ai-bridge-googlemeet": patch
"@memberjunction/ai-bridge-livekit": patch
"@memberjunction/ai-bridge-slack": patch
"@memberjunction/ai-bridge-teams": patch
"@memberjunction/ai-bridge-twilio": patch
"@memberjunction/ai-bridge-vonage": patch
"@memberjunction/ai-bridge-webex": patch
"@memberjunction/ai-bridge-zoom": patch
---

Fix dynamic imports that break under pnpm (#3741). SearchEngine declares `@elastic/elasticsearch` and `@xenova/transformers` as optional dependencies and its load errors no longer tell users to add them to their own project. MJServer now logs which resolver module failed to load. Plugin, check-module, AI driver and realtime-bridge native addon names that come from configuration load through `ImportFromHost`, so a package installed by the host application resolves; AIEngine skips the import when the driver class is already registered. A new `check:dynamic-imports` guard fails on a dynamic import of a package the importing package does not declare.
