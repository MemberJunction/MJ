---
"@memberjunction/ai-openai": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/server": patch
"@memberjunction/ng-dashboards": patch
---

fix(memory-leaks): round 18 audit — release OpenAI Live session handlers/timer on Close, delete per-session bridge diag flags, sweep and cap the dial-in rate limiter, detach MCP toolsSynced listener on failure, don't arm the telephony dashboard interval after destroy
