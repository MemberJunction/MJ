---
"@memberjunction/ai-bridge-server": patch
---

The bridge engine forgets a bridge's first-frame diagnostics when the bridge stops. The engine remembers which bridges have logged their first inbound media frame and the agent's first outbound audio (verbose-only log lines); it kept one id per bridged call or meeting for the life of the process. A frame that arrives while a bridge is stopping, or after, records nothing and logs no first-frame line. Each bridge still logs the two lines once.
