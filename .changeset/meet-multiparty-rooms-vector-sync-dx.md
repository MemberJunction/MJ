---
"@memberjunction/ai-agents": minor
"@memberjunction/ai-vector-sync": minor
"@memberjunction/core-actions": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-livekit-room": minor
"@memberjunction/ng-mj-livekit-room": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/livekit-room-core": minor
"@memberjunction/livekit-room-server": minor
"@memberjunction/server": minor
---

Make the Meet app's LiveKit Live Room work end-to-end (default agent resolution, realtime model fallback, real backing session row, bridge-driver registration, connect timeout, and active device selection), then build it into a multi-party experience: a pre-join agent picker, threading a target agent so the co-agent actually responds, in-room add/remove of agents, and shareable human invite links. Also improves Entity Vector Sync with a concise per-document summary, verbose-gated pipeline logging, and a batched Entity Record Document existence read that replaces an N+1 query storm.
