---
"@memberjunction/server": patch
---

MJServer binds its port before it boots, behind a startup gate: `/healthcheck` answers 503 with the current phase until the server is ready, the new `/healthcheck/live` answers 200 as soon as the port is bound, and other requests and WebSocket upgrades get 503 with `Retry-After`. A port already in use fails at the start of boot, and a failed boot logs the phase it failed in.
