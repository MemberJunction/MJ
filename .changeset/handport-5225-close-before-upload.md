---
"@memberjunction/ng-conversations": patch
"@memberjunction/server": patch
"@memberjunction/ai-agents": patch
---

Close realtime sessions before uploading their recordings, continue teardown when disconnect fails, and warn before leaving while a recording is saving. Store authorized owners' recordings with the server principal after ownership and consent checks, and delete completed recordings' shards with the correct storage listing prefix.
